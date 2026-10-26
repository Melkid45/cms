import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const html = readFileSync(new URL('../dist/faq-collection.html', import.meta.url), 'utf8')
assert.equal((html.match(/id="faq-[1-7]"/g) || []).length, 7)
assert.equal((html.match(/<details/g) || []).length, 36)
assert.equal((html.match(/<summary/g) || []).length, 36)
assert(!/<header/.test(html))
const css = readFileSync(new URL('../src/components/sections/faq/faq.scss', import.meta.url), 'utf8')
assert(!/font-size|font-family/.test(css))
const js = readFileSync(new URL('../src/components/sections/faq/faq.js', import.meta.url), 'utf8')
assert(js.includes('event.preventDefault()') && js.includes('entry.expanded).length === 1'))
assert(css.includes('transition: height 280ms'))
console.log('FAQ: 7 variants, 36 native disclosures, at least one open per section.')

