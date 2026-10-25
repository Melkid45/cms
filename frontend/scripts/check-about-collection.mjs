import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/about-collection.html')
assert.equal((html.match(/<section class="section about /g) || []).length, 5)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/about/about.scss')))
assert(!/<header\b|<footer\b/.test(read('dist/hero.html')))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) {
  assert(existsSync(new URL(`public${match[1]}`, root)))
}
for (let version = 1; version <= 5; version++) {
  assert(html.includes(`id="about-title-${version}"`))
}
console.log('About collection: 5 sections, shared typography, local assets, no preview header/footer.')
