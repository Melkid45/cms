document.querySelectorAll('[data-site-header]').forEach((header) => {
  const toggle = header.querySelector('[data-menu-toggle]')
  const panel = document.getElementById(toggle.getAttribute('aria-controls'))
  const background = [...document.querySelectorAll('main, body > footer')]
  let previousOverflow = false
  const updateHeight = () => document.documentElement.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px')
  new ResizeObserver(updateHeight).observe(header)
  updateHeight()
  toggle.hidden = false
  const close = (restore = true) => {
    panel.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', 'Open menu')
    if (!previousOverflow) document.documentElement.removeAttribute('data-site-menu-open')
    background.forEach((entry) => { entry.inert = false })
    if (restore) toggle.focus({ preventScroll: true })
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return close()
    previousOverflow = document.documentElement.hasAttribute('data-site-menu-open')
    panel.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
    toggle.setAttribute('aria-label', 'Close menu')
    document.documentElement.setAttribute('data-site-menu-open', '')
    background.forEach((entry) => { entry.inert = true })
    panel.querySelector('a')?.focus({ preventScroll: true })
  })
  panel.addEventListener('click', (event) => { if (event.target.closest('a')) close(false) })
  document.addEventListener('keydown', (event) => {
    if (panel.hidden) return
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const focusable = [...header.querySelectorAll('a,button'), ...panel.querySelectorAll('a,button')]
      .filter((element) => element.getClientRects().length && !element.hidden)
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  })
  window.matchMedia('(max-width: 1024px)').addEventListener('change', (event) => {
    if (!event.matches && !header.classList.contains('site-header--compact') && !panel.hidden) close()
  })
})

