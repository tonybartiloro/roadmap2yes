import { APP_NAME } from "@/components/app-name";
import { formatEuro } from "@/lib/money";
import type { PlainDate } from "@/lib/dates/plain-date";
import { escapeHtml, singleLine } from "../escape";
import type { RenderedEmail } from "../types";
import { formatLongDate, limitRows } from "./format";
import { paragraph, renderLayout, type EmailPalette } from "./layout";

export interface ReminderTask {
  title: string;
  dueDate: PlainDate;
  /** The reference date is provisional (plan §7: "data provvisoria" note). */
  provisional?: boolean;
}

export interface Unsubscribe {
  url: string;
}

const ONE_CLICK = "List-Unsubscribe=One-Click";

function unsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": ONE_CLICK };
}

function taskLine(task: ReminderTask): string {
  const note = task.provisional ? " (data provvisoria)" : "";
  return `${singleLine(task.title)}${note}`;
}

function listHtml(rows: string[], more: number): string {
  const items = rows.map(
    (r) => `<li style="margin:0 0 6px"><strong>${escapeHtml(r)}</strong></li>`,
  );
  if (more > 0) items.push(`<li style="margin:0 0 6px">e altri ${more}</li>`);
  return `<ul style="margin:0 0 16px;padding-left:20px">${items.join("")}</ul>`;
}

function listText(rows: string[], more: number): string[] {
  return [...rows.map((r) => `- ${r}`), ...(more > 0 ? [`- e altri ${more}`] : [])];
}

export interface ReminderEmailInput {
  recipientName: string;
  /** Tasks due in 7 days / today. At least one of the two is non-empty. */
  sevenDays: readonly ReminderTask[];
  today: readonly ReminderTask[];
  /** Link to the Percorso. */
  appUrl: string;
  unsubscribeUrl: string;
  palette?: EmailPalette;
}

function reminderSubject(
  sevenDays: readonly ReminderTask[],
  today: readonly ReminderTask[],
): string {
  const total = sevenDays.length + today.length;
  if (total === 1) {
    return today.length === 1
      ? `Oggi: ${taskLine(today[0]!)}`
      : `Tra 7 giorni: ${taskLine(sevenDays[0]!)}`;
  }
  if (today.length === 0) return `Tra 7 giorni: ${total} cose da fare`;
  if (sevenDays.length === 0) return `Oggi: ${total} cose da fare`;
  return `Promemoria di oggi: ${total} cose da fare`;
}

/** One reminder email per user per day (DES-26): blocks "tra 7 giorni" and "oggi", max 5 rows each. */
export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  if (input.sevenDays.length + input.today.length === 0) {
    throw new Error("renderReminderEmail needs at least one task");
  }
  const subject = singleLine(reminderSubject(input.sevenDays, input.today));
  const name = singleLine(input.recipientName);
  const blocks: { heading: string; rows: string[]; more: number }[] = [];
  if (input.sevenDays.length > 0) {
    const { shown, more } = limitRows(input.sevenDays);
    blocks.push({
      heading: "Tra 7 giorni",
      rows: shown.map((t) => `${taskLine(t)}, ${formatLongDate(t.dueDate)}`),
      more,
    });
  }
  if (input.today.length > 0) {
    const { shown, more } = limitRows(input.today);
    blocks.push({ heading: "Oggi", rows: shown.map(taskLine), more });
  }
  const intro =
    "Ecco cosa scade. Se è già fatto, segnalalo nell'app con un tocco; se non ce la fai, puoi spostare la scadenza dal compito.";
  const footer = "Non vuoi più questi promemoria? Disattivali con un tocco:";
  const bodyHtml = [
    paragraph(escapeHtml(`Ciao ${name},`)),
    paragraph(escapeHtml(intro)),
    ...blocks.map(
      (b) =>
        `<h2 style="margin:0 0 8px;font-size:17px">${escapeHtml(b.heading)}</h2>${listHtml(b.rows, b.more)}`,
    ),
  ].join("\n");
  const html = renderLayout({
    ...(input.palette ? { palette: input.palette } : {}),
    preheader: subject,
    title: subject,
    bodyHtml,
    button: { label: "Apri il Percorso", url: input.appUrl },
    footerHtml: `${escapeHtml(footer)} <a href="${escapeHtml(input.unsubscribeUrl)}">disattiva i promemoria</a>`,
  });
  const text = [
    `Ciao ${name},`,
    "",
    intro,
    "",
    ...blocks.flatMap((b) => [`${b.heading}:`, ...listText(b.rows, b.more), ""]),
    `Apri il Percorso: ${input.appUrl}`,
    "",
    `${footer} ${input.unsubscribeUrl}`,
    APP_NAME,
  ].join("\n");
  return { subject, html, text, headers: unsubscribeHeaders(input.unsubscribeUrl) };
}

export interface DigestTodo extends ReminderTask {
  /** Past due: shown as "da recuperare", neutral tone. */
  overdue?: boolean;
}

export interface DigestPayment {
  description: string;
  amountCents: number;
  dueDate: PlainDate;
}

export interface DigestEmailInput {
  recipientName: string;
  /** Display name of the other partner (for "Novità di {nome}"). */
  partnerName: string;
  todo: readonly DigestTodo[];
  payments: readonly DigestPayment[];
  /** Max 3 are shown. */
  news: readonly string[];
  appUrl: string;
  /** Link to Altro > Promemoria. */
  preferencesUrl: string;
  unsubscribeUrl: string;
  palette?: EmailPalette;
}

const MAX_NEWS = 3;

/** Monday digest. Returns `null` when there is nothing to report: we do not write (AC51). */
export function renderDigestEmail(input: DigestEmailInput): RenderedEmail | null {
  if (input.todo.length + input.payments.length + input.news.length === 0) return null;
  const subject = "Il tuo riepilogo della settimana";
  const name = singleLine(input.recipientName);
  const partner = singleLine(input.partnerName);
  const sections: { heading: string; rows: string[]; more: number }[] = [];
  if (input.todo.length > 0) {
    const { shown, more } = limitRows(input.todo);
    sections.push({
      heading: "Da fare",
      rows: shown.map(
        (t) => `${taskLine(t)}, ${t.overdue ? "da recuperare" : formatLongDate(t.dueDate)}`,
      ),
      more,
    });
  }
  if (input.payments.length > 0) {
    const { shown, more } = limitRows(input.payments);
    sections.push({
      heading: "Pagamenti in arrivo",
      rows: shown.map(
        (p) =>
          `${singleLine(p.description)}, ${formatEuro(p.amountCents)}, ${formatLongDate(p.dueDate)}`,
      ),
      more,
    });
  }
  if (input.news.length > 0) {
    const { shown, more } = limitRows(input.news, MAX_NEWS);
    sections.push({ heading: `Novità di ${partner}`, rows: shown.map(singleLine), more });
  }
  const intro = "Ecco cosa ti aspetta questa settimana.";
  const footer = "Non vuoi più il riepilogo del lunedì? Disattivalo con un tocco:";
  const change = "Cambi idea? Puoi riattivarlo da Altro > Promemoria:";
  const bodyHtml = [
    paragraph(escapeHtml(`Ciao ${name},`)),
    paragraph(escapeHtml(intro)),
    ...sections.map(
      (s) =>
        `<h2 style="margin:0 0 8px;font-size:17px">${escapeHtml(s.heading)}</h2>${listHtml(s.rows, s.more)}`,
    ),
  ].join("\n");
  const html = renderLayout({
    ...(input.palette ? { palette: input.palette } : {}),
    preheader: "Scadenze, pagamenti e novità della settimana.",
    title: subject,
    bodyHtml,
    button: { label: `Apri ${APP_NAME}`, url: input.appUrl },
    footerHtml: `${escapeHtml(footer)} <a href="${escapeHtml(input.unsubscribeUrl)}">disattiva il riepilogo</a><br>${escapeHtml(change)} <a href="${escapeHtml(input.preferencesUrl)}">Promemoria</a>`,
  });
  const text = [
    `Ciao ${name},`,
    "",
    intro,
    "",
    ...sections.flatMap((s) => [`${s.heading}:`, ...listText(s.rows, s.more), ""]),
    `Apri ${APP_NAME}: ${input.appUrl}`,
    "",
    `${footer} ${input.unsubscribeUrl}`,
    `${change} ${input.preferencesUrl}`,
    APP_NAME,
  ].join("\n");
  return { subject, html, text, headers: unsubscribeHeaders(input.unsubscribeUrl) };
}
