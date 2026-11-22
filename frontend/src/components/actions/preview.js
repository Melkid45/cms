import '../sites/site-theme.js'
import { services, serviceUrl } from './config.js'
const service = services['forma:personal-training']
const link = document.querySelector('[data-service]')
function updatePreview() {
  const mode = document.querySelector('input[name="service-mode"]:checked').value
  const form = document.querySelector('input[name="form-id"]:checked').value
  const layout = document.querySelector('input[name="form-layout"]:checked').value
  link.dataset.serviceMode = mode
  link.href = serviceUrl(service, mode, {form, layout})
  for (const trigger of document.querySelectorAll('[data-open-form], [data-service]')) {
    trigger.dataset.openForm = form
    trigger.dataset.formLayout = layout
  }
}
document.querySelectorAll('input[type="radio"]').forEach(input => input.addEventListener('change', updatePreview))
updatePreview()
