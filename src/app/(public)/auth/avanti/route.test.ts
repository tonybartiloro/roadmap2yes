import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const resolvePostLogin = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims } }) }));
vi.mock("@/features/auth/post-login", () => ({
  INVITE_ONLY_PATH: "/su-invito",
  resolvePostLogin,
}));

const { GET } = await import("./route");
const call = () => GET(new NextRequest("http://localhost:3000/auth/avanti?next=//evil.test"));
const location = (response: Response) => response.headers.get("location");

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u1", app_metadata: {} } } });
});

describe("/auth/avanti", () => {
  it("without a session goes to the login and runs nothing", async () => {
    getClaims.mockResolvedValue({ data: null });
    expect(location(await call())).toBe("http://localhost:3000/accesso");
    expect(resolvePostLogin).not.toHaveBeenCalled();
  });

  it("redirects only to the fixed path the post-login steps chose, never to a query value", async () => {
    resolvePostLogin.mockResolvedValue({ status: "ok", to: "/onboarding" });
    expect(location(await call())).toBe("http://localhost:3000/onboarding");
    expect(resolvePostLogin).toHaveBeenCalledWith(expect.anything(), {
      id: "u1",
      app_metadata: {},
    });
  });

  it("an outage goes to the service page, any other failure to 'su invito'", async () => {
    resolvePostLogin.mockResolvedValue({ status: "error", error: { status: 540, message: "" } });
    expect(location(await call())).toBe("http://localhost:3000/servizio?motivo=paused");
    resolvePostLogin.mockResolvedValue({ status: "error", error: { code: "42501", message: "x" } });
    expect(location(await call())).toBe("http://localhost:3000/su-invito");
  });
});
