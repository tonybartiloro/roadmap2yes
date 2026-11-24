import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
  it("lets the last Tailwind utility win", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
  it("supports conditional objects and arrays", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });
});
