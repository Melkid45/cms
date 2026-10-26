document.querySelectorAll('[data-contact-form]').forEach((form) => {
  const fields = [...form.querySelectorAll('input, textarea')]
  const status = form.querySelector('[role="status"]')
  form.noValidate = true
  const validate = (field) => {
    const valid = field.validity.valid && (!field.required || field.value.trim().length > 0)
    field.setAttribute('aria-invalid', String(!valid))
    return valid
  }
  fields.forEach((field) => {
    field.addEventListener('blur', () => validate(field))
    field.addEventListener('input', () => {
      status.textContent = ''
      if (field.hasAttribute('aria-invalid')) validate(field)
    })
  })
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const invalid = fields.filter((field) => !validate(field))
    if (invalid.length) {
      status.textContent = ''
      invalid[0].focus()
      return
    }
    status.textContent = 'Demo only — your message has not been sent. The form is ready to connect to your website.'
  })
})

