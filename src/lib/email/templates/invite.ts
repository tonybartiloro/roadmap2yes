import { APP_NAME } from "@/components/app-name";
import { escapeHtml, singleLine } from "../escape";
import type { RenderedEmail } from "../types";
import { formatInstantDay } from "./format";
import { paragraph, renderLayout, type EmailPalette } from "./layout";

export interface InviteEmailInput {
  /** Name of the invited partner; `null` when unknown. */
  inviteeName: string | null;
  inviterName: string;
  /** One-time link to `/invito/[token]`. */
  url: string;
  expiresAt: Date;
  palette?: EmailPalette;
}

/** Partner invitation (AC52: not unsubscribable, so no unsubscribe link or header). */
export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const inviter = singleLine(input.inviterName);
  const greeting = input.inviteeName ? `Ciao ${singleLine(input.inviteeName)},` : "Ciao,";
  const until = formatInstantDay(input.expiresAt);
  const lines = [
    `${inviter} ha iniziato a organizzare il vostro matrimonio e vuole farlo insieme a te. Entra per vedere cosa ha già preparato e dire la tua.`,
    `Il link vale 7 giorni (fino al ${until}) ed è solo per questo indirizzo: lì scegli il tuo codice d'accesso.`,
    "Se non te l'aspettavi, ignora questa email: non succede niente.",
  ];
  const footer = "Questa email non si può disattivare perché è un invito.";
  const subject = singleLine(`${inviter} ti ha invitato su ${APP_NAME}`);
  const html = renderLayout({
    ...(input.palette ? { palette: input.palette } : {}),
    preheader: `${inviter} vuole organizzare il matrimonio insieme a te.`,
    title: subject,
    bodyHtml: [paragraph(escapeHtml(greeting)), ...lines.map((l) => paragraph(escapeHtml(l)))].join(
      "\n",
    ),
    button: { label: "Entra nello spazio", url: input.url },
    footerHtml: escapeHtml(footer),
  });
  const text = [
    greeting,
    "",
    ...lines.flatMap((l) => [l, ""]),
    `Entra nello spazio: ${input.url}`,
    "",
    footer,
    APP_NAME,
  ].join("\n");
  return { subject, html, text };
}
