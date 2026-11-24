// @vitest-environment node
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  loadPreferences: vi.fn(),
  pageContext: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/app-config", () => ({ readEmailConfig: () => ({ enabled: mocks.enabled }) }));
vi.mock("@/features/notifications/data", () => ({ loadPreferences: mocks.loadPreferences }));
vi.mock("@/features/notifications/server", () => ({ pageContext: mocks.pageContext }));
vi.mock("@/features/notifications/PreferenceSwitches", () => ({
  PreferenceSwitches: ({ initial }: { initial: unknown }) => (
    <div data-testid="switches">{JSON.stringify(initial)}</div>
  ),
}));

import PromemoriaPage from "./page";

async function html(): Promise<string> {
  const stream = await renderToReadableStream(await PromemoriaPage());
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pageContext.mockResolvedValue({ db: {}, userId: "user-1" });
  mocks.loadPreferences.mockResolvedValue({ reminders: true, digest: false });
});

describe("Promemoria page (AC59)", () => {
  it("with email off shows the explanation, no switches, and reads nothing from the database", async () => {
    mocks.enabled = false;
    const out = await html();
    expect(out).toContain('data-testid="email-off-explanation"');
    expect(out).toContain("Le email sono spente");
    expect(out).not.toContain('data-testid="switches"');
    expect(mocks.pageContext).not.toHaveBeenCalled();
    expect(mocks.loadPreferences).not.toHaveBeenCalled();
  });

  it("with email on shows the switches with the saved state and no explanation", async () => {
    mocks.enabled = true;
    const out = await html();
    expect(out).toContain('data-testid="switches"');
    expect(out).toContain("&quot;digest&quot;:false");
    expect(out).not.toContain("email-off-explanation");
    expect(mocks.loadPreferences).toHaveBeenCalledWith({}, "user-1");
  });
});
