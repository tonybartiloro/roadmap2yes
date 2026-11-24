/** CSS variable exposed by the `next/font/google` declaration of a family (`--font-dm-serif-display`). */
export function fontVariableName(family: string): string {
  return `--font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
