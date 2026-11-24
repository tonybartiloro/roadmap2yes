// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => {
  const noop = async () => ({ status: "idle" as const });
  return {
    createPartnerWithCodeAction: noop,
    inviteByEmailAction: noop,
    resendInviteAction: noop,
    revokeInviteAction: noop,
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
