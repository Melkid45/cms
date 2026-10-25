import Splide from '@splidejs/splide'
import '@splidejs/splide/css/core'

// Switch synchronously: native opening followed by an async toggle handler
// briefly left two panels open and triggered browser scroll anchoring.
document.querySelectorAll('[data-services-accordion]').forEach((section) => {
  const items = [...section.querySelectorAll('details')]
  const image = section.querySelector('.services__visual img')
  const activate = (selected) => {
    items.forEach((item) => { item.open = item === selected })
    if (image && selected.dataset.image) {
      image.src = selected.dataset.image
      image.alt = selected.dataset.alt || ''
    }
  }
  const initial = items.find((item) => item.open) || items[0]
  if (initial) activate(initial)
  items.forEach((item) => {
    item.querySelector('summary')?.addEventListener('click', (event) => {
      event.preventDefault()
      if (!item.open) {
        const scrollX = window.scrollX
        const scrollY = window.scrollY
        activate(item)
        // Resolve the new layout before restoring the current reading position.
        section.getBoundingClientRect()
        window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
      }
    })
  })
})

// Splide owns dragging, snapping, responsive sizing and keyboard navigation.
document.querySelectorAll('[data-services-slider]').forEach((element) => {
  new Splide(element, {
    type: 'loop',
    perPage: 3,
    perMove: 1,
    gap: 24,
    arrows: false,
    pagination: false,
    drag: true,
    keyboard: 'focused',
    wheel: false,
  }).mount()
})
