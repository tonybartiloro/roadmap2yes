import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadOnboarding: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("@/features/onboarding/server", () => ({
  pageContext: async () => ({ db: {}, userId: "u1", today: "2026-11-24" }),
}));
vi.mock("@/features/onboarding/data", () => ({ loadOnboarding: mocks.loadOnboarding }));
vi.mock("@/features/onboarding/OnboardingWizard", () => ({ OnboardingWizard: () => null }));
vi.mock("@/lib/email", () => ({ emailEnabled: () => false }));

import OnboardingPage from "./page";

const open = { weddingId: "w1", completed: false, selfSlot: "A" };

beforeEach(() => mocks.loadOnboarding.mockReset());

describe("/onboarding guard", () => {
  it("founder A with the onboarding open sees the wizard", async () => {
    mocks.loadOnboarding.mockResolvedValue(open);
    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it("partner B goes Home", async () => {
    mocks.loadOnboarding.mockResolvedValue({ ...open, selfSlot: "B" });
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/");
  });

  it("a completed onboarding still renders (the summary survives the revalidation); the wizard goes Home", async () => {
    mocks.loadOnboarding.mockResolvedValue({ ...open, completed: true });
    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it("no membership goes through the post-login steps", async () => {
    mocks.loadOnboarding.mockResolvedValue(null);
    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/auth/avanti");
  });
});
