import { forms, services, serviceUrl } from './config.js'
import { siteId } from '../sites/site-settings.js'
import './actions.scss'

const serviceDialog = document.getElementById('service-dialog')
const enquiryDialog = document.getElementById('enquiry-dialog')
const enquiryForm = enquiryDialog?.querySelector('form')
const openDialogs = new Set()
const openers = new WeakMap()
const closeTimers = new WeakMap()
let activeService = null
let previousOverflow = ''

function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return
  if (!openDialogs.size) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  openDialogs.add(dialog)
  openers.set(dialog, opener || document.activeElement)
  dialog.classList.add('is-opening')
  dialog.showModal()
  dialog.querySelector('.action-dialog__body').scrollTop = 0
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.remove('is-opening')))
}
function closeDialog(dialog, after) {
  if (!dialog?.open || closeTimers.has(dialog)) return
  dialog.classList.add('is-closing')
  const finish = () => {
    dialog.close()
    dialog.classList.remove('is-closing', 'is-opening')
    closeTimers.delete(dialog)
    openDialogs.delete(dialog)
    if (!openDialogs.size) document.body.style.overflow = previousOverflow
    const opener = openers.get(dialog)
    if (!after && opener?.isConnected) opener.focus({ preventScroll: true })
    after?.()
  }
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240
  closeTimers.set(dialog, setTimeout(finish, duration))
}
function bindService(root, service, formId, formLayout) {
  const values = { title: service.title, label: service.label, description: service.description }
  for (const [key,value] of Object.entries(values)) root.querySelectorAll(`[data-service-${key}]`).forEach(el => el.textContent = value)
  root.querySelectorAll('[data-service-image]').forEach(img => { img.src = service.image; img.alt = service.alt })
  root.querySelectorAll('[data-service-feature]').forEach((el,index) => el.textContent = service.features[index] || '')
  root.querySelector('[data-service-page]').href = serviceUrl(service, 'page', {form: formId, layout: formLayout})
  root.querySelector('[data-service-enquire]').textContent = forms[service.site][formId || service.form].button
}
export function openForm(opener, service = null, layout) {
  const requested = opener?.dataset.openForm || service?.form || 'enquiry'
  const config = forms[service?.site || siteId]?.[requested]
  if (!enquiryDialog || !enquiryForm || !config) return
  enquiryDialog.dataset.layout = layout || config.layout
  enquiryDialog.dataset.formKind = config.callback ? 'callback' : 'enquiry'
  enquiryDialog.querySelector('[data-form-title]').textContent = config.title
  enquiryDialog.querySelector('[data-form-description]').textContent = config.description
  enquiryDialog.querySelector('[data-form-image]').src = service?.image || config.image
  enquiryDialog.querySelector('[data-form-submit]').textContent = config.button
  enquiryForm.elements.subject.value = service?.title || opener?.dataset.formContext || (config.callback ? 'A callback' : 'General enquiry')
  enquiryForm.elements.serviceId.value = service ? `${service.site}:${service.id}` : ''
  const phone = enquiryForm.elements.phone
  phone.required = Boolean(config.callback)
  phone.disabled = !config.callback
  phone.setCustomValidity('')
  enquiryForm.querySelector('[data-callback-phone]').hidden = !config.callback
  enquiryForm.elements.email.required = !config.callback
  enquiryForm.elements.email.disabled = Boolean(config.callback)
  enquiryForm.querySelector('[data-email-field]').hidden = Boolean(config.callback)
  enquiryForm.elements.message.required = !config.callback
  enquiryForm.elements.message.disabled = Boolean(config.callback)
  enquiryForm.querySelector('[data-message-field]').hidden = Boolean(config.callback)
  const booking = enquiryForm.querySelector('[data-booking-dates]')
  booking.hidden = !config.dates
  for (const name of ['arrival','departure']) {
    const field = enquiryForm.elements[name]
    field.required = Boolean(config.dates)
    field.disabled = !config.dates
    field.setCustomValidity('')
  }
  enquiryForm.querySelector('[role="status"]').textContent = ''
  enquiryForm.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'))
  openDialog(enquiryDialog, opener)
  enquiryForm.elements.name.focus({ preventScroll: true })
}
for (const dialog of [serviceDialog,enquiryDialog].filter(Boolean)) {
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog) })
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => closeDialog(dialog))
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(dialog)
  })
}
serviceDialog?.querySelector('[data-service-enquire]').addEventListener('click', () => {
  const service = activeService
  const opener = openers.get(serviceDialog)
  closeDialog(serviceDialog, () => openForm(opener, service, opener?.dataset.formLayout))
})
// Public links retain a real destination for new tabs and no-JS fallback.
for (const link of document.querySelectorAll('a[data-service]')) {
  const service = services[link.dataset.service]
  if (service) link.href = serviceUrl(service, link.dataset.serviceMode || service.mode, {form: link.dataset.openForm || service.form, layout: link.dataset.formLayout})
}
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const serviceLink = event.target.closest('[data-service]')
  if (serviceLink) {
    const service = services[serviceLink.dataset.service]
    if (!service) return
    const mode = serviceLink.dataset.serviceMode || service.mode
    if (!['modal','drawer'].includes(mode)) return
    event.preventDefault()
    activeService = service
    bindService(serviceDialog, service, serviceLink.dataset.openForm, serviceLink.dataset.formLayout)
    serviceDialog.dataset.layout = mode
    openDialog(serviceDialog, serviceLink)
    return
  }
  const trigger = event.target.closest('[data-open-form]')
  if (!trigger) return
  event.preventDefault()
  const query = new URLSearchParams(location.search)
  const service = services[`${siteId}:${query.get('service')}`] || null
  openForm(trigger, service, trigger.dataset.formLayout)
})
if (enquiryForm) {
  const fields = [...enquiryForm.querySelectorAll('input:not([type="hidden"]):not([readonly]),textarea')]
  function validate(field) {
    if (field.disabled) return true
    if (field.name === 'phone') field.setCustomValidity(field.value.replace(/\D/g, '').length >= 6 ? '' : 'Enter a phone number.')
    if (['arrival','departure'].includes(field.name)) {
      const arrival = enquiryForm.elements.arrival.value
      const departure = enquiryForm.elements.departure.value
      enquiryForm.elements.departure.setCustomValidity(arrival && departure && departure <= arrival ? 'Departure must be after arrival.' : '')
    }
    const valid = field.validity.valid && (!field.required || field.value.trim().length > 0)
    field.setAttribute('aria-invalid', String(!valid))
    return valid
  }
  for (const field of fields) {
    field.addEventListener('blur', () => validate(field))
    field.addEventListener('input', () => {
      enquiryForm.querySelector('[role="status"]').textContent = ''
      if (field.hasAttribute('aria-invalid')) validate(field)
      if (field.name === 'arrival' && enquiryForm.elements.departure.hasAttribute('aria-invalid')) validate(enquiryForm.elements.departure)
    })
  }
  enquiryForm.addEventListener('submit', event => {
    event.preventDefault()
    const invalid = fields.filter(field => !validate(field))
    if (invalid.length) { invalid[0].focus(); return }
    enquiryForm.querySelector('[role="status"]').textContent = 'Preview only — nothing has been sent. Your enquiry is ready to connect to the website inbox.'
  })
}
