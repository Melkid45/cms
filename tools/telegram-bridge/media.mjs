import { writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const MAX_BYTES = 20 * 1024 * 1024;
export class MediaError extends Error {}

export function imageAttachment(message) {
  if (message?.photo?.length) return message.photo.reduce((a, b) => a.width * a.height > b.width * b.height ? a : b);
  if (['image/jpeg', 'image/png', 'image/webp'].includes(message?.document?.mime_type)) return message.document;
  return null;
}
export function imageExtension(bytes) {
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return '.jpg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  throw new MediaError('Картинка должна быть JPEG, PNG или WebP. Пришли её как фото или файл изображения.');
}
export async function readLimited(response, limit = MAX_BYTES) {
  if (!response.ok || !response.body) throw new MediaError('Не удалось скачать вложение. Пришли его ещё раз.');
  if (Number(response.headers.get('content-length')) > limit) { await response.body.cancel(); throw new MediaError('Вложение слишком большое. Лимит — 20 МБ.'); }
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new MediaError('Вложение слишком большое. Лимит — 20 МБ.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function downloadAttachment(file, { api, token, directory, name, image = false, fetchImpl = fetch }) {
  if (file.file_size > MAX_BYTES) throw new MediaError('Вложение слишком большое. Лимит — 20 МБ.');
  let bytes;
  try {
    const metadata = await api('getFile', { file_id: file.file_id });
    // Never use a remote filename as a local path or allow URL traversal.
    if (!/^[a-zA-Z0-9_./-]+$/.test(metadata.file_path || '') || metadata.file_path.split('/').includes('..')) throw Error();
    const response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${metadata.file_path}`, { signal: AbortSignal.timeout(60000), redirect: 'error' });
    bytes = await readLimited(response);
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError('Не удалось скачать вложение из Telegram. Попробуй отправить его ещё раз.');
  }
  const path = resolve(directory, name + (image ? imageExtension(bytes) : '.audio'));
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}
export async function transcribe(path, { directory, model, whisper = '/opt/homebrew/bin/whisper-cli', ffmpeg = '/opt/homebrew/bin/ffmpeg', language = 'auto' }) {
  const wav = resolve(directory, 'voice.wav');
  const output = resolve(directory, 'transcript');
  try {
    await exec(ffmpeg, ['-nostdin', '-v', 'error', '-y', '-i', path, '-t', '301', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 60000 });
    await exec(whisper, ['-m', model, '-f', wav, '-l', language, '-otxt', '-of', output, '-nt', '-t', '4'], { timeout: 10 * 60000, maxBuffer: 4 * 1024 * 1024 });
    const text = (await readFile(output + '.txt', 'utf8')).trim();
    if (!text || /^\[.*\]$/.test(text)) throw new MediaError('Не удалось разобрать речь. Запиши голосовое ещё раз или напиши текстом.');
    return text;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError('Не удалось расшифровать голосовое. Задача не запущена; попробуй ещё раз или напиши текстом.');
  }
}
