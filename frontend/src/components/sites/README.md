# Three local websites

- `/demo-axiom.html`: engineering, six sections. Source Sans 3 / Inter, 1440px maximum container, square corners, compact spacing, blue filled buttons.
- `/demo-forma.html`: fitness, seven sections. Onest / Manrope, 1820px maximum container, rounded corners, standard spacing, warm accent, filled primary and soft secondary buttons.
- `/demo-maison.html`: hospitality, seven sections. Cormorant Garamond / Source Sans 3, 1600px maximum container, subtle corners, spacious rhythm, outlined primary buttons.

The per-page `site-design` JSON contains the same settings as the admin. `site-theme.js` uses the admin's actual `designVariables()` and Google Fonts URL builder; no separate theme implementation. `sites.scss` contains only the page shell, header offsets and contextual contrast for dark CTA buttons.

HTML in each site folder reuses the corresponding section's markup and shared SCSS. Differences are copy, images, chosen variants, order and theme settings. Source variants and settings are listed in `manifest.json`. Templates remain available on their existing collection pages and in their local exploration pages.

These are standalone frontend demonstrations, not pages created or imported into the CMS. Navigation stays within each landing page. CTA actions use demonstration email addresses. There is no booking, payment, subscription or enquiry backend.

Brands, team names, examples, membership prices and quotes are illustrative review content. Pages are marked noindex. Photos reuse local exploration assets plus:
- https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122
- https://images.unsplash.com/photo-1581092921461-eab62e97a780
- https://images.unsplash.com/photo-1571896349842-33c89424de2d
