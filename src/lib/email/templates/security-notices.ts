import { APP_NAME } from "@/components/app-name";
import { escapeHtml, singleLine } from "../escape";
import type { RenderedEmail } from "../types";
import { paragraph, renderLayout, type EmailPalette } from "./layout";

function render(
  subject: string,
  preheader: string,
  greeting: string,
  lines: string[],
  button: { label: string; url: string },
  palette: EmailPalette | undefined,
): RenderedEmail {
  const footer = "Questa è una notifica di sicurezza e non si può disattivare.";
  const html = renderLayout({
    ...(palette ? { palette } : {}),
    preheader,
    title: subject,
    bodyHtml: [greeting, ...lines].map((l) => paragraph(escapeHtml(l))).join("\n"),
    button,
    footerHtml: escapeHtml(footer),
  });
  const text = [
    greeting,
    "",
    ...lines.flatMap((l) => [l, ""]),
    `${button.label}: ${button.url}`,
    "",
    footer,
    APP_NAME,
  ].join("\n");
  return { subject, html, text };
}

export interface TempCodeNoticeInput {
  recipientName: string;
  /** Who set the temporary code (display name of the other partner). */
  actorName: string;
  loginUrl: string;
  palette?: EmailPalette;
}

/** "Temporary code set by {name}" security notice (plan §4.5.4a). */
export function renderTempCodeNotice(input: TempCodeNoticeInput): RenderedEmail {
  const actor = singleLine(input.actorName);
  return render(
    "Hanno impostato un codice temporaneo per te",
    `${actor} ha impostato un codice temporaneo per il tuo accesso.`,
    `Ciao ${singleLine(input.recipientName)},`,
    [
      `${actor} ha impostato un codice temporaneo per il tuo accesso. Al prossimo ingresso ti chiederemo di scegliere un nuovo codice tutto tuo.`,
      "Se non te l'aspettavi, parlane subito con lui o con lei e cambia il codice appena entri.",
    ],
    { label: "Vai all'accesso", url: input.loginUrl },
    input.palette,
  );
}

export interface EmailChangedNoticeInput {
  recipientName: string;
  loginUrl: string;
  palette?: EmailPalette;
}

/** Sent to the OLD address when the login email was changed (plan §4.6). */
export function renderEmailChangedNotice(input: EmailChangedNoticeInput): RenderedEmail {
  return render(
    "La tua email di accesso è cambiata",
    "Da ora si entra con un altro indirizzo.",
    `Ciao ${singleLine(input.recipientName)},`,
    [
      `L'email con cui entri in ${APP_NAME} è stata cambiata: da ora l'accesso si fa con il nuovo indirizzo.`,
      "Se non sei stato tu, avvisa subito il tuo partner e cambia il codice dall'app.",
    ],
    { label: "Vai all'accesso", url: input.loginUrl },
    input.palette,
  );
}
