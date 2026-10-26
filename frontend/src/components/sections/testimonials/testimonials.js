import Splide from '@splidejs/splide'
import '@splidejs/splide/css/core'

document.querySelectorAll('[data-testimonials-slider]').forEach((element) => {
  const variant = element.dataset.testimonialsSlider
  const perPage = variant === 'single' ? 1 : ['stories', 'split'].includes(variant) ? 2 : 3
  const slider = new Splide(element, {
    type: 'loop', perPage, perMove: 1, gap: 24,
    arrows: false, pagination: false, keyboard: 'focused',
    breakpoints: { 1100: { perPage: Math.min(perPage, 2) }, 767: { perPage: 1 } },
    mediaQuery: 'max',
  }).mount()
  const controls = element.closest('[data-testimonials-controls]')
  controls?.querySelector('[data-testimonials-prev]')?.addEventListener('click', () => slider.go('<'))
  controls?.querySelector('[data-testimonials-next]')?.addEventListener('click', () => slider.go('>'))
  if (controls) controls.querySelector('.testimonials__navigation').hidden = false
})

