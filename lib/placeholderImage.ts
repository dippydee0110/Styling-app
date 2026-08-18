function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function toDataUri(svg: string): string {
  const encoded = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function textColorFor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#1c1a17" : "#faf6f0";
}

/** A flat-color labeled thumbnail, used in place of a real product photo. */
export function productPlaceholder(name: string, color: string, category: string): string {
  const textColor = textColorFor(color);
  const words = name.split(" ");
  const line1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
  const line2 = words.slice(Math.ceil(words.length / 2)).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <rect width="300" height="300" fill="${color}" />
    <rect x="0" y="0" width="300" height="300" fill="black" opacity="0.03" />
    <text x="150" y="128" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="${textColor}" opacity="0.75">${escapeXml(category.toUpperCase())}</text>
    <text x="150" y="156" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="${textColor}" font-weight="600">${escapeXml(line1)}</text>
    <text x="150" y="180" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="${textColor}" font-weight="600">${escapeXml(line2)}</text>
  </svg>`;
  return toDataUri(svg);
}
