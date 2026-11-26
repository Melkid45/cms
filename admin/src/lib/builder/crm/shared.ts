// CRM types and helpers shared by the server and the dashboard (no server-only imports).

export const CONTACT_STATUSES = ["lead", "active", "customer", "inactive"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  active: "In progress",
  customer: "Customer",
  inactive: "Inactive",
};
export const SOURCE_KINDS = ["enquiry", "order", "manual", "import", "booking"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const SOURCE_LABELS: Record<SourceKind, string> = {
  enquiry: "Website enquiry",
  order: "Shop order",
  manual: "Added by hand",
  import: "CSV import",
  booking: "Online booking",
};

export interface CrmEvent {
  id: string;
  at: string;
  by: string;
  kind: "created" | "note" | "status" | "edit" | "merge" | "deal" | "task" | "link" | "booking";
  text: string;
}
export interface ContactSource {
  kind: SourceKind;
  page?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
}
export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  language: string;
  status: ContactStatus;
  tags: string[];
  source: ContactSource;
  submissionIds: string[];
  orderIds: string[];
  // Online bookings of this contact (lib/builder/booking), newest first.
  bookingIds?: string[];
  events: CrmEvent[];
  createdAt: string;
  updatedAt: string;
  revision: number;
  // TEST data from .run/crm/seed-crm.mjs (removed by its --cleanup).
  test?: boolean;
}
export interface Stage {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
}
export interface Deal {
  id: string;
  title: string;
  contactId: string;
  stageId: string;
  value: number;
  currency: string;
  expectedDate: string; // yyyy-mm-dd or ""
  ownerId: string;
  submissionId?: string;
  orderId?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  revision: number;
  test?: boolean;
}
export interface Task {
  id: string;
  title: string;
  due: string; // ISO date-time or ""
  assigneeId: string;
  contactId?: string;
  dealId?: string;
  done: boolean;
  doneAt?: string;
  createdAt: string;
  createdBy: string;
  remindedAt?: string;
  revision: number;
  test?: boolean;
}
export interface CrmSettings {
  autoDeal: boolean;
  currency: string;
}
export interface TeamMember {
  id: string;
  name: string;
}
// Contact list row: the stored contact plus figures computed from the inbox and shop orders.
export interface ContactRow extends Omit<Contact, "events"> {
  enquiries: number;
  orders: number;
  revenue: number;
  currency: string;
  deals: number;
  lastActivity: string;
  customerAccount: boolean;
}
export interface CrmData {
  contacts: ContactRow[];
  deals: Deal[];
  tasks: Task[];
  stages: Stage[];
  stagesRevision: number;
  settings: CrmSettings;
  settingsRevision: number;
  team: TeamMember[];
  me: string;
  timeZone: string;
}
export interface TimelineItem {
  at: string;
  kind: "enquiry" | "order" | "event" | "deal" | "task";
  title: string;
  text?: string;
  by?: string;
  href?: string;
}
export interface ContactDetail {
  contact: ContactRow;
  timeline: TimelineItem[];
  duplicates: { id: string; name: string; email: string; phone: string; reason: string }[];
}
export interface OverviewData {
  timeZone: string;
  today: string;
  enquiries: number;
  orders: number;
  revenue: Record<string, number>;
  openDeals: number;
  openValue: number;
  currency: string;
  tasksDue: number;
  overdue: number;
  visitors: number | null;
  shop: boolean;
  activity: TimelineItem[];
}

export const DEFAULT_STAGES: Stage[] = [
  { id: "new", name: "New", kind: "open" },
  { id: "contacted", name: "Contacted", kind: "open" },
  { id: "offer", name: "Offer sent", kind: "open" },
  { id: "won", name: "Won", kind: "won" },
  { id: "lost", name: "Lost", kind: "lost" },
];

export const normEmail = (value: string) => value.trim().toLowerCase();
// Digits only; "00" international prefix dropped. Numbers match when equal, or when one
// is the other with a country code in front (both at least 8 digits).
export function normPhone(value: string) {
  return value.replace(/\D/g, "").replace(/^00/, "");
}
export function samePhone(a: string, b: string) {
  const x = normPhone(a),
    y = normPhone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 8 && y.length >= 8 && (x.endsWith(y) || y.endsWith(x));
}
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isPhone = (value: string) =>
  /^\+?[\d\s().-]{6,40}$/.test(value.trim()) && normPhone(value).length >= 6;

export const money = (n: number, currency = "EUR") =>
  `${(Math.round(n * 100) / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${currency === "EUR" ? "€" : currency}`;
export const overdue = (task: Task, now = Date.now()) =>
  !task.done && !!task.due && Date.parse(task.due) < now;
