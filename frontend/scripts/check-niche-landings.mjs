import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
for (const name of ['alder-grain', 'common-space', 'butter-crumb']) {
  const html = readFileSync(new URL('../dist/' + name + '.html', import.meta.url), 'utf8')
  assert.equal((html.match(/<h1\b/g) || []).length, 1)
  assert.equal((html.match(/<section\b/g) || []).length, 8)
  assert.equal((html.match(/<header\b/g) || []).length, 1)
  assert.equal((html.match(/<footer\b/g) || []).length, 1)
  assert(!html.includes('Northline'))
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
  assert.equal(new Set(ids).size, ids.length)
  for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(id), id)
  for (const [, path] of html.matchAll(/src="(\/images\/[^"]+)"/g)) assert(existsSync(new URL('../public' + path, import.meta.url)), path)
  console.log(name + ': 8 existing sections, valid anchors/images, one header/footer/H1.')
}
