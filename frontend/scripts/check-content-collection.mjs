import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/content-collection.html')
assert.equal((html.match(/<section class="section content /g) || []).length, 5)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/content/content.scss')))
assert(!html.includes('<video'))
assert.equal((html.match(/<details\b/g) || []).length, 3)
for (const match of html.matchAll(/(?:src|poster)="(\/(?:images|videos)\/[^" ]+)"/g)) {
  assert(existsSync(new URL(`public${match[1]}`, root)))
}
console.log('Content: 5 variants, shared typography, local images, native disclosures, no player.')
