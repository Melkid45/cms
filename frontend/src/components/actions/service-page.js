import '../sites/site-theme.js'
import { services, sites, forms, contacts } from './config.js'
import { siteId } from '../sites/site-settings.js'

const serviceId = new URLSearchParams(location.search).get('service') || (location.pathname.includes('story') ? 'open-studio' : 'personal-training')
const service = services[`${siteId}:${serviceId}`]
const params = new URLSearchParams(location.search)
const requestedForm = params.get('form') || service?.form || 'enquiry'
const formId = Object.hasOwn(forms[siteId], requestedForm) ? requestedForm : 'enquiry'
const formConfig = forms[siteId][formId]
const formLayout = ['compact','split'].includes(params.get('formLayout')) ? params.get('formLayout') : null
const base = sites[siteId].url
const labels = {
  axiom: ['About','Capabilities','Our work','Contact'],
  forma: ['Our studio','Classes','Memberships','Start here'],
  maison: ['Our story','Rooms','Experiences','Enquire'],
}[siteId]
const anchors = ['about','services',siteId === 'forma' ? 'pricing' : 'projects','contact']
for (const nav of document.querySelectorAll('nav')) {
  nav.querySelectorAll('a').forEach((link,index) => { link.href = `${base}#${anchors[index]}`; link.textContent = labels[index] })
}
for (const logo of document.querySelectorAll('a[href="/composition-1.html"]')) {
  logo.textContent = sites[siteId].settings.name
  logo.href = `${base}#home`
  logo.setAttribute('aria-label', `${sites[siteId].settings.name} home`)
}
for (const button of document.querySelectorAll('.site-header__cta')) {
  button.dataset.openForm = formId
  if (formLayout) button.dataset.formLayout = formLayout
  button.textContent = formConfig.button
}
for (const emailLink of document.querySelectorAll('a[href="mailto:hello@example.com"]')) {
  emailLink.href = `mailto:${contacts[siteId]}`
  if (emailLink.textContent.trim() === 'hello@example.com') emailLink.textContent = contacts[siteId]
}
document.querySelector('.site-footer__bottom p').textContent = `© 2026 ${sites[siteId].settings.name}. Concept website.`
if (!service) {
  document.querySelector('main.site-sections').hidden = true
  document.querySelector('[data-service-not-found]').hidden = false
  document.querySelector('[data-not-found-back]').href = `${base}#services`
  document.title = `Service not found — ${sites[siteId].settings.name}`
} else {
  for (const key of ["title", "label", "description", "lead", "body", "outcome"]) {
    const value = service[key]
    document.querySelectorAll(`[data-detail-${key}]`).forEach(el => el.textContent = value)
  }
  document.querySelector('[data-detail-image]').src = service.image
  document.querySelector('[data-detail-image]').alt = service.alt
  document.querySelectorAll('[data-detail-feature]').forEach((el,index) => el.textContent = service.features[index])
  document.querySelector('[data-detail-back]').href = `${base}#services`
  document.querySelector('[data-detail-back]').textContent = `Back to ${labels[1].toLowerCase()}`
  const cta = document.querySelector('[data-detail-cta]')
  cta.textContent = formConfig.button
  cta.dataset.openForm = formId
  if (formLayout) cta.dataset.formLayout = formLayout
  const steps = siteId === 'maison' ? ['Share your preferred dates','Choose the right room','Look forward to your stay'] : ['Start with a conversation','Agree a clear plan','Take the next step']
  document.querySelectorAll('[data-detail-step]').forEach((el,index) => el.textContent = steps[index])
  document.title = `${service.title} — ${sites[siteId].settings.name}`
}
