import type { CSSProperties, ReactNode } from "react";

const SGR = /\x1b\[([0-9;]*)m/g;

/** Текст без ANSI-кодов цвета — для поиска, копирования и сохранения вывода. */
export function stripAnsi(text: string): string {
  return text.replace(SGR, "");
}

const BASE = ["#4b5563", "#f87171", "#4ade80", "#facc15", "#60a5fa", "#e879f9", "#22d3ee", "#e5e7eb"];
const BRIGHT = ["#9ca3af", "#fca5a5", "#86efac", "#fde047", "#93c5fd", "#f0abfc", "#67e8f9", "#ffffff"];

/** Цвет из 256-цветной палитры xterm. */
function color256(n: number): string {
  if (n < 8) return BASE[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const i = n - 16;
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    return `rgb(${v(Math.floor(i / 36))},${v(Math.floor(i / 6) % 6)},${v(i % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}

interface Style {
  color?: string;
  background?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function apply(style: Style, codes: number[]): Style {
  const next = { ...style };
  for (let i = 0; i < codes.length; i += 1) {
    const c = codes[i];
    if (c === 0) Object.keys(next).forEach((k) => delete next[k as keyof Style]);
    else if (c === 1) next.bold = true;
    else if (c === 3) next.italic = true;
    else if (c === 4) next.underline = true;
    else if (c === 22) next.bold = false;
    else if (c === 23) next.italic = false;
    else if (c === 24) next.underline = false;
    else if (c >= 30 && c <= 37) next.color = BASE[c - 30];
    else if (c >= 90 && c <= 97) next.color = BRIGHT[c - 90];
    else if (c === 39) delete next.color;
    else if (c >= 40 && c <= 47) next.background = BASE[c - 40];
    else if (c >= 100 && c <= 107) next.background = BRIGHT[c - 100];
    else if (c === 49) delete next.background;
    else if ((c === 38 || c === 48) && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
      next[c === 38 ? "color" : "background"] = color256(codes[i + 2]);
      i += 2;
    } else if ((c === 38 || c === 48) && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
      next[c === 38 ? "color" : "background"] = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
      i += 4;
    }
  }
  return next;
}

/** Строка вывода с ANSI-цветами, отрисованная цветными фрагментами. Без кодов — обычный текст. */
export function AnsiText({ text }: { text: string }) {
  if (!text.includes("\x1b[")) return <>{text}</>;
  const parts: ReactNode[] = [];
  let style: Style = {};
  let last = 0;
  let match: RegExpExecArray | null;
  SGR.lastIndex = 0;
  const push = (chunk: string, key: number) => {
    if (!chunk) return;
    const css: CSSProperties = {
      color: style.color,
      backgroundColor: style.background,
      fontWeight: style.bold ? 600 : undefined,
      fontStyle: style.italic ? "italic" : undefined,
      textDecoration: style.underline ? "underline" : undefined,
    };
    parts.push(Object.values(css).some(Boolean) ? <span key={key} style={css}>{chunk}</span> : chunk);
  };
  while ((match = SGR.exec(text))) {
    push(text.slice(last, match.index), match.index);
    style = apply(style, match[1] === "" ? [0] : match[1].split(";").map(Number));
    last = SGR.lastIndex;
  }
  push(text.slice(last), text.length + 1);
  return <>{parts}</>;
}
