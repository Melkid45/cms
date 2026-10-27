import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { capture, publish } from './publish.mjs';
import { pageLinks, deploymentReady, waitForDeployment } from './deployment.mjs';
const exec = promisify(execFile);
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'harbstone-publish-'));
  const repo = join(root, 'repo'), remote = join(root, 'remote.git');
  const git = async (...args) => (await exec('git', args, { cwd: repo })).stdout.trim();
  try {
    await mkdir(repo); await exec('git', ['init', '--bare', remote]);
    await git('init', '-b', 'main'); await git('config', 'user.name', 'Bridge Test'); await git('config', 'user.email', 'test@example.com');
    await writeFile(join(repo, 'page.html'), 'before'); await git('add', '.'); await git('commit', '-m', 'initial'); await git('remote', 'add', 'origin', remote); await git('push', '-u', 'origin', 'main');
    await fn({ repo, remote, git, options: { remoteUrl: remote, message: 'test update', validate: async () => {} } });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('publishes only new task changes and preserves pre-existing work', () => fixture(async ({ repo, git, options }) => {
  await writeFile(join(repo, 'owner-draft.txt'), 'private draft');
  const before = await capture(repo);
  await writeFile(join(repo, 'page.html'), 'updated');
  const result = await publish(repo, before, options);
  assert.deepEqual(result.files, ['page.html']);
  assert.equal(await git('rev-parse', 'origin/main'), result.commit);
  assert.equal(await git('status', '--porcelain'), '?? owner-draft.txt');
  assert.equal(await readFile(join(repo, 'owner-draft.txt'), 'utf8'), 'private draft');
}));
test('refuses changed baseline files, failed checks, staged files and diverged history', () => fixture(async ({ repo, git, options }) => {
  await writeFile(join(repo, 'page.html'), 'owner work');
  let before = await capture(repo); await writeFile(join(repo, 'page.html'), 'bot overwrote');
  await assert.rejects(publish(repo, before, options), /ранее несохранёнными/);
  await git('restore', 'page.html'); before = await capture(repo); await writeFile(join(repo, 'page.html'), 'bot work');
  await assert.rejects(publish(repo, before, { ...options, validate: async () => { throw Error('broken build'); } }), /не прошли/);
  assert.equal(await git('rev-parse', 'HEAD'), before.head);
  await git('add', 'page.html'); await assert.rejects(publish(repo, before, options), /index/);
  await git('reset'); await git('restore', 'page.html');
  await writeFile(join(repo, 'local.txt'), 'local'); await git('add', '.'); await git('commit', '-m', 'unpublished owner commit');
  before = await capture(repo); await writeFile(join(repo, 'page.html'), 'bot work');
  await assert.rejects(publish(repo, before, options), /разошлись/);
}));
test('read-only requests never commit or push', () => fixture(async ({ repo, options }) => {
  const before = await capture(repo);
  assert.equal(await publish(repo, before, options), null);
}));
test('links and deployment check require the expected commit, not just HTTP 200', async () => {
  assert.deepEqual(pageLinks(['frontend/layout-header-6.html']), ['https://harbcms.vercel.app/layout-header-6.html']);
  assert(pageLinks(['frontend/src/components/a.html']).includes('https://harbstone-admin.vercel.app/dashboard/pages'));
  assert.equal(await deploymentReady('new', async () => new Response(JSON.stringify({ commit: 'old' }))), false);
  assert.equal(await deploymentReady('new', async () => new Response(JSON.stringify({ commit: 'new' }))), true);
  const urls=[];assert.equal(await deploymentReady('new', async url=>{urls.push(url);return Response.json({commit:url.includes('/api/release')?'old':'new'});},['frontend','admin']),false);assert.equal(urls.length,2);
  assert.equal(await waitForDeployment('new', { timeout: 1, interval: 1, check: async () => false }), false);
});
