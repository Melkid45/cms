document.documentElement.classList.add('is-ready')


/* FAQ */

const faqItems = document.querySelectorAll('.faq--item')

function setFaqState(item, expanded) {
  const trigger = item.querySelector('.faq--item-top')
  const content = item.querySelector('.faq--item-bot')

  item.classList.toggle('current', expanded)
  trigger?.setAttribute('aria-expanded', String(expanded))
  if (content) {
    content.style.maxHeight = expanded ? `${content.scrollHeight}px` : '0px'
    content.setAttribute('aria-hidden', String(!expanded))
  }
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
  content.setAttribute('aria-hidden', 'true')

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

window.addEventListener('resize', () => {
  faqItems.forEach((item) => {
    if (item.classList.contains('current')) setFaqState(item, true)
  })
})

import { createIcons, Check, ChevronLeft, ChevronRight, Plus, Quote, Play } from 'lucide';

createIcons({
  icons: {
    Check,
    ChevronLeft,
    ChevronRight,
    Plus,
    Quote,
    Play
  }
});

/* Sliders */

document.querySelectorAll('[data-slider]').forEach((slider) => {
  const viewport = slider.querySelector('[data-slider-viewport]')
  const track = slider.querySelector('[data-slider-track]')
  const previous = slider.querySelector('[data-slider-prev]')
  const next = slider.querySelector('[data-slider-next]')

  if (!viewport || !track) return

  const move = (direction) => {
    const item = track.querySelector('[data-slider-item]')
    const styles = window.getComputedStyle(track)
    const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0
    const distance = item ? item.getBoundingClientRect().width + gap : viewport.clientWidth

    viewport.scrollBy({ left: distance * direction, behavior: 'smooth' })
  }

  const updateControls = () => {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth
    if (previous) previous.disabled = viewport.scrollLeft <= 2
    if (next) next.disabled = viewport.scrollLeft >= maxScroll - 2
  }

  previous?.addEventListener('click', () => move(-1))
  next?.addEventListener('click', () => move(1))
  viewport.addEventListener('scroll', updateControls, { passive: true })
  viewport.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    move(event.key === 'ArrowRight' ? 1 : -1)
  })

  let pointerStart = 0
  let scrollStart = 0
  let dragging = false

  viewport.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    dragging = true
    pointerStart = event.clientX
    scrollStart = viewport.scrollLeft
    viewport.classList.add('is-dragging')
    viewport.setPointerCapture(event.pointerId)
  })

  viewport.addEventListener('pointermove', (event) => {
    if (!dragging) return
    viewport.scrollLeft = scrollStart - (event.clientX - pointerStart)
  })

  const finishDrag = (event) => {
    if (!dragging) return
    dragging = false
    viewport.classList.remove('is-dragging')
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId)
    }
  }

  viewport.addEventListener('pointerup', finishDrag)
  viewport.addEventListener('pointercancel', finishDrag)
  new ResizeObserver(updateControls).observe(viewport)
  updateControls()
})

/* Forms */

document.querySelectorAll('form[data-validate]').forEach((form) => {
  const controls = [...form.querySelectorAll('input, textarea, select')]
  const status = form.querySelector('[data-form-status]')

  const applyCustomRules = (control) => {
    control.setCustomValidity('')
    const value = control.value.trim()

    if (control.hasAttribute('data-validate-trim') && control.value && !value) {
      control.setCustomValidity(control.dataset.errorRequired || 'This field is required.')
      return
    }

    if (control.hasAttribute('data-validate-trim') && value && control.minLength > 0 && value.length < control.minLength) {
      control.setCustomValidity(control.dataset.errorTooShort || `Use at least ${control.minLength} characters.`)
      return
    }

    if (control.hasAttribute('data-validate-phone') && value) {
      const allowedCharacters = /^[0-9+()\-\s]+$/.test(value)
      const digitCount = value.replace(/\D/g, '').length

      if (!allowedCharacters || digitCount < 7 || digitCount > 15) {
        control.setCustomValidity(control.dataset.errorPattern || 'Enter a valid phone number.')
      }
    }
  }

  const validate = (control) => {
    const field = control.closest('[data-field]')
    applyCustomRules(control)
    const valid = control.checkValidity()

    field?.classList.toggle('is-invalid', !valid)
    control.setAttribute('aria-invalid', String(!valid))

    return valid
  }

  controls.forEach((control) => {
    control.addEventListener('blur', () => validate(control))
    control.addEventListener('input', () => {
      if (control.getAttribute('aria-invalid') === 'true') validate(control)
      if (status) status.textContent = ''
    })
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const validationResults = controls.map((control) => validate(control))
    const firstInvalid = controls[validationResults.indexOf(false)]

    if (firstInvalid) {
      firstInvalid.focus()
      return
    }

    form.reset()
    controls.forEach((control) => {
      control.removeAttribute('aria-invalid')
      control.closest('[data-field]')?.classList.remove('is-invalid')
    })
    if (status) status.textContent = form.dataset.success || 'Form submitted successfully.'
  })
})

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


const headerFixed = document.querySelector('.header.fixed')


if (headerFixed) {
  window.addEventListener('scroll', function(e){
    if (this.window.scrollY) {
      headerFixed.classList.add('active')
    }else{
      headerFixed.classList.remove('active')
    }
  })
}
