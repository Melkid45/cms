# About sections

Preview: `/about-collection.html`. No preview header, footer, labels or numbering. Original `/about.html` remains a legacy page.

Five standalone partials share one `about.scss`: quote, editorial, paired, panel, story. Include only the chosen partial into a real page. Typography, container, button, section spacing, content stack and description color come from `src/styles/template/` — never declare font sizes in local section CSS.

All variants use the same Northline content theme and local stock assets as the approved hero collection. The first variant takes compositional inspiration from the user-provided Alture reference; no template source code or assets are copied. Quotes and statistics are fictional demonstration content.

Shared content: eyebrow, title, description, media, action. Optional content: quote + author, secondary image, facts, additional story paragraph. On narrow screens the layout stacks without fixed section heights.
