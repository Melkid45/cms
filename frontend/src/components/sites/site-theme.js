import { designVariables } from '../../../../admin/src/lib/builder/design.ts'
import { fontStylesheet } from '../../../../admin/src/lib/builder/fonts.ts'
import '../../../../admin/src/components/builder/button-theme.scss'
import './sites.scss'
import { siteSettings as settings } from './site-settings.js'
import '../actions/actions.js'
import '../layout/header/header.js'
import '../preview/explorations.js'
import '../sections/faq/faq.js'

// The same settings and token mapping as Site design in the admin.
for (const [property, value] of Object.entries(designVariables(settings))) {
  document.documentElement.style.setProperty(property, String(value))
}
Object.assign(document.body.dataset, {
  buttonStyle: settings.buttonStyle || 'filled',
  buttonMotion: settings.buttonMotion || 'fade',
  secondaryButtonStyle: settings.secondaryButtonStyle || 'outline',
  secondaryButtonMotion: settings.secondaryButtonMotion || 'fade',
  corners: settings.corners || 'rounded',
})
const fonts = document.createElement('link')
fonts.rel = 'stylesheet'
fonts.href = fontStylesheet([settings.headingFont, settings.bodyFont])
document.head.append(fonts)
