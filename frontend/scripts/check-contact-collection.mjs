import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const html = readFileSync(new URL('../dist/contact-collection.html', import.meta.url), 'utf8')
assert.equal((html.match(/id="contact-[1-8]"/g) || []).length, 8)
assert.equal((html.match(/<form /g) || []).length, 2)
assert.equal((html.match(/ required/g) || []).length, 6)
assert(html.includes('role="status"') && html.includes('No data is sent.'))
const css = readFileSync(new URL('../src/components/sections/contact/contact.scss', import.meta.url), 'utf8')
assert(!/font-size|font-family/.test(css))
console.log('Contact: 8 variants, shared forms, 6 required fields, explicit demo submission.')

