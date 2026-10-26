import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/process-collection.html')
assert.equal((html.match(/<section class="section process /g) || []).length, 9)
assert.equal((html.match(/class="process__icon"/g) || []).length, 4)
assert.equal((html.match(/data-process-tab>/g) || []).length, 4)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/process/process.scss')))
for (const match of html.matchAll(/src="(\/images\/[^" ]+)"/g)) assert(existsSync(new URL(`public${match[1]}`, root)))
console.log('Process: 9 variants, 4 Lucide icons, 4 interactive stages, shared typography, local assets.')
