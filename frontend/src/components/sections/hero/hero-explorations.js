import '../../layout/header/header.js'

// Each preview owns its header height, including double and floating headers.
// The production header keeps its existing fixed positioning; only the comparison
// page scopes sticky positioning so all four compositions can be viewed together.
const names = ['Maison®', 'Axiom®', 'Forme®', 'Forma Studio®']
document.querySelectorAll('.hero-scene').forEach((scene, index) => {
  const header = scene.querySelector('[data-site-header]')
  const brand = header.querySelector('.site-header__brand')
  brand.textContent = names[index]
  brand.setAttribute('aria-label', `${names[index].replace('®', '')} home`)
  const measure = () => scene.style.setProperty('--header-height', `${header.getBoundingClientRect().height}px`)
  new ResizeObserver(measure).observe(header)
  measure()
})
