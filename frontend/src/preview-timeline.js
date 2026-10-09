// Same timeline interaction as the original page, scoped to Tailwind previews.
document.querySelectorAll('[data-timeline]').forEach((timeline) => {
  const viewport = timeline.querySelector('[data-timeline-viewport]')
  const track = timeline.querySelector('[data-timeline-track]')
  const fill = timeline.querySelector('[data-timeline-fill]')
  const points = [...timeline.querySelectorAll('[data-timeline-point]')]
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const duration = Number(timeline.dataset.timelineDuration) || 3200
  let activeIndex = Math.max(points.findIndex((point) => point.classList.contains('is-active')), 0)
  let animationFrame = 0
  let startedAt = 0
  let paused = false

  const pointCenter = (index) => {
    const point = points[index]
    const marker = point?.querySelector('.timeline__marker')
    if (!point || !marker) return 0
    return point.parentElement.offsetLeft + marker.offsetLeft + marker.offsetWidth / 2
  }

  const updateGeometry = () => {
    if (!track || !fill || !points.length) return
    const lineStart = pointCenter(0)
    const lastItem = points.at(-1).parentElement
    const lineWidth = Math.max(lastItem.offsetLeft + lastItem.offsetWidth - lineStart, 0)
    track.style.setProperty('--timeline-line-start', `${lineStart}px`)
    track.style.setProperty('--timeline-line-width', `${lineWidth}px`)
    fill.style.setProperty('--timeline-fill', `${Math.max(pointCenter(activeIndex) - lineStart, 0)}px`)
  }

  const revealPoint = (index) => {
    if (!viewport || !points[index]) return
    const item = points[index].parentElement
    const target = item.offsetLeft - (viewport.clientWidth - item.offsetWidth) / 2
    viewport.scrollTo({ left: Math.max(target, 0), behavior: reducedMotion.matches ? 'auto' : 'smooth' })
  }

  const selectPoint = (index, shouldReveal = true) => {
    activeIndex = (index + points.length) % points.length
    points.forEach((point, pointIndex) => {
      const active = pointIndex === activeIndex
      point.classList.toggle('is-active', active)
      point.classList.toggle('is-past', pointIndex < activeIndex)
      point.setAttribute('aria-pressed', String(active))
      if (active) point.setAttribute('aria-current', 'step')
      else point.removeAttribute('aria-current')
    })
    updateGeometry()
    if (shouldReveal) revealPoint(activeIndex)
    startedAt = 0
  }

  const animateTimeline = (timestamp) => {
    if (paused || reducedMotion.matches || !track || !fill || !points.length) return
    if (!startedAt) startedAt = timestamp

    const progress = Math.min((timestamp - startedAt) / duration, 1)
    const lineStart = pointCenter(0)
    const startWidth = Math.max(pointCenter(activeIndex) - lineStart, 0)
    const nextIndex = (activeIndex + 1) % points.length
    const endWidth = nextIndex === 0
      ? Number.parseFloat(getComputedStyle(track).getPropertyValue('--timeline-line-width')) || startWidth
      : Math.max(pointCenter(nextIndex) - lineStart, 0)

    fill.style.setProperty('--timeline-fill', `${startWidth + (endWidth - startWidth) * progress}px`)

    if (progress >= 1) {
      selectPoint(nextIndex)
    }

    animationFrame = requestAnimationFrame(animateTimeline)
  }

  const startTimeline = () => {
    if (reducedMotion.matches || document.hidden || timeline.matches(':hover') || timeline.contains(document.activeElement) || !points.length) return
    paused = false
    startedAt = 0
    cancelAnimationFrame(animationFrame)
    animationFrame = requestAnimationFrame(animateTimeline)
  }

  const pauseTimeline = () => {
    paused = true
    startedAt = 0
    cancelAnimationFrame(animationFrame)
  }

  points.forEach((point, index) => {
    point.addEventListener('click', () => {
      selectPoint(index)
      startTimeline()
    })
  })

  viewport?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    selectPoint(activeIndex + (event.key === 'ArrowRight' ? 1 : -1))
    startTimeline()
  })

  timeline.addEventListener('pointerenter', pauseTimeline)
  timeline.addEventListener('pointerleave', startTimeline)
  timeline.addEventListener('focusin', pauseTimeline)
  timeline.addEventListener('focusout', (event) => {
    if (!timeline.contains(event.relatedTarget)) startTimeline()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseTimeline()
    else startTimeline()
  })
  new ResizeObserver(updateGeometry).observe(track)
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) pauseTimeline()
    else startTimeline()
  })

  selectPoint(activeIndex)
  startTimeline()
})
