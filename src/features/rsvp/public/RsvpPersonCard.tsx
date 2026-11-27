import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DIET_OPTIONS, NOTE_MAX, fullName, type Person, type PersonValues } from "./state";

/**
 * One card per person (design §1.1 A.3-4). NATIVE radios and checkboxes (they submit without
 * JavaScript, DES-24); the value is controlled (DES-26). `enhanced` = JavaScript is running: the
 * preferences then show only after "Sì" and the note has a counter; without it they are always
 * visible, labelled "Solo se vieni". Selection is icon + text + border, never colour alone.
 */
export function RsvpPersonCard({
  person,
  value,
  enhanced,
  coupleLabel,
  describedBy,
  onChange,
}: {
  person: Person;
  value: PersonValues;
  enhanced: boolean;
  coupleLabel: string;
  describedBy?: string | undefined;
  onChange: (next: PersonValues) => void;
}) {
  const id = person.id;
  const showDiet = !enhanced || value.status === "yes";
  const kind =
    person.category === "child" ? "Bambino" : person.category === "infant" ? "Neonato" : null;

  const choice = (status: "yes" | "no", label: string, Icon: typeof Check) => (
    <label className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-ring flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-center has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2">
      <input
        type="radio"
        name={`status:${id}`}
        value={status}
        checked={value.status === status}
        onChange={() =>
          onChange({
            ...value,
            status,
            ...(status === "no" ? { diet: [], note: "" } : {}),
          })
        }
        className="sr-only"
      />
      <Icon
        className={`size-5 shrink-0 ${value.status === status ? "" : "opacity-0"}`}
        aria-hidden="true"
      />
      <span className={value.status === status ? "font-semibold" : ""}>{label}</span>
    </label>
  );

  return (
    <fieldset
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
      aria-describedby={describedBy}
      data-testid={`rsvp-person-${id}`}
    >
      <legend className="px-1 font-semibold">
        {kind ? `${fullName(person)} · ${kind}` : fullName(person)}
      </legend>
      <input type="hidden" name="p" value={id} />
      <input type="hidden" name={`seen:${id}`} value={person.answered_at ?? ""} />
      <div className="grid grid-cols-2 gap-2">
        {choice("yes", "Sì, ci sono", Check)}
        {choice("no", "No, non posso", X)}
      </div>
      {showDiet ? (
        <fieldset id={`diet-${id}`} className="flex flex-col gap-1">
          <legend className="mb-1 font-medium">
            Preferenze alimentari (facoltative)
            {enhanced ? null : <span className="text-muted-foreground"> · Solo se vieni</span>}
          </legend>
          {DIET_OPTIONS.map((option) => (
            <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name={`diet:${id}`}
                value={option.value}
                checked={value.diet.includes(option.value)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    diet: event.target.checked
                      ? [...value.diet, option.value]
                      : value.diet.filter((d) => d !== option.value),
                  })
                }
                className="accent-primary size-6 shrink-0"
              />
              {option.label}
            </label>
          ))}
          <Label htmlFor={`note-${id}`} className="mt-2 text-base font-medium">
            Allergie o altro (max {NOTE_MAX} caratteri)
          </Label>
          <Input
            id={`note-${id}`}
            name={`note:${id}`}
            value={value.note}
            maxLength={NOTE_MAX}
            // Health data of a third party: no browser form memory or spell-check service (AC11, BR11).
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            className="h-12 text-base"
          />
          {enhanced ? (
            <span className="text-muted-foreground text-sm" aria-hidden="true">
              {value.note.length}/{NOTE_MAX}
            </span>
          ) : null}
          <p className="text-muted-foreground text-sm">Lo vedono solo {coupleLabel}.</p>
        </fieldset>
      ) : null}
    </fieldset>
  );
}
