// Run in the CUA browser runtime with an authenticated/local-development tab.
// Uses only supported browser actions and read-only DOM inspection.
export async function checkBlockOverflow(tab, variants, base, stress = true) {
  const results = [];
  for (const variant of variants) {
    await tab.goto(`${base}/library/${variant}${stress ? "?stress=1" : ""}`);
    await tab.getAXState({ emit: false });
    const result = await tab.playwright.evaluate(() => {
      const root = document.querySelector(".site-canvas");
      if (!root) return { error: "Section did not render" };
      const width = innerWidth;
      const outside = Array.from(root.querySelectorAll("h1,h2,h3,p,a,button"))
        .filter((el) => {
          if (el.closest(".splide__list,[hidden]")) return false;
          const style = getComputedStyle(el),
            r = el.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            r.width > 0 &&
            (r.right > width + 2 || r.left < -2)
          );
        })
        .slice(0, 8)
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.slice(0, 60),
        }));
      return {
        width,
        documentWidth: document.documentElement.scrollWidth,
        outside,
      };
    });
    results.push({ variant, stress, ...result });
  }
  return results;
}
