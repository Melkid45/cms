// Reuse the original page's timeline, FAQ, slider and form validation.
import "../main.js";
import "./privacy.js";
import { createIcons, TextAlignJustify, X } from "lucide";

const toggle = document.querySelector(".site-header__toggle");
const panel = document.querySelector(".site-header__panel");
let previousOverflow = "";
function setMenu(open) {
  if (open) previousOverflow = document.body.style.overflow;
  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
  toggle.innerHTML = `<i data-lucide="${open ? "x" : "text-align-justify"}"></i>`;
  createIcons({ icons: { TextAlignJustify, X } });
  document.body.style.overflow = open ? "hidden" : previousOverflow;
}
createIcons({ icons: { TextAlignJustify, X } });
toggle.addEventListener("click", () => setMenu(panel.hidden));
panel.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panel.hidden) {
    setMenu(false);
    toggle.focus();
  }
});
window.addEventListener("resize", () => {
  if (innerWidth > 1024 && !panel.hidden) setMenu(false);
});
