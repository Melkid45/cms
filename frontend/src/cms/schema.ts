export interface BlockItem { id: string; title: string; text: string; image: string; imageAlt: string; buttonLabel: string; buttonUrl: string }
export interface BlockContent { eyebrow: string; title: string; text: string; image: string; imageAlt: string; buttonLabel: string; buttonUrl: string; theme: "light" | "soft" | "dark"; items: BlockItem[] }
export interface BlockDefinition { id: string; family: string; label: string; description: string; image: boolean; items: boolean; itemImages: boolean; defaultContent: BlockContent }
const base: BlockContent = { eyebrow: "", title: "", text: "", image: "", imageAlt: "", buttonLabel: "", buttonUrl: "", theme: "light", items: [] };
const item = (id: string, title: string, text: string, image = ""): BlockItem => ({ id, title, text, image, imageAlt: title, buttonLabel: "", buttonUrl: "" });
const content = (values: Partial<BlockContent>): BlockContent => ({ ...base, ...values });
const about = content({ eyebrow: "Our approach", title: "Good training starts with understanding you.", text: "A personal approach built around your body, your goals and the life you actually live. Build a system. Stay consistent. Make it last.", image: "asset:training", imageAlt: "Coach working with an athlete", buttonLabel: "Meet your coach", buttonUrl: "#coach" });
const services = content({ eyebrow: "Programs", title: "Different goals. Same care.", text: "Find a starting point that feels right for you.", items: [item("strength", "Strength training", "Progressive training built around your strength, recovery and long-term goals.", "asset:strength"), item("nutrition", "Nutrition coaching", "A flexible way to eat that fits your life and fuels your training.", "asset:nutrition"), item("online", "Online coaching", "Your program, weekly check-ins and form reviews, wherever you train.", "asset:online")] });
const columns = content({ eyebrow: "What's included", title: "A complete system. Not just a workout.", text: "Training, recovery and the habits between sessions. Everything works together.", items: [item("plan", "Custom plan", "Built from your assessment, movement history and goals. Reviewed every four weeks."), item("mobility", "Mobility work", "Recovery protocols that keep you moving well and training consistently."), item("progress", "Progress tracking", "Weekly metrics and performance logs. Know where you stand, and what comes next.")] });
const photo = content({ eyebrow: "Head Coach / Founder", title: "The person comes first. The program comes second.", text: "Dmitry Vlasov. 12 years of coaching practice, from first-time gym-goers to competitive athletes.", image: "asset:training", imageAlt: "Personal training session", buttonLabel: "Book a consultation", buttonUrl: "mailto:hello@example.com" });
const numbers = content({ eyebrow: "Real progress", title: "Small steps. Lasting change.", text: "Our coaching system turns lifestyle goals into measurable, trackable physical progress.", items: [item("clients", "500+", "Clients trained"), item("years", "8", "Years of experience"), item("results", "94%", "Clients hit their goal")] });
export const blockDefinitions: BlockDefinition[] = [
  { id: "about-split", family: "about", label: "Image & story", description: "Balanced image and text with an optional action.", image: true, items: false, itemImages: false, defaultContent: about },
  { id: "about-editorial", family: "about", label: "Editorial story", description: "A larger heading, narrow text and a landscape image.", image: true, items: false, itemImages: false, defaultContent: about },
  { id: "services-cards", family: "services", label: "Program cards", description: "Equal cards with consistent actions.", image: false, items: true, itemImages: true, defaultContent: services },
  { id: "services-editorial", family: "services", label: "Editorial programs", description: "Staggered images without card frames.", image: false, items: true, itemImages: true, defaultContent: services },
  { id: "column-text-grid", family: "column-text", label: "Feature grid", description: "A quiet heading beside numbered features.", image: false, items: true, itemImages: false, defaultContent: columns },
  { id: "column-text-list", family: "column-text", label: "Feature list", description: "Large numbered rows with generous spacing.", image: false, items: true, itemImages: false, defaultContent: columns },
  { id: "photo-profile", family: "photo", label: "Profile", description: "A portrait and a personal introduction.", image: true, items: false, itemImages: false, defaultContent: photo },
  { id: "photo-wide", family: "photo", label: "Wide photograph", description: "A landscape photograph with its story below.", image: true, items: false, itemImages: false, defaultContent: photo },
  { id: "text-numbers-strip", family: "text-numbers", label: "Numbers strip", description: "A horizontal row of key figures.", image: false, items: true, itemImages: false, defaultContent: numbers },
  { id: "text-numbers-story", family: "text-numbers", label: "Numbers & story", description: "A narrative paired with stacked figures.", image: false, items: true, itemImages: false, defaultContent: numbers },
];
export function getDefinition(source: string) { return blockDefinitions.find((block) => source === `cms/${block.id}`); }
export function createContent(source: string): BlockContent | undefined { const definition = getDefinition(source); return definition ? structuredClone(definition.defaultContent) : undefined; }
export function safeUrl(value: string, image = false): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) return trimmed;
  if (!image && /^#[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
  try { const url = new URL(trimmed); return (image ? ["https:", "http:"] : ["https:", "http:", "mailto:", "tel:"]).includes(url.protocol) ? trimmed : ""; } catch { return ""; }
}
