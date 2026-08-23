export type ChatBlock =
  | { type: "text"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

function tidyCell(raw: string): string {
  return raw
    .trim()
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^_(.+)_$/, "$1");
}

function isSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-")) return false;
  return /^[\s|:│+\-]+$/.test(t) && /-{2,}/.test(t);
}

function splitCells(line: string): string[] | null {
  const t = line.trim();
  if (!t) return null;
  const unified = t.includes("|") ? t : t.includes("│") ? t.replace(/│/g, "|") : t;
  if (!unified.includes("|")) return null;
  let raw = unified;
  if (raw.startsWith("|")) raw = raw.slice(1);
  if (raw.endsWith("|")) raw = raw.slice(0, -1);
  const cells = raw.split("|").map(tidyCell);
  if (cells.length < 2) return null;
  if (cells.every((c) => c === "")) return null;
  return cells;
}

function isTableLine(line: string): boolean {
  return isSeparator(line) || splitCells(line) !== null;
}

function padRow(row: string[], width: number): string[] {
  const next = row.slice(0, width);
  while (next.length < width) next.push("");
  return next;
}

export function parseChatBlocks(content: string): ChatBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChatBlock[] = [];
  let i = 0;

  const flushText = (buf: string[]) => {
    const text = buf.join("\n").replace(/^\n+|\n+$/g, "");
    if (text) blocks.push({ type: "text", text });
  };

  while (i < lines.length) {
    if (!isTableLine(lines[i])) {
      const buf: string[] = [];
      while (i < lines.length && !isTableLine(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      flushText(buf);
      continue;
    }

    const collected: string[][] = [];
    while (i < lines.length && isTableLine(lines[i])) {
      if (!isSeparator(lines[i])) {
        const cells = splitCells(lines[i]);
        if (cells) collected.push(cells);
      }
      i += 1;
    }
    if (collected.length < 2) {
      flushText(collected.map((row) => row.join(" | ")));
      continue;
    }
    const width = Math.max(...collected.map((row) => row.length));
    const headers = padRow(collected[0], width);
    const rows = collected.slice(1).map((row) => padRow(row, width));
    blocks.push({ type: "table", headers, rows });
  }

  return blocks;
}
