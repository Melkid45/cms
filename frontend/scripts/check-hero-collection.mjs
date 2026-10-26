import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/hero.html')
assert.equal((html.match(/<section class="hero /g) || []).length, 8)
assert(!html.includes('collection-label'))
assert(!html.includes('@include'))
assert(!html.includes('style='))
assert(!/font-size|font-family/.test(read('src/components/sections/hero/hero.scss')))
for (const match of html.matchAll(/src="(\/images\/hero\/[^" ]+)"/g)) {
  assert(existsSync(new URL(`public${match[1]}`, root)))
}
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  assert(html.includes(`id="${match[1]}"`))
}
assert(html.includes('hero--image-led') && html.includes('hero--overlay'))
assert(html.includes('hero--editorial'))
console.log('Hero collection: 8 sections, resolved includes, local assets, valid anchors, shared type scale.')
