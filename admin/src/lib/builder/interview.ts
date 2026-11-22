// Scripted onboarding interview (shared by the public chat page and the server).
// When an AI key is enabled later, the assistant may add follow-up questions; this script
// stays the baseline so the flow always works without paid services.
export type QuestionKind = "text" | "textarea" | "choice" | "multi" | "file";
export interface Question {
  id: string;
  kind: QuestionKind;
  text: string;
  hint?: string;
  options?: string[];
  optional?: boolean;
}
export const interview: Question[] = [
  {
    id: "brief",
    kind: "file",
    text: "Hello! I will help you put together a clear brief for your website. If you already have a brief or any document about the project, upload it here. If not, just skip — I will ask a few short questions.",
    hint: "PDF, Word, text or Markdown, up to 10 MB.",
    optional: true,
  },
  {
    id: "business",
    kind: "text",
    text: "What is the name of your business?",
  },
  {
    id: "about",
    kind: "textarea",
    text: "What does your business do, and who are your customers?",
    hint: "Two or three sentences are enough.",
  },
  {
    id: "offer",
    kind: "textarea",
    text: "Which services or products should the website show? List them, one per line.",
    hint: "For example: Kitchen design, Bathroom renovation, Consultation.",
  },
  {
    id: "pages",
    kind: "multi",
    text: "Which pages do you need?",
    options: [
      "Home",
      "About",
      "Services",
      "Prices",
      "Projects / gallery",
      "Reviews",
      "FAQ",
      "Contacts",
      "Blog / news",
    ],
  },
  {
    id: "languages",
    kind: "multi",
    text: "In which languages should the website be?",
    options: ["English", "Latvian", "Russian", "German", "Other"],
  },
  {
    id: "goal",
    kind: "choice",
    text: "What is the main thing a visitor should do on the website?",
    options: [
      "Send an enquiry",
      "Call or message us",
      "Book an appointment",
      "Look at our work",
      "Read about us",
    ],
  },
  {
    id: "style",
    kind: "choice",
    text: "Which style suits your business best?",
    options: [
      "Calm and minimal",
      "Premium and elegant",
      "Bold and bright",
      "Warm and friendly",
      "Not sure — suggest one",
    ],
  },
  {
    id: "references",
    kind: "textarea",
    text: "Are there websites you like? Paste links and tell us what you like about them.",
    optional: true,
  },
  {
    id: "materials",
    kind: "multi",
    text: "What do you already have?",
    options: ["Logo", "Photos", "Texts", "Domain name", "Nothing yet"],
  },
  {
    id: "deadline",
    kind: "choice",
    text: "When would you like to launch?",
    options: [
      "As soon as possible",
      "Within a month",
      "In 2–3 months",
      "No rush",
    ],
  },
  {
    id: "features",
    kind: "textarea",
    text: "Do you need anything beyond regular pages? For example online booking, a product catalog or shop, a product configurator, a price calculator.",
    hint: "Leave empty if not. Special features are built as custom blocks and quoted separately.",
    optional: true,
  },
  {
    id: "notes",
    kind: "textarea",
    text: "Anything else we should know? Special features, examples, wishes.",
    optional: true,
  },
];
export const contactFields = ["name", "email", "phone"] as const;
export type Answers = Record<string, string>;
const label: Record<string, string> = {
  business: "Business",
  about: "About the business",
  offer: "Services / products",
  pages: "Pages",
  languages: "Languages",
  goal: "Main visitor action",
  style: "Style",
  references: "Reference websites",
  materials: "Existing materials",
  deadline: "Launch",
  features: "Special features",
  notes: "Additional notes",
};
// Plain-text technical brief built from the answers (deterministic, no AI).
export function buildBrief(input: {
  answers: Answers;
  contact: { name: string; email: string; phone?: string };
  files: { name: string }[];
}) {
  const a = input.answers;
  const list = (value = "") =>
    value
      .split(/\n|;/)
      .map((item) => item.trim())
      .filter(Boolean);
  const lines: string[] = [];
  lines.push(`WEBSITE BRIEF — ${a.business || "New website"}`);
  lines.push("");
  lines.push(
    `Client: ${input.contact.name} · ${input.contact.email}${input.contact.phone ? ` · ${input.contact.phone}` : ""}`,
  );
  lines.push("");
  lines.push("1. Business");
  lines.push(a.about || "—");
  lines.push("");
  lines.push("2. Services / products");
  const offer = list(a.offer);
  lines.push(...(offer.length ? offer.map((item) => `- ${item}`) : ["—"]));
  lines.push(`Total: ${offer.length}`);
  lines.push("");
  lines.push("3. Website structure");
  const pages = list(a.pages);
  lines.push(...(pages.length ? pages.map((page) => `- ${page}`) : ["—"]));
  lines.push("");
  lines.push(`4. Languages: ${list(a.languages).join(", ") || "—"}`);
  lines.push(`5. Main visitor action: ${a.goal || "—"}`);
  lines.push(`6. Style: ${a.style || "—"}`);
  if (a.references) lines.push(`   References: ${a.references}`);
  lines.push(`7. Existing materials: ${list(a.materials).join(", ") || "—"}`);
  lines.push(`8. Launch: ${a.deadline || "—"}`);
  if (a.features) {
    lines.push("");
    lines.push("9. Special features (custom blocks, quoted separately)");
    lines.push(a.features);
  }
  if (a.notes) {
    lines.push("");
    lines.push("10. Additional notes");
    lines.push(a.notes);
  }
  if (input.files.length) {
    lines.push("");
    lines.push(
      `Attached documents: ${input.files.map((file) => file.name).join(", ")}`,
    );
  }
  lines.push("");
  lines.push(
    "The website is built from the Harbstone section library and hosted by Harbstone.",
  );
  return lines.join("\n");
}
export const answerLabel = (id: string) => label[id] || id;
