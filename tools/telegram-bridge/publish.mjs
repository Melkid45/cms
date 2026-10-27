import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readlink, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
export class PublishError extends Error {}
async function git(repo, args) {
  return (await exec('git', args, { cwd: repo, timeout: 120000, maxBuffer: 8 * 1024 * 1024 })).stdout.trimEnd();
}
async function changes(repo) {
  const tracked = await git(repo, ['diff', '--name-only', '-z', 'HEAD']);
  const untracked = await git(repo, ['ls-files', '--others', '--exclude-standard', '-z']);
  const paths = [...new Set((tracked + '\0' + untracked).split('\0').filter(Boolean))].sort();
  const files = {};
  for (const path of paths) {
    try {
      const stat = await lstat(resolve(repo, path));
      const data = stat.isSymbolicLink() ? await readlink(resolve(repo, path)) : await readFile(resolve(repo, path));
      files[path] = `${stat.mode}:${createHash('sha256').update(data).digest('hex')}`;
    } catch (error) { if (error.code !== 'ENOENT') throw error; files[path] = 'deleted'; }
  }
  return files;
}
export async function capture(repo) {
  return {
    head: await git(repo, ['rev-parse', 'HEAD']),
    branch: await git(repo, ['branch', '--show-current']),
    staged: await git(repo, ['diff', '--cached', '--name-only']),
    files: await changes(repo),
  };
}
export async function publish(repo, before, { remoteUrl, branch = 'main', message, validate, onCommit = async () => {} } = {}) {
  const after = await capture(repo);
  const touched = Object.keys(after.files).filter(path => after.files[path] !== before.files[path]);
  const changedBaseline = Object.keys(before.files).some(path => before.files[path] !== after.files[path]);
  if (changedBaseline) throw new PublishError('Автопубликация остановлена: затронуты файлы с ранее несохранёнными изменениями. Нужна проверка владельца.');
  if (!touched.length) return null;
  if (before.head !== after.head || before.branch !== branch || after.branch !== branch || before.staged || after.staged) throw new PublishError('Автопубликация остановлена: изменились ветка, история или Git index. Нужна проверка владельца.');
  if (await git(repo, ['remote', 'get-url', 'origin']) !== remoteUrl || await git(repo, ['remote', 'get-url', '--push', 'origin']) !== remoteUrl) throw new PublishError('Git remote отличается от настроенного проекта. Push не выполнен.');
  await git(repo, ['fetch', 'origin', branch]);
  if (await git(repo, ['rev-parse', `refs/remotes/origin/${branch}`]) !== before.head) throw new PublishError('Локальная и удалённая ветки разошлись. Автоматический merge или force push не выполняется.');
  try {
    await git(repo, ['diff', '--check']);
    await validate(touched);
  } catch { throw new PublishError('Проверки проекта не прошли. Изменения остались локально; commit и push не выполнены.'); }
  const checked = await capture(repo);
  if (checked.head !== before.head || checked.staged || checked.branch !== branch || JSON.stringify(checked.files) !== JSON.stringify(after.files)) throw new PublishError('Файлы изменились во время проверки. Автопубликация остановлена.');
  await git(repo, ['add', '--', ...touched]);
  try { await git(repo, ['commit', '-m', message]); }
  catch { throw new PublishError('Не удалось создать commit. Изменения остались локально; проверь Git index.'); }
  const commit = await git(repo, ['rev-parse', 'HEAD']);
  await onCommit(commit);
  try { await git(repo, ['push', 'origin', `HEAD:refs/heads/${branch}`]); }
  catch { throw new PublishError(`Commit ${commit.slice(0, 8)} создан, но push не прошёл. Изменения сохранены локально; нужна проверка подключения Git.`); }
  return { commit, files: touched };
}

export async function validateProject(repo, paths) {
  const run = (command, args, cwd = repo) => exec(command, args, { cwd, timeout: 10 * 60000, maxBuffer: 8 * 1024 * 1024 });
  if (paths.some(path => path.startsWith('frontend/'))) {
    await run('npm', ['run', 'build'], resolve(repo, 'frontend'));
    const { readdir } = await import('node:fs/promises');
    for (const file of (await readdir(resolve(repo, 'frontend/scripts'))).filter(name => /^check-.*-collection\.mjs$/.test(name) || name === 'check-niche-landings.mjs')) {
      await run('node', [`scripts/${file}`], resolve(repo, 'frontend'));
    }
  }
  if (paths.some(path => path.startsWith('admin/'))) {
    await run('npm', ['run', 'lint'], resolve(repo, 'admin'));
    await run('npm', ['run', 'build'], resolve(repo, 'admin'));
  }
  if (paths.some(path => path.startsWith('tools/telegram-bridge/'))) throw new Error('Bridge changes require owner review');
}
