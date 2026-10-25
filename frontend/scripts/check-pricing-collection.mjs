import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/pricing-collection.html')
assert.equal((html.match(/<section class="section pricing /g) || []).length, 6)
assert.equal((html.match(/class="pricing__horizontal-row"/g) || []).length, 3)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/pricing/pricing.scss')))
assert(html.includes('scope="col"') && html.includes('scope="row"'))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) assert(existsSync(new URL(`public${match[1]}`, root)))
console.log('Pricing: 6 variants, 3 horizontal packages, shared typography, semantic comparison table, local photo.')
