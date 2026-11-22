import { Fragment, type ReactNode } from "react";
import { safeUrl } from "@/lib/builder/catalog";

// Formatted text for elements marked data-rich-text in a template. The value is
// plain text with a tiny, safe syntax (never HTML):
//   blank line          new paragraph
//   "- item" lines      bulleted list ("1. item" = numbered list)
//   "### Heading"       sub-heading
//   **bold**            bold, [label](https://…) link
// Single line breaks inside a paragraph stay line breaks.
// `link` maps internal links (custom domains drop the /site/{key} prefix).
type LinkMap = (href: string) => string;
const same: LinkMap = (href) => href;
function inline(text: string, key: string, link: LinkMap = same): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0,
    n = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(...lines(text.slice(last, match.index), `${key}-${n++}`));
    if (match[1] !== undefined)
      out.push(<strong key={`${key}-${n++}`}>{inline(match[1], `${key}-b${n}`, link)}</strong>);
    else {
      const safe = safeUrl(match[3]);
      const href = safe && link(safe);
      out.push(
        href ? (
          <a key={`${key}-${n++}`} href={href}>
            {match[2]}
          </a>
        ) : (
          match[2]
        ),
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(...lines(text.slice(last), `${key}-${n++}`));
  return out;
}
function lines(text: string, key: string): ReactNode[] {
  return text.split("\n").map((line, i) => (
    <Fragment key={`${key}-${i}`}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}
const bullet = /^\s*[-•]\s+/,
  numbered = /^\s*\d+[.)]\s+/;
export function richText(value: string, link: LinkMap = same): ReactNode[] {
  const out: ReactNode[] = [];
  value
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .forEach((block, i) => {
      // Consecutive list lines form one list; other lines form paragraphs.
      const runs: { kind: "ul" | "ol" | "p"; rows: string[] }[] = [];
      for (const row of block.split("\n")) {
        const kind = bullet.test(row) ? "ul" : numbered.test(row) ? "ol" : "p";
        const lastRun = runs.at(-1);
        if (lastRun?.kind === kind) lastRun.rows.push(row);
        else runs.push({ kind, rows: [row] });
      }
      runs.forEach((run, r) => {
        const key = `${i}-${r}`;
        if (run.kind === "p") {
          const text = run.rows.join("\n");
          out.push(
            run.rows.length === 1 && text.startsWith("### ") ? (
              <h3 key={key}>{inline(text.slice(4), key, link)}</h3>
            ) : (
              <p key={key}>{inline(text, key, link)}</p>
            ),
          );
          return;
        }
        const List = run.kind;
        out.push(
          <List key={key}>
            {run.rows.map((row, j) => (
              <li key={j}>
                {inline(row.replace(run.kind === "ul" ? bullet : numbered, ""), `${key}-${j}`, link)}
              </li>
            ))}
          </List>,
        );
      });
    });
  return out;
}
