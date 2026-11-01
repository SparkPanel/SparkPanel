export interface PanelColors {
  primaryColor?: string | null;
  backgroundColor?: string | null;
  borderColor?: string | null;
  sidebarAccentColor?: string | null;
}

function hexToHsl(hex?: string | null): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Применяет цвета оформления из настроек панели. Основной цвет действует в обеих темах,
 * фон, рамки и выделение в меню — только в светлой, чтобы не ломать тёмную тему.
 */
export function applyPanelColors(colors: PanelColors): void {
  const primary = hexToHsl(colors.primaryColor);
  const background = hexToHsl(colors.backgroundColor);
  const border = hexToHsl(colors.borderColor);
  const accent = hexToHsl(colors.sidebarAccentColor);

  const all: string[] = [];
  if (primary) {
    all.push(`--primary: ${primary};`, `--sidebar-primary: ${primary};`, `--ring: ${primary};`, `--sidebar-ring: ${primary};`);
  }
  const light: string[] = [];
  if (background) light.push(`--background: ${background};`, `--card: ${background};`, `--sidebar: ${background};`);
  if (border) light.push(`--border: ${border};`, `--card-border: ${border};`, `--sidebar-border: ${border};`, `--popover-border: ${border};`, `--input: ${border};`);
  if (accent) {
    const lightness = Number(accent.split(" ")[2].replace("%", ""));
    const [h, s] = accent.split(" ");
    light.push(`--sidebar-accent: ${accent};`, `--sidebar-accent-foreground: ${h} ${s} ${lightness > 50 ? "12%" : "95%"};`);
  }

  let style = document.getElementById("panel-colors") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "panel-colors";
    document.head.appendChild(style);
  }
  style.textContent = `${all.length ? `:root, .dark { ${all.join(" ")} }` : ""} ${light.length ? `:root:not(.dark) { ${light.join(" ")} }` : ""}`;
}
