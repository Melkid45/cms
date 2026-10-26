document.querySelectorAll('.faq').forEach((section) => {
  const items = [...section.querySelectorAll('details.faq__item')]
  if (!items.length) return
  if (!items.some((item) => item.open)) items[0].open = true
  const states = items.map((item) => {
    const answer = item.querySelector('.faq__answer')
    const motion = document.createElement('div')
    motion.className = 'faq__motion'
    answer.before(motion)
    motion.append(answer)
    motion.style.height = item.open ? 'auto' : '0px'
    motion.inert = !item.open
    item.dataset.expanded = String(item.open)
    return { item, motion, expanded: item.open, timer: null }
  })
  states.forEach((state) => {
    const { item, motion } = state
    item.querySelector('summary').addEventListener('click', (event) => {
      event.preventDefault()
      if (state.expanded && states.filter((entry) => entry.expanded).length === 1) return
      clearTimeout(state.timer)
      const height = item.open ? motion.getBoundingClientRect().height : 0
      state.expanded = !state.expanded
      motion.style.height = height + 'px'
      item.open = true
      // Commit the current height so quick reversals also transition smoothly.
      void motion.offsetHeight
      item.dataset.expanded = String(state.expanded)
      motion.inert = !state.expanded
      motion.style.height = (state.expanded ? motion.scrollHeight : 0) + 'px'
      const finish = () => {
        motion.style.height = state.expanded ? 'auto' : '0px'
        item.open = state.expanded
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish()
      else state.timer = setTimeout(finish, 320)
    })
  })
})
