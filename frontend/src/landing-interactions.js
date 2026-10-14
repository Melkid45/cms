import "./styles/landing-demo.css";

// Presentation interactions only: never transmit or persist contact details.
document.querySelectorAll("[data-review-slider]").forEach((slider) => {
  const viewport = slider.querySelector("[data-review-viewport]");
  const items = [...slider.querySelectorAll("[data-review-item]")];
  const previous = slider.querySelector("[data-review-prev]");
  const next = slider.querySelector("[data-review-next]");
  const status = slider.querySelector("[data-review-status]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function update() {
    previous.disabled = viewport.scrollLeft <= 2;
    next.disabled =
      viewport.scrollLeft >= viewport.scrollWidth - viewport.clientWidth - 2;
    const index = Math.min(
      items.length - 1,
      Math.max(
        0,
        Math.round(viewport.scrollLeft / (items[0].offsetWidth + 24)),
      ),
    );
    status.textContent = `${index + 1} / ${items.length} · Client stories`;
  }
  function move(direction) {
    viewport.scrollBy({
      left: direction * (items[0].offsetWidth + 24),
      behavior: reducedMotion.matches ? "instant" : "smooth",
    });
  }
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  viewport.addEventListener("scroll", update, { passive: true });
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  new ResizeObserver(update).observe(viewport);
  update();
});

document.querySelectorAll("[data-demo-form]").forEach((form) => {
  const inputs = [...form.querySelectorAll("input")];
  const status = form.querySelector("[data-demo-status]");
  function validate(input) {
    input.setCustomValidity("");
    if (input.type === "text" && input.value.trim().length < 2)
      input.setCustomValidity("Enter your name.");
    if (
      input.type === "tel" &&
      (!/^[+\d\s().-]+$/.test(input.value) ||
        input.value.replace(/\D/g, "").length < 7 ||
        input.value.replace(/\D/g, "").length > 15)
    )
      input.setCustomValidity("Enter a valid phone number.");
    const valid = input.checkValidity();
    input.setAttribute("aria-invalid", String(!valid));
    return valid;
  }
  inputs.forEach((input) =>
    input.addEventListener("input", () => {
      status.textContent = "";
      if (input.hasAttribute("aria-invalid")) validate(input);
    }),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const valid = inputs.map(validate).every(Boolean);
    if (!valid) {
      inputs.find((input) => !input.validity.valid)?.focus();
      return;
    }
    status.textContent =
      "Form checked successfully. This is a design demo; no request has been sent.";
  });
});

document.querySelectorAll("header details a").forEach((link) =>
  link.addEventListener("click", () => {
    link.closest("details").open = false;
  }),
);

document.querySelectorAll("[data-open-privacy]").forEach((button) => {
  button.addEventListener("click", () => {
    let dialog = document.querySelector("[data-demo-privacy]");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.dataset.demoPrivacy = "";
      dialog.setAttribute("aria-labelledby", "demo-privacy-title");
      dialog.innerHTML =
        '<h2 id="demo-privacy-title">Privacy in this demo</h2><p>This presentation does not send or store the details entered in the form. Contact information, prices, results and testimonials are illustrative. A real privacy policy and form delivery will be connected before launch.</p><form method="dialog"><button>Close</button></form>';
      document.body.append(dialog);
    }
    dialog.showModal();
  });
});
