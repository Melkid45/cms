import type { CmsForm } from "./types";
export function validateFormValues(
  form: CmsForm,
  input: Record<string, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of form.fields) {
    const value = (input[field.name] || "").trim();
    if (
      field.required &&
      (!value || (field.type === "checkbox" && value !== "yes"))
    )
      throw new Error(`Please complete ${field.label}.`);
    if (!value) continue;
    if (value.length > (field.type === "textarea" ? 5000 : 500))
      throw new Error(`${field.label} is too long.`);
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      throw new Error("Enter a valid email address.");
    if (field.type === "tel" && value.replace(/\D/g, "").length < 6)
      throw new Error("Enter a valid phone number.");
    if (field.type === "select" && !field.options.includes(value))
      throw new Error(`Choose an option for ${field.label}.`);
    if (field.type === "checkbox" && value !== "yes")
      throw new Error(`Check ${field.label}.`);
    if (field.type === "number" && !Number.isFinite(Number(value)))
      throw new Error(`Enter a number for ${field.label}.`);
    if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new Error(`Enter a valid date for ${field.label}.`);
    values[field.name] = value;
  }
  if (!Object.keys(values).length) throw new Error("Your message is empty.");
  return values;
}
