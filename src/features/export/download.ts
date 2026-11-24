/**
 * Saves a text as a file through the browser (Blob + temporary link). Only runs in the browser.
 * The content is kept as it is, BOM of the CSV included.
 */
export function downloadText(fileName: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by now; the URL is released on the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
