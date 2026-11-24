import { APP_NAME } from "@/components/app-name";
import { THEMES } from "@/themes/catalog";
import type { ThemeTokens } from "@/themes/types";
import { escapeHtml, safeUrl } from "../escape";

/** Colours used by an email: the wedding theme, or Giardino (default / Supabase Auth). */
export type EmailPalette = Pick<
  ThemeTokens,
  | "background"
  | "foreground"
  | "card"
  | "mutedForeground"
  | "primary"
  | "primaryForeground"
  | "border"
>;

const giardino = THEMES.find((theme) => theme.id === "giardino");
if (!giardino) throw new Error("Giardino theme missing from the catalogue");
export const DEFAULT_PALETTE: EmailPalette = giardino.light;

export interface LayoutInput {
  palette?: EmailPalette;
  /** One-line preview shown by mail clients. */
  preheader: string;
  title: string;
  /** Already-safe HTML (built with `escapeHtml`). */
  bodyHtml: string;
  button?: { label: string; url: string };
  /** Already-safe HTML. */
  footerHtml: string;
}

const BODY_FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const HEADING_FONT = "Georgia, 'Times New Roman', serif";

/** Responsive-safe single column (max 560 px), tables and inline styles only, no images. */
export function renderLayout(input: LayoutInput): string {
  const p = input.palette ?? DEFAULT_PALETTE;
  const button = input.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${p.primary};border-radius:8px">` +
      `<a href="${escapeHtml(safeUrl(input.button.url))}" style="display:inline-block;min-height:44px;line-height:44px;padding:0 24px;font:600 16px/44px ${BODY_FONT};color:${p.primaryForeground};text-decoration:none">${escapeHtml(input.button.label)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:8px 0 0;font:13px/1.5 ${BODY_FONT};color:${p.mutedForeground};word-break:break-all">${escapeHtml(safeUrl(input.button.url))}</p>`
    : "";
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.title)}</title></head>
<body style="margin:0;padding:0;background:${p.background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.background}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${p.card};border:1px solid ${p.border};border-radius:12px"><tr><td style="padding:28px 24px;font:16px/1.6 ${BODY_FONT};color:${p.foreground}">
<h1 style="margin:0 0 16px;font:700 24px/1.3 ${HEADING_FONT};color:${p.primary}">${escapeHtml(input.title)}</h1>
${input.bodyHtml}
${button}
</td></tr>
<tr><td style="padding:16px 24px 24px;font:13px/1.5 ${BODY_FONT};color:${p.mutedForeground};border-top:1px solid ${p.border}">${input.footerHtml}<br>${escapeHtml(APP_NAME)}</td></tr></table>
</td></tr></table></body></html>`;
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px">${html}</p>`;
}
