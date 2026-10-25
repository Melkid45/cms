document.querySelectorAll('[data-process-tabs]').forEach((section) => {
  const tabs = [...section.querySelectorAll('[data-process-tab]')]
  const panels = [...section.querySelectorAll('[data-process-panel]')]
  const list = section.querySelector('[data-process-tablist]')
  if (!list || tabs.length !== panels.length || !tabs.length) return
  list.setAttribute('role', 'tablist')
  list.setAttribute('aria-label', 'Project stages')
  const activate = (index, focus = false) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index))
      tab.tabIndex = i === index ? 0 : -1
      panels[i].classList.toggle('is-active', i === index)
      panels[i].inert = i !== index
      panels[i].setAttribute('aria-hidden', String(i !== index))
    })
    if (focus) tabs[index].focus({ preventScroll: true })
  }
  tabs.forEach((tab, index) => {
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', panels[index].id)
    panels[index].setAttribute('role', 'tabpanel')
    panels[index].setAttribute('aria-labelledby', tab.id)
    panels[index].tabIndex = 0
    tab.addEventListener('click', () => activate(index))
    tab.addEventListener('keydown', (event) => {
      const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key]
      if (target === undefined) return
      event.preventDefault()
      activate(target, true)
    })
  })
  activate(0)
  section.classList.add('is-enhanced')
})
