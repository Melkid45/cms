import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const collection = read('../dist/layout-collection.html')
assert.equal((collection.match(/<iframe /g) || []).length, 6)
assert.equal((collection.match(/<footer /g) || []).length, 5)
for (let n = 1; n <= 6; n++) {
  const page = read('../dist/layout-header-' + n + '.html')
  assert.equal((page.match(/<header /g) || []).length, 1)
  assert(page.includes('aria-controls="header-menu-' + n + '"'))
  assert(page.includes('id="header-menu-' + n + '"'))
}
for (const family of ['header', 'footer']) {
  const css = read('../src/components/layout/' + family + '/' + family + '.scss')
  assert(!/font-size|font-family/.test(css))
}
assert(!collection.includes('design by'))
console.log('Layout: 6 fixed headers, 5 footers, isolated previews, shared typography.')
