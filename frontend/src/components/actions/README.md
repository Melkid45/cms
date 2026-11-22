# Local service and form actions

Review `/actions-explorations.html`. This is a frontend interaction prototype, not a new CMS settings screen. No CMS content migration and no external submission.

## Service behaviour

A service record in `config.js` owns its content, opening mode and target form ID:
- `modal`: a centered photo-and-copy dialog.
- `drawer`: a right-side dialog.
- `page`: `/service-detail.html?site=…&service=…`, split layout.
- `editorial`: `/service-story.html?site=…&service=…`, centered introduction and panorama.

The seven service records belong to the three local landing pages. The card photo, heading and action link all open the same record. Links retain an actual page destination for Ctrl/Cmd-click and no-JS fallback. Unknown service IDs show an explicit empty/not-found state. Static preview URLs return HTML rather than a production HTTP 404.

## Button → form

`data-open-form="enquiry"` or `data-open-form="callback"` selects a form definition. Many buttons reuse the same form. There is one definition per form/site, not a separate copy per button.

The service is passed as a stable ID and displayed as a read-only topic. The service dialog, detail page and form all use the same record. The preview controls carry the selected form and layout through to the service page via validated query options.

Forms:
- Enquiry: name, email and message. The hospitality version also asks for arrival/departure.
- Callback: name and phone number.

Layouts: compact or photo-and-form. Layout is normally owned by the form; `data-form-layout` and preview URL options exist to compare the local variations.

Use native dialog focus containment. Escape, close icon and backdrop close the dialog, restore focus and release the background scroll lock. Transitions respect reduced motion. The service-to-form handoff preserves the original opener.

Client validation highlights bottom borders and focuses the first invalid field. Name/message whitespace, email validity, phone digit count and departure-after-arrival are checked. **Submitting only displays a demo notice. Nothing is sent or stored.** Production submission, spam protection and server validation remain in the CMS stage.

## Intended admin model

- Service: opening mode, detail layout and enquiry form.
- Button: action (`link`, `section`, `form`) and its destination.
- Form: fields, visual layout and delivery settings in one place.

Do not duplicate SMTP configuration or form definitions inside every section/button.
