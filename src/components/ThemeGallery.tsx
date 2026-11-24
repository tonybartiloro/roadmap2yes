"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useInView } from "@/lib/hooks/use-in-view";
import { cn } from "@/lib/utils";
import { THEMES } from "@/themes/catalog";
import type { ModePreference } from "@/themes/mode";
import type { Theme } from "@/themes/types";
import { useTheme } from "./ThemeProvider";

const SYSTEM_BODY = "ui-sans-serif, system-ui, sans-serif";
const SYSTEM_HEADING = "Georgia, 'Times New Roman', serif";

const MODES: ReadonlyArray<{ value: ModePreference; label: string }> = [
  { value: "system", label: "Come il dispositivo" },
  { value: "light", label: "Chiaro" },
  { value: "dark", label: "Scuro" },
];

/**
 * Mini Home inside a container carrying its own `data-theme`/`data-mode`. Only the HEADING font
 * of a card loads, and only once the card is near the viewport; the body font loads when the
 * theme is selected (plan §8). Until then the card uses system fonts.
 */
function ThemeCard({
  theme,
  checked,
  focusable,
  mode,
  onSelect,
  onKeyDown,
  buttonRef,
}: {
  theme: Theme;
  checked: boolean;
  focusable: boolean;
  mode: "light" | "dark";
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={focusable ? 0 : -1}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        data-theme={theme.id}
        data-mode={mode}
        className={cn(
          "bg-background text-foreground border-border focus-visible:ring-ring block w-full rounded-lg border-2 p-4 text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          checked && "border-primary",
        )}
        style={{ fontFamily: checked ? undefined : SYSTEM_BODY }}
      >
        <span
          className="block text-[22px] leading-7"
          style={{
            fontFamily: inView ? "var(--font-heading)" : SYSTEM_HEADING,
            fontWeight: "var(--font-heading-weight)",
          }}
        >
          {theme.name}
        </span>
        <span className="text-muted-foreground mt-1 block text-sm">{theme.mood}</span>
        <span aria-hidden className="mt-3 flex flex-col gap-2">
          <span className="bg-muted block h-3 overflow-hidden rounded-full">
            <span className="bg-primary block h-full w-3/5" />
          </span>
          <span className="bg-card border-border flex items-center gap-2 rounded-md border p-2">
            <span className="border-input size-4 rounded-sm border-2" />
            <span className="bg-muted block h-2 flex-1 rounded-full" />
            <span className="bg-accent block h-2 w-6 rounded-full" />
          </span>
          <span className="bg-primary text-primary-foreground inline-flex h-8 items-center self-start rounded-md px-3 text-sm font-semibold">
            Pulsante
          </span>
        </span>
        {checked ? (
          <span className="text-primary mt-3 flex items-center gap-1 text-sm font-semibold">
            <Check aria-hidden className="size-4" />
            Selezionato
          </span>
        ) : null}
      </button>
    </div>
  );
}

export interface ThemeGalleryProps {
  /** Saves the theme on the wedding (server action). The cookie is written by the gallery. */
  onSave: (themeId: string) => Promise<{ ok: boolean }>;
  className?: string;
}

/**
 * Theme picker (onboarding step 8, Altro > Aspetto): `radiogroup` of cards with arrow keys.
 * Touching a card applies it provisionally to the whole interface; "Usa questo tema" saves,
 * "Annulla" goes back to the saved one. Chiaro/scuro is a per-device preference.
 */
export function ThemeGallery({ onSave, className }: ThemeGalleryProps) {
  const {
    activeThemeId,
    savedThemeId,
    isPreviewing,
    preview,
    cancelPreview,
    confirmSaved,
    mode,
    modePreference,
    setModePreference,
  } = useTheme();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(from: number, delta: number) {
    const next = (from + delta + THEMES.length) % THEMES.length;
    const theme = THEMES[next];
    if (!theme) return;
    refs.current[next]?.focus();
    void preview(theme.id);
  }

  function handleKey(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    }
  }

  async function save() {
    setSaving(true);
    setFailed(false);
    try {
      const result = await onSave(activeThemeId);
      if (result.ok) {
        confirmSaved(activeThemeId);
        toast.success("Tema applicato.");
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="text-muted-foreground">
        Scegli lo stile della tua app. Lo puoi cambiare quando vuoi.
      </p>

      <div role="group" aria-label="Aspetto chiaro o scuro" className="flex flex-wrap gap-2">
        {MODES.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={modePreference === option.value ? "default" : "outline"}
            aria-pressed={modePreference === option.value}
            onClick={() => setModePreference(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div
        role="radiogroup"
        aria-label="Tema"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {THEMES.map((theme, index) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            checked={theme.id === activeThemeId}
            focusable={theme.id === activeThemeId}
            mode={mode}
            onSelect={() => void preview(theme.id)}
            onKeyDown={(event) => handleKey(index, event)}
            buttonRef={(node) => {
              refs.current[index] = node;
            }}
          />
        ))}
      </div>

      {isPreviewing ? (
        <div
          role="group"
          aria-label="Anteprima del tema"
          className="border-border bg-card sticky bottom-24 z-20 flex flex-col gap-2 rounded-lg border p-3 shadow-md sm:flex-row sm:items-center md:bottom-4"
        >
          <p className="flex-1">
            Anteprima: <strong>{THEMES.find((t) => t.id === activeThemeId)?.name}</strong>. Nulla è
            salvato.
          </p>
          <Button type="button" variant="outline" onClick={cancelPreview} disabled={saving}>
            Annulla
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Usa questo tema
          </Button>
        </div>
      ) : (
        <p className="sr-only" aria-live="polite">
          Tema in uso: {THEMES.find((t) => t.id === savedThemeId)?.name}
        </p>
      )}
      {failed ? (
        <p role="alert" className="text-destructive text-sm">
          Non sono riuscito a salvare il tema. Riprova.
        </p>
      ) : null}
    </div>
  );
}
