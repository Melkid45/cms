document.documentElement.classList.add('is-ready')


/* FAQ */

const faqItems = document.querySelectorAll('.faq--item')

function setFaqState(item, expanded) {
  const trigger = item.querySelector('.faq--item-top')
  const content = item.querySelector('.faq--item-bot')

  item.classList.toggle('current', expanded)
  trigger?.setAttribute('aria-expanded', String(expanded))
  if (content) content.style.maxHeight = expanded ? `${content.scrollHeight}px` : '0px'
}

faqItems.forEach((item, index) => {
  const trigger = item.querySelector('.faq--item-top')
  const content = item.querySelector('.faq--item-bot')
  const contentId = `faq-answer-${index + 1}`

  if (!trigger || !content) return

  trigger.setAttribute('role', 'button')
  trigger.setAttribute('tabindex', '0')
  trigger.setAttribute('aria-controls', contentId)
  trigger.setAttribute('aria-expanded', 'false')
  content.id = contentId

  const toggle = () => {
    const willExpand = !item.classList.contains('current')
    faqItems.forEach((faq) => setFaqState(faq, false))
    setFaqState(item, willExpand)
  }

  trigger.addEventListener('click', toggle)
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggle()
  })
})


import { createIcons, Check, ChevronLeft, ChevronRight, Plus, Quote } from 'lucide';

createIcons({
  icons: {
    Check,
    ChevronLeft,
    ChevronRight,
    Plus,
    Quote
  }
});

/* Testimonials */

const testimonials = document.querySelector('[data-testimonials]')
const testimonialViewport = document.querySelector('[data-testimonials-viewport]')
const testimonialTrack = document.querySelector('[data-testimonials-track]')
const testimonialPrev = document.querySelector('[data-testimonial-prev]')
const testimonialNext = document.querySelector('[data-testimonial-next]')

function moveTestimonials(direction) {
  if (!testimonialTrack || !testimonialViewport) return

  const card = testimonialTrack.querySelector('.testimonial-card')
  const styles = window.getComputedStyle(testimonialTrack)
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 24
  const distance = card ? card.getBoundingClientRect().width + gap : testimonialViewport.clientWidth

  testimonialViewport.scrollBy({ left: distance * direction, behavior: 'smooth' })
}

function updateTestimonialControls() {
  if (!testimonialViewport || !testimonialPrev || !testimonialNext) return

  const maxScroll = testimonialViewport.scrollWidth - testimonialViewport.clientWidth
  testimonialPrev.disabled = testimonialViewport.scrollLeft <= 2
  testimonialNext.disabled = testimonialViewport.scrollLeft >= maxScroll - 2
}

testimonialPrev?.addEventListener('click', () => moveTestimonials(-1))
testimonialNext?.addEventListener('click', () => moveTestimonials(1))
testimonialViewport?.addEventListener('scroll', updateTestimonialControls, { passive: true })
testimonialViewport?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  moveTestimonials(event.key === 'ArrowRight' ? 1 : -1)
})

if (testimonialViewport && testimonials) {
  let pointerStart = 0
  let scrollStart = 0
  let dragging = false

  testimonialViewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse') return
    dragging = true
    pointerStart = event.clientX
    scrollStart = testimonialViewport.scrollLeft
    testimonialViewport.classList.add('is-dragging')
    testimonialViewport.setPointerCapture(event.pointerId)
  })

  testimonialViewport.addEventListener('pointermove', (event) => {
    if (!dragging) return
    testimonialViewport.scrollLeft = scrollStart - (event.clientX - pointerStart)
  })

  const finishDrag = (event) => {
    if (!dragging) return
    dragging = false
    testimonialViewport.classList.remove('is-dragging')
    if (testimonialViewport.hasPointerCapture(event.pointerId)) {
      testimonialViewport.releasePointerCapture(event.pointerId)
    }
  }

  testimonialViewport.addEventListener('pointerup', finishDrag)
  testimonialViewport.addEventListener('pointercancel', finishDrag)
  new ResizeObserver(updateTestimonialControls).observe(testimonialViewport)
  updateTestimonialControls()
}

/* Timeline — interaction model adapted from Harbstone */

const timeline = document.querySelector('[data-timeline]')

if (timeline) {
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
    const lineWidth = Math.max(track.scrollWidth - lineStart, 0)
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
    if (reducedMotion.matches || !points.length) return
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
}
