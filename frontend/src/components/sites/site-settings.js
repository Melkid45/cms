import { sites } from '../actions/config.js'
const query = new URLSearchParams(location.search)
const embedded = document.getElementById('site-design')
const settings = embedded ? JSON.parse(embedded.textContent) : null
export const siteId = Object.keys(sites).find(id => sites[id].settings.name === settings?.name) || (Object.hasOwn(sites, query.get('site')) ? query.get('site') : 'forma')
export const siteSettings = settings || sites[siteId].settings
