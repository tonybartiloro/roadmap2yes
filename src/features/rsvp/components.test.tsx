// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/invitati" }));

vi.mock("sonner", async () => {
  const actual = await vi.importActual<typeof import("sonner")>("sonner");
  const toast = Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() });
  return { ...actual, toast };
});

const actions = vi.hoisted(() => ({
  createLinksAction: vi.fn(),
  getLinkUrlAction: vi.fn(),
  rotateLinkAction: vi.fn(),
  revokeLinkAction: vi.fn(),
  markSharedAction: vi.fn(),
  unmarkSharedAction: vi.fn(),
  setGroupModeAction: vi.fn(),
}));
vi.mock("./actions", () => actions);

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { toast } from "sonner";
import { GroupModeDialog, modeConsequence } from "./GroupModeDialog";
import { LinkSheet } from "./LinkSheet";
import type { LinkState, Recipient, RsvpLink } from "./view";

const ok = <T,>(data: T) => ({ ok: true as const, data });
const URL_ = "https://example.test/rsvp/abc";
const GROUP_ID = "00000000-0000-4000-8000-000000000001";
const LINK_ID = "00000000-0000-4000-8000-000000000002";
const recipient: Recipient = {
  kind: "group",
  id: GROUP_ID,
  name: "Famiglia Rossi",
  memberIds: ["a", "b"],
};
const link: RsvpLink = {
  id: LINK_ID,
  groupId: GROUP_ID,
  guestId: null,
  working: true,
  revokedAt: null,
  sharedAt: null,
  createdAt: "2027-01-01T00:00:00Z",
};
const PREVIOUS = { shared_at: null, shared_by: null, people: [] };

function sheetProps(extra: Partial<React.ComponentProps<typeof LinkSheet>> = {}) {
  const props: React.ComponentProps<typeof LinkSheet> = {
    recipient,
    link,
    state: { kind: "to_share" } satisfies LinkState,
    expiresOn: "2027-10-03",
    dateChosen: true,
    firstNames: ["Mario", "Luca"],
    couple: ["Anna", "Marco"],
    canWrite: true,
    onOpenChange: vi.fn(),
    ...extra,
  };
  return props;
}
function sheet(extra: Partial<React.ComponentProps<typeof LinkSheet>> = {}) {
  return render(<LinkSheet {...sheetProps(extra)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.getLinkUrlAction.mockResolvedValue(ok({ url: URL_ }));
  actions.markSharedAction.mockResolvedValue(ok({ previous: PREVIOUS }));
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  delete (navigator as unknown as Record<string, unknown>)["share"];
});
afterEach(cleanup);

describe("LinkSheet", () => {
  it("shows state and expiry, and loads the URL on open (AC1)", async () => {
    sheet();
    expect(screen.getByText(/Link di Famiglia Rossi/)).toBeTruthy();
    expect(screen.getByText(/Da condividere\. Scade il 3 ottobre 2027/)).toBeTruthy();
    const box = (await screen.findByLabelText("Messaggio")) as HTMLTextAreaElement;
    expect(box.value).toContain("Ciao Mario e Luca!");
    expect(box.value).toContain(URL_);
  });

  it("says the link does not expire while the date is not chosen, and warns (BR8)", async () => {
    sheet({ expiresOn: null, dateChosen: false });
    expect(screen.getByText(/Non scade finché non scegli la data/)).toBeTruthy();
    expect(screen.getByText(/Data da confermare/)).toBeTruthy();
    await screen.findByLabelText("Messaggio");
  });

  it("with no link offers only Crea link, and creates it", async () => {
    actions.createLinksAction.mockResolvedValue(ok({ created: 1 }));
    sheet({ link: null, state: { kind: "none" } });
    expect(screen.queryByText("Copia link")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Crea link" }));
    expect(actions.createLinksAction).toHaveBeenCalledWith({ targets: [{ groupId: GROUP_ID }] });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("after the expiry there is no Crea link and no Nuovo link, and one wording only (AC12)", () => {
    sheet({ link: null, state: { kind: "expired", on: "2027-10-03" } });
    expect(
      screen.getByText(
        "Scaduto il 3 ottobre 2027. Se sposti la data, i link tornano a funzionare da soli.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Scade il/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Crea/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuovo link" })).toBeNull();
    expect(actions.getLinkUrlAction).not.toHaveBeenCalled();
  });

  it("copy marks as shared with an Annulla INSIDE the sheet, not a toast (DES-45)", async () => {
    sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Copia link" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_);
    await waitFor(() => expect(actions.markSharedAction).toHaveBeenCalledWith({ linkId: LINK_ID }));
    const status = await screen.findByText(/Link copiato · Condiviso il \d+ \w+/);
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
    actions.unmarkSharedAction.mockResolvedValue(ok({ linkId: LINK_ID }));
    nav.refresh.mockClear();
    const undo = within(status.parentElement!).getByRole("button", { name: "Annulla" });
    expect(undo.className).toContain("min-h-11");
    await userEvent.click(undo);
    expect(actions.unmarkSharedAction).toHaveBeenCalledWith({
      linkId: LINK_ID,
      previous: PREVIOUS,
    });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(screen.queryByText(/Link copiato · Condiviso/)).toBeNull();
  });

  it("closing the sheet inside the window hands Annulla to a toast for the time left", async () => {
    const view = sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Copia link" }));
    await screen.findByText(/Link copiato · Condiviso il/);
    view.unmount();
    const [message, options] = vi.mocked(toast).mock.calls.at(-1) as unknown as [
      string,
      { duration: number; action: { label: string; onClick: () => void } },
    ];
    expect(message).toMatch(/Link copiato · Condiviso il/);
    expect(options.action.label).toBe("Annulla");
    expect(options.duration).toBeGreaterThan(8000);
  });

  it("a failed 'Condiviso' write says so in the sheet (no toast under the overlay)", async () => {
    actions.markSharedAction.mockResolvedValue({ ok: false, code: "x", message: "no" });
    sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Copia link" }));
    expect(await screen.findByText(/segnare il link come condiviso/)).toBeTruthy();
    expect(screen.queryByText(/Condiviso il/)).toBeNull();
  });

  it("the edited message is what WhatsApp and Condividi carry", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    sheet();
    const box = await screen.findByLabelText("Messaggio");
    await userEvent.clear(box);
    await userEvent.type(box, "Ciao! {Enter}Eccoci");
    const a = screen.getByRole("link", { name: "WhatsApp" }) as HTMLAnchorElement;
    expect(decodeURIComponent(a.href)).toContain("Eccoci");
    await userEvent.click(screen.getByRole("button", { name: "Condividi" }));
    expect(share).toHaveBeenCalledWith({ text: expect.stringContaining("Eccoci") });
  });

  it("an answer for a link that is no longer the current one is ignored (race)", async () => {
    let resolveOld: (v: unknown) => void = () => {};
    actions.getLinkUrlAction.mockImplementation(({ linkId }: { linkId: string }) =>
      linkId === LINK_ID
        ? new Promise((resolve) => (resolveOld = resolve))
        : Promise.resolve(ok({ url: "https://example.test/rsvp/new" })),
    );
    const view = sheet();
    view.rerender(<LinkSheet {...sheetProps({ link: { ...link, id: "other-link" } })} />);
    expect(((await screen.findByLabelText("Messaggio")) as HTMLTextAreaElement).value).toContain(
      "rsvp/new",
    );
    resolveOld(ok({ url: URL_ }));
    await Promise.resolve();
    expect(
      ((await screen.findByLabelText("Messaggio")) as HTMLTextAreaElement).value,
    ).not.toContain(URL_);
  });

  it("starts with the focus on the title, not on 'Nuovo link' (DES-46)", async () => {
    sheet();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: /Link di/ })),
    );
  });

  it("a refused clipboard shows the URL and never marks as shared", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Copia link" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Indirizzo del link") as HTMLInputElement).value).toBe(URL_);
    expect(actions.markSharedAction).not.toHaveBeenCalled();
  });

  it("Condividi only exists with navigator.share; AbortError does not mark", async () => {
    sheet();
    await screen.findByRole("button", { name: "Copia link" });
    expect(screen.queryByRole("button", { name: "Condividi" })).toBeNull();
    cleanup();
    const share = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("cancelled", "AbortError"))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    sheet();
    const button = await screen.findByRole("button", { name: "Condividi" });
    await userEvent.click(button);
    expect(actions.markSharedAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(button);
    await waitFor(() => expect(actions.markSharedAction).toHaveBeenCalledTimes(1));
  });

  it("WhatsApp is a plain wa.me anchor and marks as shared", async () => {
    sheet();
    const a = (await screen.findByRole("link", { name: "WhatsApp" })) as HTMLAnchorElement;
    expect(a.href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(a.href)).toContain(URL_);
    a.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(a);
    await waitFor(() => expect(actions.markSharedAction).toHaveBeenCalled());
  });

  it("a hash mismatch says it must be regenerated, keeps Nuovo link and has no Riprova (REV-24)", async () => {
    actions.getLinkUrlAction.mockResolvedValue({ ok: false, code: "stale", message: "x" });
    sheet();
    expect(await screen.findByText(/Questo link va rigenerato\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuovo link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Riprova" })).toBeNull();
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it.each(["link_not_found", "link_not_working"])(
    "%s means the screen is out of date: its own message, a refresh, no Riprova",
    async (code) => {
      actions.getLinkUrlAction.mockResolvedValue({
        ok: false,
        code,
        message: "Nel frattempo qualcosa è cambiato.",
      });
      sheet();
      expect(await screen.findByText("Nel frattempo qualcosa è cambiato.")).toBeTruthy();
      expect(screen.queryByText(/va rigenerato/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Riprova" })).toBeNull();
      expect(nav.refresh).toHaveBeenCalled();
    },
  );

  it("an offline read of the URL is a readable error with Riprova", async () => {
    actions.getLinkUrlAction.mockRejectedValueOnce(new Error("network"));
    sheet();
    expect(await screen.findByText(/Non sono riuscito a creare il link/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeTruthy();
  });

  it("'Da rimandare' uses one cause-neutral line and 'Crea un nuovo link' also on reopen (D8)", () => {
    sheet({
      link: null,
      hadLink: true,
      state: { kind: "resend", guestIds: ["a"] },
      resendNames: ["Mario Rossi"],
    });
    expect(
      screen.getByText(
        "Il link che avevi mandato non funziona più: mandane uno nuovo. Riguarda Mario Rossi.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/cambiato di gruppo/)).toBeNull();
    expect(screen.getByRole("button", { name: "Crea un nuovo link" })).toBeTruthy();
  });

  it("a failure to read the URL offers Riprova", async () => {
    actions.getLinkUrlAction.mockResolvedValueOnce({
      ok: false,
      code: "secret",
      message: "Non sono riuscito a creare il link. Riprova.",
    });
    sheet();
    expect(await screen.findByText(/Non sono riuscito a creare il link/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(await screen.findByLabelText("Messaggio")).toBeTruthy();
  });

  it("Nuovo link asks first, with the consequence", async () => {
    actions.rotateLinkAction.mockResolvedValue(ok({ linkId: "n" }));
    sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo link" }));
    expect(screen.getByText(/Quello vecchio smette di funzionare: dovrai rimandarlo/)).toBeTruthy();
    expect(actions.rotateLinkAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Crea nuovo link" }));
    expect(actions.rotateLinkAction).toHaveBeenCalledWith({ linkId: LINK_ID });
  });

  it("after Nuovo link the dead URL is not offered until the new link arrives (REV-123)", async () => {
    actions.rotateLinkAction.mockResolvedValue(ok({ linkId: "n" }));
    const view = sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo link" }));
    await userEvent.click(screen.getByRole("button", { name: "Crea nuovo link" }));
    await waitFor(() => expect(actions.rotateLinkAction).toHaveBeenCalled());
    // The refresh has not returned: the old link prop is still there.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Copia link" })).toBeNull());
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Crea/ })).toBeNull();
    expect(screen.getByRole("status", { name: "Carico il link" })).toBeTruthy();
    actions.getLinkUrlAction.mockResolvedValue(ok({ url: "https://example.test/rsvp/new" }));
    view.rerender(<LinkSheet {...sheetProps({ link: { ...link, id: "new-link" } })} />);
    expect(await screen.findByRole("button", { name: "Copia link" })).toBeTruthy();
    expect(((await screen.findByLabelText("Messaggio")) as HTMLTextAreaElement).value).toContain(
      "rsvp/new",
    );
  });

  it("gives the focus back to the opener when the confirmation closes (DES-51)", async () => {
    sheet();
    const opener = await screen.findByRole("button", { name: "Nuovo link" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("Revoca asks first, then Crea un nuovo link takes its place (AC7)", async () => {
    actions.revokeLinkAction.mockResolvedValue(ok({ linkId: LINK_ID }));
    sheet();
    await userEvent.click(await screen.findByRole("button", { name: "Revoca link" }));
    expect(screen.getByText(/Le risposte già date restano/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Revoca" }));
    expect(actions.revokeLinkAction).toHaveBeenCalledWith({ linkId: LINK_ID });
    expect(await screen.findByRole("button", { name: "Crea un nuovo link" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copia link" })).toBeNull();
  });

  it("without write permission the actions are hidden with a text", () => {
    sheet({ canWrite: false });
    expect(screen.getByText("Serve il permesso di modifica.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nuovo link" })).toBeNull();
    expect(actions.getLinkUrlAction).not.toHaveBeenCalled();
  });
});

describe("GroupModeDialog", () => {
  function dialog(mode: "together" | "separate" = "together") {
    const onOpenChange = vi.fn();
    render(
      <GroupModeDialog
        groupId={GROUP_ID}
        groupName="Famiglia Rossi"
        version={3}
        mode={mode}
        people={4}
        personalLinks={4}
        groupLink
        onOpenChange={onOpenChange}
      />,
    );
    return onOpenChange;
  }

  it("writes the real number and starts with the focus on Annulla", async () => {
    dialog();
    expect(screen.getByText(/servono 4 link nuovi/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Annulla")));
  });

  it("names only the consequences that exist (DES-52, REV-28)", () => {
    const c = (to: "together" | "separate", personalLinks: number, groupLink: boolean) =>
      modeConsequence(to, { people: 4, personalLinks, groupLink });
    expect(c("together", 4, false)).toContain("i 4 link personali smettono di funzionare");
    expect(c("together", 1, false)).toContain("il link personale smette di funzionare");
    expect(c("together", 0, false)).toBe(
      'Passando a "insieme" basta un solo link per il gruppo. Nessun link da disattivare.',
    );
    expect(c("together", 0, false)).not.toMatch(/\b0\b/);
    expect(c("separate", 0, true)).toContain("il link del gruppo smette di funzionare");
    expect(c("separate", 0, false)).not.toContain("link del gruppo");
    expect(c("separate", 0, false)).toContain("Nessun link da disattivare");
  });

  it("a network failure is said in words and nothing changes", async () => {
    actions.setGroupModeAction.mockRejectedValue(new Error("offline"));
    const onOpenChange = dialog();
    await userEvent.click(screen.getByRole("button", { name: /Passa a ognuno per sé/ }));
    expect(await screen.findByText(/Controlla la connessione/)).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("confirms with the version the person saw", async () => {
    actions.setGroupModeAction.mockResolvedValue(ok({ version: 4 }));
    const onOpenChange = dialog();
    await userEvent.click(screen.getByRole("button", { name: /Passa a ognuno per sé/ }));
    expect(actions.setGroupModeAction).toHaveBeenCalledWith({
      groupId: GROUP_ID,
      version: 3,
      mode: "separate",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a failure in words and stays open", async () => {
    actions.setGroupModeAction.mockResolvedValue({
      ok: false,
      code: "x",
      message: "Non ci sono riuscito.",
    });
    const onOpenChange = dialog("separate");
    await userEvent.click(screen.getByRole("button", { name: /Passa a insieme/ }));
    expect(await screen.findByText("Non ci sono riuscito.")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
