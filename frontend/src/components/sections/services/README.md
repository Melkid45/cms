# Services

Preview: /services-collection.html. Six standalone HTML partials and one services.scss; old services.html remains untouched.

Variants: rows (Alture-inspired but without decorative counters, chips or a forced dark theme), cards, feature, accordion, scope (text-led columns without images), slider. Shared content is service title, description, optional image, scope text and action.

Slider uses locally bundled @splidejs/splide and its core CSS, without arrows or pagination. Settings: type loop, perPage 3, perMove 1 at every viewport width. Three complete cards fill the track without peek padding; Splide owns drag, keyboard and reduced-motion behavior. No custom drag handlers or native scroll-snap slider remain.

Typography, container, buttons, colors and radius use src/styles/template. No section-local font sizes or inline styles. section-stack supplies the shared 150px section gap. All variants use the Northline theme from hero/about.

Accordion uses native details/summary; services.js makes each instance exclusive and updates the adjacent image. Native disclosure and content remain available without JavaScript. Demo service actions use mailto, not invented detail pages. Replace with real routes during integration.
