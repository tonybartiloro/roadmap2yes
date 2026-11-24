// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MODE_STORAGE_KEY } from "./approved";
import { MODE_SCRIPT, isModePreference, resolveMode } from "./mode";

describe("mode helpers", () => {
  it("validates preferences", () => {
    expect(["system", "light", "dark"].every(isModePreference)).toBe(true);
    expect(isModePreference("auto")).toBe(false);
    expect(isModePreference(null)).toBe(false);
  });

  it("resolves system through prefers-color-scheme", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });
});

describe("MODE_SCRIPT (runs before first paint)", () => {
  function run(prefersDark: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: prefersDark && query.includes("dark"),
      media: query,
    })) as unknown as typeof window.matchMedia;
    new Function(MODE_SCRIPT)();
  }

  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
    document.documentElement.removeAttribute("data-mode");
    document.documentElement.style.setProperty("--background", " #123456 ");
  });

  it("applies the stored preference and aligns theme-color with --background", () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, "dark");
    run(false);
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#123456",
    );
  });

  it("ignores garbage and follows the media query", () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, "<b>x</b>");
    run(true);
    expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
    window.localStorage.clear();
    run(false);
    expect(document.documentElement.getAttribute("data-mode")).toBe("light");
  });

  it("does not throw when storage is unavailable", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("denied");
      },
    });
    expect(() => run(true)).not.toThrow();
    Reflect.deleteProperty(window, "localStorage");
  });
});
