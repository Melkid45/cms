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
