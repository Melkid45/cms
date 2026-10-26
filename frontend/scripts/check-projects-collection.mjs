import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { projects } from '../src/components/sections/projects/project-data.js'
const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')
const html = read('dist/projects-collection.html')
assert.equal((html.match(/<section class="section projects /g) || []).length, 8)
assert.equal((html.match(/<dialog\b/g) || []).length, 1)
assert(!/<header\b|<footer\b|@include|style=/.test(html))
assert(!/font-size|font-family/.test(read('src/components/sections/projects/projects.scss')))
for (const match of html.matchAll(/data-project="([^"]+)"/g)) assert(projects.some(p => p.id === match[1]))
for (const project of projects) assert(existsSync(new URL(`public${project.img}`, root)))
console.log('Projects: 8 variants, valid project data/images, shared typography and one native dialog.')
