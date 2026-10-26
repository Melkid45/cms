import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/services-collection.html')
assert.equal((html.match(/<section class="section services /g) || []).length, 8)
assert.equal((html.match(/class="splide__slide services__slide services__card"/g) || []).length, 6)
assert(html.includes('class="splide__track"'))
assert.equal((html.match(/<details\b/g) || []).length, 3)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/services/services.scss')))
assert(html.includes('class="section-stack"'))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) {
  assert(existsSync(new URL(`public${match[1]}`, root)))
}
console.log('Services: 8 variants, 6 slider cards, 3 native disclosures, shared typography, valid local images, no preview chrome.')
