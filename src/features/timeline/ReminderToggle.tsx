"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * "Ricordamelo per email, 7 giorni prima e il giorno stesso" (AC61, D39), on by default. For a
 * task of Entrambi the reminder goes to both partners. When emails are off the toggle still saves
 * the preference, with a note (the app sends nothing until emails are on, AC59).
 */
export function ReminderToggle({
  checked,
  onCheckedChange,
  bothAssigned,
  emailEnabled = true,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  /** The task is assigned to Entrambi: the reminder goes to both. */
  bothAssigned?: boolean;
  emailEnabled?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor={id} className="text-base">
          Ricordamelo per email, 7 giorni prima e il giorno stesso
        </Label>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-describedby={bothAssigned || !emailEnabled ? hintId : undefined}
        />
      </div>
      {bothAssigned || !emailEnabled ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {bothAssigned ? "Il promemoria arriva a tutti e due. " : ""}
          {emailEnabled ? "" : "Le email sono spente: per ora i promemoria li trovi solo nell'app."}
        </p>
      ) : null}
    </div>
  );
}
