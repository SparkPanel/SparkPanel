import { useMemo, useRef, type ReactNode } from "react";

type Language = "yaml" | "properties" | "json" | "script" | "python" | "shell" | "xml" | "plain";

/** Язык подсветки по имени файла. */
export function languageFor(fileName: string): Language {
  const name = fileName.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (["yml", "yaml"].includes(ext)) return "yaml";
  if (["properties", "cfg", "conf", "ini", "toml", "env"].includes(ext) || name === ".env" || name.startsWith(".env.")) return "properties";
  if (["json", "json5", "mcmeta"].includes(ext)) return "json";
  if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "java", "kt", "cs", "go", "rs", "php", "lua"].includes(ext)) return "script";
  if (ext === "py") return "python";
  if (["sh", "bash"].includes(ext)) return "shell";
  if (["xml", "html", "htm", "svg"].includes(ext)) return "xml";
  return "plain";
}

const COLORS = {
  comment: "text-muted-foreground italic",
  string: "text-emerald-600 dark:text-emerald-400",
  number: "text-amber-600 dark:text-amber-400",
  keyword: "text-violet-600 dark:text-violet-400",
  key: "text-sky-700 dark:text-sky-400",
  tag: "text-sky-700 dark:text-sky-400",
} as const;

type Kind = keyof typeof COLORS;

const STRING = String.raw`"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?`;
const NUMBER = String.raw`\b-?\d+(?:\.\d+)?\b`;

const RULES: Record<Exclude<Language, "plain">, RegExp> = {
  yaml: new RegExp(String.raw`(?<comment>(?:^|\s)#.*$)|(?<key>^\s*-?\s*[\w.\-"' ]+?(?=:(?:\s|$)))|(?<string>${STRING})|(?<keyword>\b(?:true|false|null|yes|no|on|off)\b)|(?<number>${NUMBER})`, "gi"),
  properties: new RegExp(String.raw`(?<comment>^\s*[#;!].*$)|(?<key>^\s*[\w.\-\[\]]+(?=\s*[=:]))|(?<string>${STRING})|(?<keyword>\b(?:true|false)\b)|(?<number>${NUMBER})`, "gi"),
  json: new RegExp(String.raw`(?<comment>\/\/.*$)|(?<key>"(?:[^"\\]|\\.)*"(?=\s*:))|(?<string>${STRING})|(?<keyword>\b(?:true|false|null)\b)|(?<number>${NUMBER})`, "g"),
  script: new RegExp(
    String.raw`(?<comment>\/\/.*$|\/\*.*?(?:\*\/|$))|(?<string>${STRING}|\x60(?:[^\x60\\]|\\.)*\x60?)|(?<keyword>\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|public|private|protected|static|final|void|int|long|boolean|true|false|null|undefined|this|package|interface|type|fun|val|func|struct|impl|fn|use|mut|local|end|then)\b)|(?<number>${NUMBER})`,
    "g",
  ),
  python: new RegExp(
    String.raw`(?<comment>#.*$)|(?<string>${STRING})|(?<keyword>\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|with|try|except|finally|raise|pass|break|continue|lambda|yield|async|await|None|True|False|self|global|nonlocal)\b)|(?<number>${NUMBER})`,
    "g",
  ),
  shell: new RegExp(
    String.raw`(?<comment>(?:^|\s)#.*$)|(?<string>${STRING})|(?<keyword>\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|export|local|return|exit|echo|cd)\b)|(?<key>\$\{?[\w@#?*]+\}?)|(?<number>${NUMBER})`,
    "g",
  ),
  xml: new RegExp(String.raw`(?<comment><!--.*?(?:-->|$))|(?<tag><\/?[\w:.\-]+|\/?>)|(?<key>\b[\w:\-]+(?==))|(?<string>${STRING})`, "g"),
};

function highlightLine(line: string, rule: RegExp, lineIndex: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  rule.lastIndex = 0;
  for (let match = rule.exec(line); match; match = rule.exec(line)) {
    if (match[0] === "") {
      rule.lastIndex += 1;
      continue;
    }
    const kind = (Object.keys(match.groups ?? {}) as Kind[]).find((k) => match!.groups![k] !== undefined);
    if (!kind) continue;
    if (match.index > last) out.push(line.slice(last, match.index));
    out.push(
      <span key={`${lineIndex}:${match.index}`} className={COLORS[kind]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

const HIGHLIGHT_LIMIT = 300 * 1024;

const SHARED = "m-0 whitespace-pre p-3 font-mono text-sm leading-6 [tab-size:4]";

/** Текстовый редактор с подсветкой синтаксиса: прозрачная textarea поверх раскрашенного текста. */
export function CodeEditor({ value, onChange, fileName, className }: { value: string; onChange: (value: string) => void; fileName: string; className?: string }) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const language = languageFor(fileName);
  const enabled = language !== "plain" && value.length <= HIGHLIGHT_LIMIT;

  const highlighted = useMemo(() => {
    if (!enabled) return null;
    const rule = RULES[language as Exclude<Language, "plain">];
    return value.split("\n").map((line, i) => (
      <span key={i}>
        {highlightLine(line, rule, i)}
        {"\n"}
      </span>
    ));
  }, [value, language, enabled]);

  return (
    <div className={`relative overflow-hidden rounded-md border bg-background ${className ?? ""}`}>
      {enabled && (
        <pre ref={highlightRef} aria-hidden className={`${SHARED} pointer-events-none absolute inset-0 overflow-hidden`}>
          {highlighted}
        </pre>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (highlightRef.current) {
            highlightRef.current.scrollTop = e.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd } = el;
            const indent = language === "yaml" ? "  " : "\t";
            onChange(value.slice(0, selectionStart) + indent + value.slice(selectionEnd));
            requestAnimationFrame(() => el.setSelectionRange(selectionStart + indent.length, selectionStart + indent.length));
          }
        }}
        wrap="off"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-label={`Contents of ${fileName}`}
        className={`${SHARED} relative block h-full min-h-[60vh] w-full resize-none overflow-auto bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          enabled ? "text-transparent caret-foreground selection:bg-primary/25 selection:text-transparent" : "text-foreground"
        }`}
      />
    </div>
  );
}
