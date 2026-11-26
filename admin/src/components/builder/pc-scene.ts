// Animated "build your own PC" illustration (port of the Zcena prototype's js/scene.js): a stylised case that
// assembles itself part by part in a 10 s loop, fans spinning, AIO pulsing. Pure SVG; the motion is CSS
// (pricing.scss → "pricing-v20 scene"), so prefers-reduced-motion shows the finished PC without motion.
// Used by pricing-v20 when its promo tile has no picture.
let seq = 0;
const blades = (cx: number, cy: number, r: number) => {
  let s = "";
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const p = (k: number, d: number) => [cx + Math.cos(a + d) * r * k, cy + Math.sin(a + d) * r * k].map((v) => v.toFixed(1));
    const [x1, y1] = p(0.22, 0), [x2, y2] = p(0.82, 0.55), [xc, yc] = p(0.75, 0.1);
    s += `<path d="M${x1} ${y1} Q${xc} ${yc} ${x2} ${y2}"/>`;
  }
  return s;
};
export function pcSceneSvg() {
  const id = `zs${++seq}`;
  const g = `url(#${id}rgb)`;
  const fan = (cx: number, cy: number, r: number) =>
    `<g class="fan"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#0c0f15" stroke="${g}" stroke-width="3"/><g class="spin" stroke="#3a4560" stroke-width="5" stroke-linecap="round" fill="none">${blades(cx, cy, r)}</g><circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="#1b2130"/></g>`;
  const ram = [452, 463, 474, 485].map((x) => `<rect x="${x}" y="94" width="7" height="82" rx="1.5" fill="#222a39"/><rect x="${x}" y="94" width="7" height="7" rx="1.5" fill="${g}"/>`).join("");
  const traces = [[344, 160, 392, 160], [344, 176, 470, 176], [344, 260, 500, 260], [500, 176, 500, 270], [360, 290, 520, 290], [436, 132, 452, 132]].map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("");
  const fins = Array.from({ length: 24 }, (_, i) => `<line x1="${326 + i * 8}" y1="45" x2="${326 + i * 8}" y2="57"/>`).join("");
  return `<svg class="pc-scene" viewBox="0 0 640 400" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
<defs><linearGradient id="${id}rgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d7bff"/><stop offset=".5" stop-color="#b44dff"/><stop offset="1" stop-color="#ff3dbb"/></linearGradient>
<radialGradient id="${id}glow"><stop offset="0" stop-color="#9b5cff" stop-opacity=".55"/><stop offset=".6" stop-color="#3d7bff" stop-opacity=".12"/><stop offset="1" stop-color="#3d7bff" stop-opacity="0"/></radialGradient>
<pattern id="${id}dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#1a1f2a"/></pattern></defs>
<rect width="640" height="400" fill="#0b0c10"/><rect width="640" height="400" fill="url(#${id}dots)"/>
<g class="s-glow"><ellipse cx="450" cy="205" rx="230" ry="190" fill="url(#${id}glow)"/></g>
<g class="s-case"><rect x="300" y="28" width="304" height="354" rx="12" fill="#11141b" stroke="#2c3343" stroke-width="2"/><rect x="309" y="37" width="228" height="336" rx="7" fill="#0e1117" stroke="#1d2230"/><line x1="542" y1="30" x2="542" y2="380" stroke="#2c3343" stroke-width="2"/><rect x="292" y="372" width="30" height="10" rx="3" fill="#1a1f29"/><rect x="580" y="372" width="30" height="10" rx="3" fill="#1a1f29"/></g>
<g class="s-mb"><rect x="318" y="70" width="204" height="226" rx="5" fill="#151b26" stroke="#283246"/><rect x="318" y="70" width="24" height="76" rx="3" fill="#1f2737"/><g stroke="#24304a" stroke-width="2">${traces}</g><rect x="352" y="236" width="56" height="10" rx="2" fill="#202a3b"/><circle cx="500" cy="244" r="9" fill="#1d2534" stroke="#2c3850"/></g>
<g class="s-cpu"><rect x="391" y="108" width="46" height="46" rx="4" fill="#c7ccd6"/><rect x="398" y="115" width="32" height="32" rx="2" fill="#a7afbd"/></g>
<g class="s-ram">${ram}</g>
<g class="s-aio"><rect x="318" y="40" width="204" height="22" rx="4" fill="#171b25" stroke="#2c3343"/><g stroke="#232a38" stroke-width="2">${fins}</g><path d="M404 116 C 398 92, 372 84, 352 62" stroke="#0a0c11" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M426 116 C 432 88, 410 78, 392 62" stroke="#0a0c11" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="414" cy="131" r="24" fill="#0c0f15" stroke="${g}" stroke-width="3.5"/><circle class="pulse" cx="414" cy="131" r="11" fill="${g}"/></g>
<g class="s-gpu"><rect x="318" y="196" width="214" height="50" rx="6" fill="#1b212e" stroke="#2f3a52"/><rect x="318" y="196" width="214" height="4" rx="2" fill="${g}"/>${fan(368, 222, 18)}${fan(438, 222, 18)}<rect x="478" y="208" width="44" height="26" rx="3" fill="#232b3c"/></g>
<g class="s-psu"><rect x="318" y="306" width="214" height="8" rx="2" fill="#1a1f2a"/><rect x="318" y="320" width="146" height="50" rx="5" fill="#141821" stroke="#2c3343"/><g stroke="#232a38" stroke-width="2"><line x1="330" y1="332" x2="452" y2="332"/><line x1="330" y1="345" x2="452" y2="345"/><line x1="330" y1="358" x2="452" y2="358"/></g></g>
<g class="s-cables" fill="none" stroke="#090b10" stroke-width="5" stroke-linecap="round"><path d="M454 320 C 470 300, 520 300, 520 250"/><path d="M440 320 C 440 290, 500 280, 516 150"/><path d="M420 320 C 410 300, 390 270, 400 246"/></g>
<g class="s-fans">${fan(573, 104, 25)}${fan(573, 204, 25)}${fan(573, 304, 25)}</g>
</svg>`;
}
