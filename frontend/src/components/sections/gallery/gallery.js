import Splide from '@splidejs/splide'
import '@splidejs/splide/css/core'

document.querySelectorAll('[data-gallery-slider]').forEach((element) => {
  const panorama = element.dataset.gallerySlider === 'panorama'
  new Splide(element, {
    type: 'loop', perPage: panorama ? 1 : 3, perMove: 1, gap: 24,
    arrows: false, pagination: false, keyboard: 'focused', wheel: false,
  }).mount()
})

const dialog = document.querySelector('[data-gallery-dialog]')
if (dialog) {
  let trigger = null
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-gallery-photo]')
    if (!button) return
    const source = button.querySelector('img')
    if (!source) return
    trigger = button
    const image = dialog.querySelector('[data-gallery-image]')
    image.src = source.currentSrc || source.src
    image.alt = source.alt
    dialog.showModal()
  })
  dialog.addEventListener('close', () => {
    if (trigger?.isConnected) trigger.focus({ preventScroll: true })
  })
}
