import raw from "../CREDITS.md?raw";

// CREDITS.md is the source of truth; the List view shows it as one short line per asset.

export type Inline = string | { text: string; href: string };
export type CreditSection = { title: string; lines: Inline[][] };

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

// Inline code loses its backticks.
function inline(md: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of md.matchAll(LINK)) {
    if (m.index > last) out.push(md.slice(last, m.index));
    out.push({ text: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < md.length) out.push(md.slice(last));
  return out.map((p) => (typeof p === "string" ? p.replace(/`/g, "") : p));
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** A table row as "Title by Author, Licence", the title linking to its first source. Tables differ in
 *  column order (models: Asset | Author | Source, sounds: File | Original | Author | Source), so read by header. */
function rowLine(row: Record<string, string>): Inline[] {
  const title = (row.Asset ?? row.Original).replace(/\s*\(`[^`]*`\)/g, "");
  const source = [...row.Source.matchAll(LINK)][0];
  return [source ? { text: title, href: source[2] } : title, ` by ${row.Author}, ${row.Licence}`];
}

function section(block: string): CreditSection {
  const [title, ...body] = block.split("\n");
  const lines: Inline[][] = [];
  for (const para of body.join("\n").trim().split(/\n\s*\n/)) {
    if (para.startsWith("|")) {
      const [head, , ...rows] = para.split("\n").map(cells);
      for (const r of rows) lines.push(rowLine(Object.fromEntries(head.map((h, k) => [h, r[k]]))));
    } else if (!para.startsWith("Changes:")) {
      lines.push(inline(para.replace(/\n/g, " ")));
    }
  }
  return { title: title.trim(), lines };
}

const [intro, ...blocks] = raw.split(/^## /m);

export const creditsIntro = intro.replace(/^# .*\n/, "").trim().replace(/\n/g, " ");
export const credits: CreditSection[] = blocks.map(section);
