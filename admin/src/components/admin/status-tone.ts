// Status colours of the whole admin (Vova, 2026-11-22): red = critical (overdue, failed,
// down / suspended), orange = in progress / waiting (pending, processing, DNS pending,
// test address), green = all good (paid, live, connected, done), grey = inactive only
// (disabled, archived, cancelled). Soft pill background + matching text.
export type Tone = "critical" | "progress" | "good" | "inactive";
export const toneClass: Record<Tone, string> = {
  critical: "bg-red-50 text-red-700",
  progress: "bg-orange-50 text-orange-700",
  good: "bg-emerald-50 text-emerald-700",
  inactive: "bg-neutral-100 text-neutral-500",
};
export const toneDot: Record<Tone, string> = {
  critical: "bg-red-500",
  progress: "bg-orange-500",
  good: "bg-emerald-500",
  inactive: "bg-neutral-400",
};
