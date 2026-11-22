import Splide from '@splidejs/splide'
import '@splidejs/splide/css/core'
import './explorations.scss'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
document.querySelectorAll('[data-projects-spotlight]').forEach(element => {
  const section = element.closest('section')
  const slider = new Splide(element, {
    type: 'loop', perPage: 1, perMove: 1, gap: 40,
    arrows: false, pagination: false, keyboard: 'focused',
    speed: reducedMotion.matches ? 0 : 550,
    reducedMotion: { speed: 0, rewindSpeed: 0, autoplay: 'pause' },
  }).mount()
  section.querySelector('[data-spotlight-prev]').addEventListener('click', () => slider.go('<'))
  section.querySelector('[data-spotlight-next]').addEventListener('click', () => slider.go('>'))
})
