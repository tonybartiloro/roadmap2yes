import { describe, expect, it } from "vitest";
import {
  renderDigestEmail,
  renderEmailChangedNotice,
  renderInviteEmail,
  renderReminderEmail,
  renderTempCodeNotice,
} from "./index";

const EVIL = `<img src=x onerror=alert(1)>"&`;
const ESCAPED = "&lt;img src=x onerror=alert(1)&gt;&quot;&amp;";
const URL = "https://app.example.test/invito/abc";
const UNSUB = "https://app.example.test/email/disattiva?tipo=reminders&t=abc.def";

describe("invite", () => {
  const mail = renderInviteEmail({
    inviteeName: EVIL,
    inviterName: EVIL,
    url: URL,
    expiresAt: new Date("2026-11-30T10:00:00Z"),
  });
  it("escapes user text, keeps a text alternative and the link", () => {
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain(ESCAPED);
    expect(mail.html).toContain('lang="it"');
    expect(mail.html).toContain(URL);
    expect(mail.text).toContain(URL);
    expect(mail.text).toContain("fino al 30 novembre");
    expect(mail.text).toContain("Ciao");
  });
  it("is not unsubscribable", () => {
    expect(mail.headers).toBeUndefined();
    expect(mail.html).not.toContain("disattiva?");
    expect(mail.text).toContain("non si può disattivare");
  });
  it("subject has no line breaks", () => {
    const m = renderInviteEmail({
      inviteeName: null,
      inviterName: "Tony\r\nBcc: x",
      url: URL,
      expiresAt: new Date(),
    });
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("security notices", () => {
  it("temp code notice escapes and has no unsubscribe", () => {
    const m = renderTempCodeNotice({ recipientName: "Tony", actorName: EVIL, loginUrl: URL });
    expect(m.html).toContain(ESCAPED);
    expect(m.html).not.toContain("<img");
    expect(m.headers).toBeUndefined();
    expect(m.text).toContain(URL);
  });
  it("email changed notice", () => {
    const m = renderEmailChangedNotice({ recipientName: EVIL, loginUrl: URL });
    expect(m.html).toContain(ESCAPED);
    expect(m.subject).toBe("La tua email di accesso è cambiata");
  });
});

describe("reminder", () => {
  const task = (title: string, dueDate = "2026-11-30") => ({ title, dueDate });
  it("single task, 7 days", () => {
    const m = renderReminderEmail({
      recipientName: "Tony",
      sevenDays: [task("Prenotare la location")],
      today: [],
      appUrl: URL,
      unsubscribeUrl: UNSUB,
    });
    expect(m.subject).toBe("Tra 7 giorni: Prenotare la location");
    expect(m.text).toContain("lunedì 30 novembre");
  });
  it("single task, today", () => {
    const m = renderReminderEmail({
      recipientName: "Tony",
      sevenDays: [],
      today: [task("Prenotare la location")],
      appUrl: URL,
      unsubscribeUrl: UNSUB,
    });
    expect(m.subject).toBe("Oggi: Prenotare la location");
  });
  it("groups, limits to 5 rows per block, escapes, adds unsubscribe link and headers", () => {
    const many = Array.from({ length: 7 }, (_, i) => task(`${EVIL} ${i}`));
    const m = renderReminderEmail({
      recipientName: "Tony",
      sevenDays: many,
      today: [{ title: "Location", dueDate: "2026-11-23", provisional: true }],
      appUrl: URL,
      unsubscribeUrl: UNSUB,
    });
    expect(m.subject).toBe("Promemoria di oggi: 8 cose da fare");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("e altri 2");
    expect(m.text).toContain("e altri 2");
    expect(m.text).toContain("(data provvisoria)");
    expect(m.html).toContain("disattiva i promemoria");
    expect(m.text).toContain(UNSUB);
    expect(m.headers).toEqual({
      "List-Unsubscribe": `<${UNSUB}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
  it("refuses an empty reminder", () => {
    expect(() =>
      renderReminderEmail({
        recipientName: "T",
        sevenDays: [],
        today: [],
        appUrl: URL,
        unsubscribeUrl: UNSUB,
      }),
    ).toThrow();
  });
});

describe("digest", () => {
  const base = {
    recipientName: "Tony",
    partnerName: "Jessica",
    appUrl: URL,
    preferencesUrl: "https://app.example.test/altro/promemoria",
    unsubscribeUrl: UNSUB,
  };
  it("returns null when there is nothing to report", () => {
    expect(renderDigestEmail({ ...base, todo: [], payments: [], news: [] })).toBeNull();
  });
  it("renders sections, overdue as 'da recuperare', max 3 news, euro amounts", () => {
    const m = renderDigestEmail({
      ...base,
      todo: [
        { title: "Location", dueDate: "2026-11-20", overdue: true },
        { title: EVIL, dueDate: "2026-11-30" },
      ],
      payments: [{ description: "Acconto", amountCents: 150000, dueDate: "2026-12-01" }],
      news: ["a", "b", "c", "d"],
    });
    expect(m).not.toBeNull();
    expect(m!.text).toContain("Location, da recuperare");
    expect(m!.text).toContain("Acconto, € 1.500, martedì 1 dicembre");
    expect(m!.text).toContain("Novità di Jessica");
    expect(m!.text).toContain("e altri 1");
    expect(m!.html).toContain(ESCAPED);
    expect(m!.html).not.toContain("<img");
    expect(m!.text).toContain("Altro > Promemoria");
    expect(m!.headers?.["List-Unsubscribe"]).toBe(`<${UNSUB}>`);
  });
});
