# Advantages

Preview: /advantages-collection.html. Five standalone partials and one advantages.scss. First four need no JS; the fifth uses advantages.js for accessible tabs. Old sections remain untouched.

Variants: grid (four Lucide icons), image (photo + list), panel (text cards), numbers (intro + evidence grid), interactive (four tabs + photo/story panels). Shared content: title, description, items with title/description and optional icon, photo or value.

Interactive panels share a grid cell so the largest content reserves the height. Inactive panels are inert and hidden from assistive technology. Keyboard: Left/Right, Home/End. Without JS all panels remain readable. All decorative icons are Lucide.

All typography, colors, radius and container come from src/styles/template. No local font sizes. section-stack owns the 150px gap between sections. Photos are the same local Northline stock assets used by hero/about/services; all claims and statistics are demonstration content.

Inline decorative SVGs use the installed Lucide v1.47.0 Handshake, ScanEye, Layers and Leaf paths (ISC license; see node_modules/lucide/LICENSE). Fixed 36px icons do not shrink in flex rows.
