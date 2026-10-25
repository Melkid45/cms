import Splide from '@splidejs/splide'
import '@splidejs/splide/css/core'
import { projects } from './project-data.js'

document.querySelectorAll('[data-projects-slider]').forEach((element) => {
  new Splide(element, {
    type: 'loop', perPage: 3, perMove: 1, gap: 24,
    arrows: false, pagination: false, keyboard: 'focused', wheel: false,
  }).mount()
})

const dialog = document.querySelector('[data-project-dialog]')
if (dialog) {
  let trigger = null
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-project]')
    if (!button) return
    const project = projects.find((item) => item.id === button.dataset.project)
    if (!project) return
    trigger = button
    dialog.querySelector('#project-dialog-title').textContent = project.title
    const image = dialog.querySelector('[data-project-image]')
    image.src = project.img
    image.alt = project.alt
    dialog.querySelector('[data-project-description]').textContent = project.desc
    const facts = dialog.querySelector('[data-project-facts]')
    facts.replaceChildren()
    for (const [label, value] of [['Project', project.kind], ['Space', project.area], ['Completed', project.year], ['Scope', project.scope]]) {
      const group = document.createElement('div')
      const dt = document.createElement('dt')
      const dd = document.createElement('dd')
      dt.className = 'text text--sm text--muted'
      dd.className = 'text text--md'
      dt.textContent = label
      dd.textContent = value
      group.append(dt, dd)
      facts.append(group)
    }
    dialog.showModal()
  })
  dialog.addEventListener('close', () => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
  })
}
