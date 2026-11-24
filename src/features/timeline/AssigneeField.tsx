"use client";

import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { assigneeName, type Assignee, type PartnerView } from "./model";

/**
 * "Chi se ne occupa?" (design §3.4): Entrambi (default) / the two partners by name. A partner who
 * has no row yet (B skipped in onboarding) is not offered.
 */
export function AssigneeField({
  value,
  onChange,
  partners,
  disabled,
}: {
  value: Assignee;
  onChange: (value: Assignee) => void;
  partners: readonly PartnerView[];
  disabled?: boolean;
}) {
  const groupId = useId();
  const labelId = `${groupId}-label`;
  const options: { value: Assignee; label: string }[] = [
    { value: "both", label: "Entrambi" },
    ...[...partners]
      .sort((x, y) => x.slot.localeCompare(y.slot))
      .map((p) => ({ value: p.slot as Assignee, label: assigneeName(partners, p.slot) })),
  ];
  return (
    <div className="flex flex-col gap-2" data-testid="assignee-field">
      <p id={labelId} className="text-base font-semibold">
        Chi se ne occupa?
      </p>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as Assignee)}
        aria-labelledby={labelId}
        disabled={disabled}
        className="gap-1"
      >
        {options.map((option) => {
          const id = `${groupId}-${option.value}`;
          return (
            <div key={option.value} className="flex min-h-11 items-center gap-3">
              <RadioGroupItem id={id} value={option.value} />
              <Label htmlFor={id} className="flex-1 py-2 text-base font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
