import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const html = readFileSync(new URL('../dist/testimonials-collection.html', import.meta.url), 'utf8')
assert.equal((html.match(/id="testimonials-(?:[1-9]|10)"/g) || []).length, 10)
assert.equal((html.match(/class="splide__slide"/g) || []).length, 15)
assert.equal((html.match(/<blockquote/g) || []).length, 26)
assert.equal((html.match(/class="testimonials__avatar /g) || []).length, 26)
assert.equal((html.match(/data-testimonials-slider/g) || []).length, 4)
assert(html.includes('data-testimonials-prev') && html.includes('data-testimonials-next'))
assert(!/<header|<body[^>]*style=/.test(html))
const scss = readFileSync(new URL('../src/components/sections/testimonials/testimonials.scss', import.meta.url), 'utf8')
assert(!/font-size|font-family/.test(scss))
console.log('Testimonials: 10 variants, 4 sliders, 26 quotes with accent avatars, external controls.')

