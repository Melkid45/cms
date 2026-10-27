import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_BYTES, MediaError, imageAttachment, imageExtension, readLimited, downloadAttachment } from './media.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=', 'base64');
test('largest Telegram photo and supported image documents', () => {
  assert.equal(imageAttachment({ photo: [{ width: 10, height: 10, file_id: 'small' }, { width: 50, height: 50, file_id: 'large' }] }).file_id, 'large');
  assert.equal(imageAttachment({ document: { mime_type: 'image/png', file_id: 'original' } }).file_id, 'original');
  assert.equal(imageAttachment({ document: { mime_type: 'application/pdf' } }), null);
});
test('reject disguised files and excessive downloads, including unannounced size', async () => {
  assert.equal(imageExtension(png), '.png');
  assert.throws(() => imageExtension(Buffer.from('<script>')), MediaError);
  await assert.rejects(readLimited(new Response('123456'), 5), MediaError);
  await assert.rejects(readLimited(new Response('small', { headers: { 'Content-Length': String(MAX_BYTES + 1) } })), MediaError);
});
test('download uses random local destination, ignores Telegram filename, preserves image bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'harbstone-media-test-'));
  try {
    const path = await downloadAttachment({ file_id: 'photo' }, {
      api: async () => ({ file_path: 'photos/file.png' }), token: 'fake', directory, name: 'image-0', image: true,
      fetchImpl: async () => new Response(png),
    });
    assert.equal(path, join(directory, 'image-0.png'));
    assert.deepEqual(await readFile(path), png);
    await assert.rejects(downloadAttachment({ file_id: 'photo' }, {
      api: async () => ({ file_path: '../config.json' }), token: 'fake', directory, name: 'image', image: true,
      fetchImpl: () => { throw Error('must not fetch'); },
    }), MediaError);
    await assert.rejects(downloadAttachment({ file_id: 'photo' }, {
      api: async () => { throw Error('SECRET_TOKEN in transport error'); }, token: 'fake', directory, name: 'image',
    }), error => error instanceof MediaError && !error.message.includes('SECRET_TOKEN'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
