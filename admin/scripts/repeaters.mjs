export function compileRepeaters(nodes, family) {
  const repeaters = [];
  const hasLinkedTabs = JSON.stringify(nodes).includes('-tabs"');
  const fieldKeys = (node) => [
    ...(node.field ? [node.field] : []),
    ...Object.values(node.bindings || {}),
    ...(node.children || []).flatMap(fieldKeys),
  ];
  const key = (node) => {
    if (!node.tag) return "";
    const classes = node.attrs?.class || "";
    if (["article", "details"].includes(node.tag))
      return node.tag + ":" + (classes.split(" ")[0] || "");
    if (node.tag === "li" && classes.includes("splide__slide")) return "slides";
    if (node.tag === "button" && classes.includes("gallery__photo"))
      return "photos";
    if (
      node.tag === "div" &&
      /\b(?:process__step|advantages__item|content__item)\b/.test(classes)
    )
      return classes.split(" ")[0];
    return "";
  };
  function visit(node) {
    if (!node.children) return node;
    const groups = new Map();
    for (const child of node.children) {
      const k = key(child);
      if (k && fieldKeys(child).length) {
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(child);
      }
    }
    const matches = [...groups.values()].filter((items) => items.length >= 2);
    const consumed = new Set();
    const replacements = new Map();
    for (const items of matches) {
      const id = `items-${repeaters.length + 1}`;
      repeaters.push({
        id,
        label:
          family === "faq"
            ? "Questions"
            : family === "gallery"
              ? "Images"
              : family === "pricing"
                ? "Plans"
                : family === "process"
                  ? "Steps"
                  : family === "testimonials"
                    ? "Reviews"
                    : "Cards",
        items: items.map((node) => ({
          node,
          fields: [...new Set(fieldKeys(node))],
        })),
      });
      replacements.set(items[0], { repeat: id });
      items.slice(1).forEach((item) => consumed.add(item));
    }
    return {
      ...node,
      children: node.children
        .filter((c) => !consumed.has(c))
        .map((c) => replacements.get(c) || visit(c)),
    };
  }
  if (hasLinkedTabs || ["header", "footer", "hero"].includes(family))
    return { nodes, repeaters };
  return { nodes: nodes.map(visit), repeaters };
}
