// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const revokeSpy = vi.fn(async () => ({ status: "idle" as const }));
vi.mock("./actions", () => {
  const noop = async () => ({ status: "idle" as const });
  return {
    revokeInviteAction: (...args: unknown[]) =>
      (revokeSpy as (...a: unknown[]) => unknown)(...args),
    createPartnerWithCodeAction: noop,
    inviteByEmailAction: noop,
    resendInviteAction: noop,
    changePendingEmailAction: noop,
    setTemporaryCodeAction: noop,
  };
});
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const {
  ChangePendingEmailForm,
  CreateWithCodeForm,
  InviteByEmailForm,
  ResendForm,
  RevokeForm,
  TemporaryCodeForm,
} = await import("./InviteForms");

afterEach(() => cleanup());

const defaults = { email: "", firstName: "", lastName: "", label: "" };

function renderAll() {
  return render(
    <div>
      <CreateWithCodeForm defaults={defaults} />
      <InviteByEmailForm defaults={defaults} />
      <ResendForm invitationId="00000000-0000-4000-8000-000000000001" />
      <RevokeForm invitationId="00000000-0000-4000-8000-000000000001" partnerName="Jessica" />
      <ChangePendingEmailForm currentEmail="b@example.test" />
      <TemporaryCodeForm
        partnerName="Jessica"
        subject={{ email: "b@example.test", firstName: null, lastName: null }}
      />
    </div>,
  );
}

describe("Altro > Invito ids and accessible names (code-16 REV-2)", () => {
  it("every email input has an accessible name", () => {
    render(<InviteByEmailForm defaults={defaults} />);
    expect(screen.getByRole("textbox", { name: "Email del tuo partner" })).toBeTruthy();
    cleanup();
    render(<ChangePendingEmailForm currentEmail="b@example.test" />);
    expect(screen.getByRole("textbox", { name: "La nuova email" })).toBeTruthy();
  });

  it("no DOM id is repeated among the forms, nor between the forms and the page headings", () => {
    const { container } = renderAll();
    const formIds = [...container.querySelectorAll("[id]")].map((el) => el.id);
    const page = readFileSync("src/app/(app)/altro/invito/page.tsx", "utf8");
    const pageIds = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1] as string);
    const all = [...formIds, ...new Set(pageIds)];
    const duplicated = all.filter((id, index) => all.indexOf(id) !== index);
    expect(duplicated).toEqual([]);
  });
});

describe("revoke confirmation (QA-1)", () => {
  it("'Sì, revoca' really submits the form with the invitation id, then the dialog closes", async () => {
    render(
      <RevokeForm invitationId="00000000-0000-4000-8000-000000000001" partnerName="Jessica" />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("revoke-open"));
    await user.click(await screen.findByTestId("revoke-confirm"));
    await waitFor(() => expect(revokeSpy).toHaveBeenCalledTimes(1));
    const sent = (revokeSpy.mock.calls[0] as unknown[])[1] as FormData;
    expect(sent.get("invitationId")).toBe("00000000-0000-4000-8000-000000000001");
    await waitFor(() => expect(screen.queryByTestId("revoke-confirm")).toBeNull());
  });

  it("'No, lascia stare' sends nothing", async () => {
    revokeSpy.mockClear();
    render(
      <RevokeForm invitationId="00000000-0000-4000-8000-000000000001" partnerName="Jessica" />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("revoke-open"));
    await user.click(await screen.findByRole("button", { name: "No, lascia stare" }));
    expect(revokeSpy).not.toHaveBeenCalled();
  });
});
