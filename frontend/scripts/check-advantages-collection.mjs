import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/advantages-collection.html')
assert.equal((html.match(/<section class="section advantages /g) || []).length, 7)
assert.equal((html.match(/class="advantages__icon"/g) || []).length, 12)
assert.equal((html.match(/data-advantages-tab>/g) || []).length, 4)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/advantages/advantages.scss')))
assert(html.includes('class="section-stack"'))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) {
  assert(existsSync(new URL(`public${match[1]}`, root)))
}
console.log('Advantages: 7 variants, 12 Lucide icons, 4 interactive panels, shared typography, local images.')
