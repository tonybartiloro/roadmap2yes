"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setPreferenceAction } from "./actions";
import type { PreferenceKind, Preferences } from "./data";

const ROWS: ReadonlyArray<{
  kind: PreferenceKind;
  label: string;
  description: string;
}> = [
  {
    kind: "reminders",
    label: "Promemoria delle scadenze",
    description:
      "Ti scriviamo 7 giorni prima e il giorno stesso, per i compiti tuoi o di entrambi con il promemoria attivo.",
  },
  {
    kind: "digest",
    label: "Riepilogo del lunedì",
    description:
      "Compiti in scadenza o da recuperare, pagamenti in arrivo e novità del tuo partner. Se non c'è nulla, non ti scriviamo.",
  },
];

/**
 * The two independent switches. A change shows at once; if saving fails the switch goes back and a
 * toast says so (design §4, "l'interruttore torna indietro").
 */
export function PreferenceSwitches({ initial }: { initial: Preferences }) {
  const [values, setValues] = useState<Preferences>(initial);
  const [pending, setPending] = useState<PreferenceKind | null>(null);

  async function change(kind: PreferenceKind, enabled: boolean) {
    const before = values[kind];
    setValues((current) => ({ ...current, [kind]: enabled }));
    setPending(kind);
    try {
      const result = await setPreferenceAction({ kind, enabled });
      if (!result.ok) {
        setValues((current) => ({ ...current, [kind]: before }));
        toast.error(result.message);
      }
    } catch {
      setValues((current) => ({ ...current, [kind]: before }));
      toast.error("Non sono riuscito a salvare. Riprova tra un attimo.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {ROWS.map(({ kind, label, description }) => (
        <div
          key={kind}
          className="border-border bg-card flex items-start justify-between gap-4 rounded-lg border p-4"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor={`pref-${kind}`} className="text-base font-semibold">
              {label}
            </Label>
            <p id={`pref-${kind}-hint`} className="text-muted-foreground text-sm">
              {description}
            </p>
          </div>
          <Switch
            id={`pref-${kind}`}
            data-testid={`pref-${kind}`}
            aria-describedby={`pref-${kind}-hint`}
            checked={values[kind]}
            disabled={pending === kind}
            onCheckedChange={(checked) => void change(kind, checked)}
          />
        </div>
      ))}
      <p className="text-muted-foreground text-sm">
        Le email di accesso e di invito non si possono disattivare.
      </p>
    </div>
  );
}
