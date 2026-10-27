# Layout library
Six headers / five footers, separate from legacy _components. Shared template typography, buttons, container (1820px), Manrope and design tokens.
Collection uses isolated preview iframes so every header really remains fixed without overlapping other variants. Each layout-header-N.html is also available directly.
Header: import header.js once; ResizeObserver maintains --header-height. Production main content must reserve this height.
At <=1024px navigation opens below the unchanged header, filling the remaining viewport. Compact version uses this menu at every width. Lucide TextAlignJustify / X; escape, focus wrap, background inert, body scroll locking, close on link or desktop breakpoint.
Double/studio keep a subtle row divider. No header color swap, no brand movement on menu opening.
Footer: no author credit, fake social links, privacy promises, or newsletter form. Demo telephone is a reserved UK drama number, email is example.com. Replace before production.


Header 6: floating rounded navigation bar; uses shared responsive navigation and menu behavior.
