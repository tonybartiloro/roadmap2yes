/** Escaping helpers for email templates (plan §7, design DES-25). Pure. */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Replaces CR/LF/line separators with a space: subjects and headers must be single-line. */
export function singleLine(value: string): string {
  return value
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Only absolute http(s) URLs are allowed as link targets; anything else becomes "#". */
export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "#";
  } catch {
    return "#";
  }
}

/** True for ONE bare address: no comma, semicolon, angle brackets, quotes or whitespace. */
export function isSingleAddress(value: string): boolean {
  return value.length <= 254 && /^[^\s,;<>"]+@[^\s,;<>"]+$/.test(value);
}
