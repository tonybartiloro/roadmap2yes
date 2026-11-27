/** Page texts that depend on data (design §1.1). Pure, no Node imports. */

const DATE_FORMAT = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const DATE_TBC = "Data da confermare";
export const LOCATION_TBC = "Luogo da confermare";

/** "2027-09-03" -> "sabato 3 settembre 2027"; null or unreadable -> "Data da confermare". */
export function dateText(date: string | null): string {
  if (!date) return DATE_TBC;
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? DATE_TBC : DATE_FORMAT.format(parsed);
}

/** "Villa Aurora, Tivoli"; null -> "Luogo da confermare". */
export function locationText(location: { name: string; comune: string | null } | null): string {
  if (!location) return LOCATION_TBC;
  return location.comune ? `${location.name}, ${location.comune}` : location.name;
}

/** The one definition of "has a name": trimmed and not blank. */
export function coupleNameList(couple: readonly (string | null)[]): string[] {
  return couple.filter((name): name is string => Boolean(name && name.trim()));
}
const names = coupleNameList;

/** h1 of the page. */
export function coupleTitle(couple: readonly (string | null)[]): string {
  const [first, second] = names(couple);
  if (first && second) return `${first} e ${second} si sposano`;
  if (first) return `${first} si sposa`;
  return "Un matrimonio";
}

/** "Anna e Marco"; falls back to "chi ti ha invitato" (privacy note). */
export function coupleNames(couple: readonly (string | null)[]): string {
  const [first, second] = names(couple);
  if (first && second) return `${first} e ${second}`;
  return first ?? "chi ti ha invitato";
}
