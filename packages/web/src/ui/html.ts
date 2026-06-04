export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ""), "");
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderList(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}
