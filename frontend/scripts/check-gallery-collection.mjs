import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/gallery-collection.html')
assert.equal((html.match(/<section class="section gallery /g) || []).length, 5)
assert.equal((html.match(/<dialog\b/g) || []).length, 1)
assert(!/<header\b|<footer\b|<figcaption\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/gallery/gallery.scss')))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) assert(existsSync(new URL(`public${match[1]}`, root)))
console.log('Gallery: 5 variants, valid local photos, no captions, shared typography and native lightbox.')
