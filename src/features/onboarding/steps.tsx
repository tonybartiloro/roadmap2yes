"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AccessCodeField } from "@/components/AccessCodeField";
import { MoneyInput } from "@/components/MoneyInput";
import { ThemeGallery } from "@/components/ThemeGallery";
import { useTheme } from "@/components/ThemeProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { STYLE_LABELS } from "@/content/style-tips";
import { saveThemeAction } from "@/features/appearance/actions";
import { formatCents, parseEuroToCents } from "@/lib/money";
import type { PlainDate } from "@/lib/dates/plain-date";
import type { Failure, OnboardingState } from "./data";
import { ChoiceCards, Drafted, TextArea } from "./form-bits";
import {
  GUEST_BANDS,
  GUEST_BAND_LABELS,
  REGIONS,
  RITE_NOTE,
  RITE_OPTIONS,
  defaultScenario,
  parseScenario,
  scenarioProblem,
  type GuestBand,
  type PartnerMode,
  type ScenarioDraft,
} from "./model";
import { PersonForm, TextField, labelOf, personValueOf, type PersonValue } from "./PersonForm";
import { ScenarioEditor } from "./ScenarioEditor";
import type { Rite } from "@/content/milestones";

/** The eight steps of the wizard. Each one saves on "Continua" and keeps a local draft until then. */

export interface StepContext {
  state: OnboardingState;
  scope: string;
  busy: boolean;
  failure: Failure | null;
  /** Sends the step; resolves `true` when it was saved (the draft is then cleared). */
  submit: (input: Record<string, unknown>) => Promise<boolean>;
  onBack: (() => void) | null;
  emailOn: boolean;
  today: PlainDate;
}

function Actions({
  busy,
  onBack,
  onSkip,
  primary = "Continua",
}: {
  busy: boolean;
  onBack: (() => void) | null;
  onSkip?: () => void;
  primary?: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {onBack ? (
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Indietro
        </Button>
      ) : null}
      {onSkip ? (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={onSkip}
          disabled={busy}
          data-testid="step-skip"
        >
          Non lo so ancora
        </Button>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={busy}
        aria-busy={busy}
        className="sm:ml-auto"
        data-testid="step-continue"
      >
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
        {primary}
      </Button>
    </div>
  );
}

function FailureNote({
  failure,
  fieldHandled,
}: {
  failure: Failure | null;
  fieldHandled?: boolean;
}) {
  if (!failure || fieldHandled) return null;
  return (
    <Alert variant="destructive" data-testid="onboarding-error">
      <AlertDescription>{failure.message}</AlertDescription>
    </Alert>
  );
}

const fieldOf = (failure: Failure | null, name: string): string | undefined =>
  failure?.field === name ? failure.message : undefined;

function StepForm({
  onSubmit,
  children,
}: {
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      {children}
    </form>
  );
}

// ------------------------------------------------------------------------------------- 1. you

type YouDraft = PersonValue;

export function YouStep(ctx: StepContext) {
  const you = ctx.state.you;
  const saved: YouDraft = personValueOf(you ?? { firstName: null, lastName: null, label: null });
  return (
    <Drafted draftKey="step-you" scope={ctx.scope} saved={saved}>
      {({ initial, save, clear }) => (
        <YouForm ctx={ctx} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function YouForm({
  ctx,
  initial,
  save,
  clear,
}: {
  ctx: StepContext;
  initial: YouDraft;
  save: (value: YouDraft) => void;
  clear: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [missing, setMissing] = useState(false);
  const change = (next: PersonValue) => {
    setValue(next);
    save(next);
  };
  return (
    <StepForm
      onSubmit={async () => {
        if (value.firstName.trim() === "") {
          setMissing(true);
          return;
        }
        setMissing(false);
        const ok = await ctx.submit({
          step: "you",
          firstName: value.firstName,
          lastName: value.lastName,
          label: labelOf(value),
        });
        if (ok) clear();
      }}
    >
      <PersonForm
        idPrefix="you"
        value={value}
        onChange={change}
        email={{
          kind: "readonly",
          value: ctx.state.you?.email ?? "",
          hint: "È l'email con cui entri: non si cambia qui.",
        }}
        firstNameRequired
        firstNameError={missing ? "Scrivi il tuo nome." : undefined}
      />
      <FailureNote failure={ctx.failure} />
      <Actions busy={ctx.busy} onBack={ctx.onBack} />
    </StepForm>
  );
}

// -------------------------------------------------------------------------------- 2. partner

type PartnerDraft = PersonValue & { email: string; mode: PartnerMode; inviteAtEnd: boolean };

export function PartnerStep(ctx: StepContext) {
  const { partner, answers, invitation } = ctx.state;
  const saved: PartnerDraft = {
    ...personValueOf(partner ?? { firstName: null, lastName: null, label: null }),
    email: partner?.email ?? "",
    mode:
      answers.partnerMode ??
      (invitation?.method === "code" ? "code" : ctx.emailOn ? "email" : "code"),
    inviteAtEnd: answers.inviteAtEnd,
  };
  return (
    <Drafted draftKey="step-partner" scope={ctx.scope} saved={saved}>
      {({ initial, save, clear }) => (
        <PartnerForm ctx={ctx} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function PartnerForm({
  ctx,
  initial,
  save,
  clear,
}: {
  ctx: StepContext;
  initial: PartnerDraft;
  save: (value: PartnerDraft) => void;
  clear: () => void;
}) {
  const { partner, invitation } = ctx.state;
  const [value, setValue] = useState(initial);
  // The code is NEVER part of the draft: it lives only in this state, until the step is saved.
  const [code, setCode] = useState("");
  const [local, setLocal] = useState<{ field: string; message: string } | null>(null);
  const change = (next: PartnerDraft) => {
    setValue(next);
    save(next);
  };

  if (partner?.joined) {
    return (
      <StepForm
        onSubmit={async () => {
          const ok = await ctx.submit({ step: "partner", skip: true });
          if (ok) clear();
        }}
      >
        <p data-testid="partner-joined">
          {partner.firstName?.trim() || "Il tuo partner"} ha già fatto il primo accesso: i dati di
          accesso li gestisce da sé.
        </p>
        <Actions busy={ctx.busy} onBack={ctx.onBack} />
      </StepForm>
    );
  }

  const email = value.email.trim().toLowerCase();
  const codeReady = invitation?.method === "code" && invitation.email === email;
  const fieldError = (name: string) =>
    local?.field === name ? local.message : fieldOf(ctx.failure, name);
  const handled = Boolean(local) || Boolean(ctx.failure?.field);

  const modes: ReadonlyArray<{ value: PartnerMode; label: string; hint: string }> = [
    {
      value: "code",
      label: "Con un codice che consegni di persona",
      hint: "Funziona sempre. Potrà cambiarlo al primo accesso.",
    },
    ...(ctx.emailOn
      ? [
          {
            value: "email" as const,
            label: "Con un invito via email",
            hint: "Riceve un link e sceglie il suo codice.",
          },
        ]
      : []),
    {
      value: "later",
      label: "Più tardi",
      hint: "Salviamo i dati; l'invito lo fai da Opzioni > Invito al partner.",
    },
  ];

  return (
    <StepForm
      onSubmit={async () => {
        if (email === "") {
          setLocal({ field: "email", message: "Scrivi l'email del tuo partner." });
          return;
        }
        if (value.mode === "code" && code === "" && !codeReady) {
          setLocal({
            field: "code",
            message: "Scrivi o genera un codice da consegnare di persona.",
          });
          return;
        }
        setLocal(null);
        const ok = await ctx.submit({
          step: "partner",
          skip: false,
          email: value.email,
          firstName: value.firstName,
          lastName: value.lastName,
          label: labelOf(value),
          mode: value.mode,
          inviteAtEnd: value.inviteAtEnd,
          ...(value.mode === "code" && code !== "" ? { code } : {}),
        });
        if (ok) {
          setCode("");
          clear();
        }
      }}
    >
      <PersonForm
        idPrefix="partner"
        labelLegend="Come vuoi chiamare il tuo partner?"
        value={value}
        onChange={(next) => change({ ...value, ...next })}
        email={{
          kind: "editable",
          value: value.email,
          onChange: (next) => change({ ...value, email: next }),
          error: fieldError("email"),
        }}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base leading-6 font-semibold">Come entra nell&apos;app?</legend>
        <RadioGroup
          value={value.mode}
          onValueChange={(mode) => change({ ...value, mode: mode as PartnerMode })}
          aria-label="Come entra nell'app?"
        >
          {modes.map((mode) => (
            <Label
              key={mode.value}
              htmlFor={`partner-mode-${mode.value}`}
              className="border-border bg-card hover:bg-muted flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-4 font-normal"
            >
              <RadioGroupItem
                id={`partner-mode-${mode.value}`}
                value={mode.value}
                data-testid={`partner-mode-${mode.value}`}
              />
              <span className="flex flex-col">
                <span className="font-semibold">{mode.label}</span>
                <span className="text-muted-foreground text-sm">{mode.hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {!ctx.emailOn ? (
          <p className="text-muted-foreground text-sm" data-testid="partner-email-off">
            Le email dell&apos;app sono spente: l&apos;invito via email non c&apos;è. Il codice lo
            consegni tu di persona.
          </p>
        ) : null}
      </fieldset>

      {value.mode === "code" ? (
        <div className="flex flex-col gap-3">
          {codeReady ? (
            <p className="text-muted-foreground" data-testid="partner-code-ready">
              <strong>Accesso creato.</strong> Per cambiare il codice o l&apos;invito usa{" "}
              <Link href="/altro/invito" className="text-primary underline underline-offset-4">
                Opzioni &gt; Invito
              </Link>{" "}
              (da lì puoi impostare un codice temporaneo). Qui puoi continuare.
            </p>
          ) : (
            <>
              <AccessCodeField
                label="Il codice iniziale"
                name="partnerAccessCode"
                id="partner-code"
                mode="new"
                value={code}
                onChange={setCode}
                subject={{
                  email: value.email,
                  firstName: value.firstName,
                  lastName: value.lastName,
                }}
                error={fieldError("code")}
              />
              <p className="text-muted-foreground text-sm">
                Consegnalo di persona: dopo la conferma non lo rivedrai.
              </p>
            </>
          )}
        </div>
      ) : null}

      {value.mode === "email" ? (
        <div className="flex items-center gap-3">
          <Switch
            id="partner-invite-at-end"
            checked={value.inviteAtEnd}
            onCheckedChange={(inviteAtEnd) => change({ ...value, inviteAtEnd })}
            data-testid="partner-invite-at-end"
          />
          <Label htmlFor="partner-invite-at-end" className="font-normal">
            Invia l&apos;invito alla fine
          </Label>
        </div>
      ) : null}

      <FailureNote failure={ctx.failure} fieldHandled={handled} />
      <Actions
        busy={ctx.busy}
        onBack={ctx.onBack}
        onSkip={async () => {
          const ok = await ctx.submit({ step: "partner", skip: true });
          if (ok) clear();
        }}
      />
    </StepForm>
  );
}

// ----------------------------------------------------------------------------------- 3. rite

export function RiteStep(ctx: StepContext) {
  const [rite, setRite] = useState<Rite | null>(ctx.state.rite);
  const [missing, setMissing] = useState(false);
  return (
    <StepForm
      onSubmit={async () => {
        if (!rite) {
          setMissing(true);
          return;
        }
        await ctx.submit({ step: "rite", rite });
      }}
    >
      <ChoiceCards
        legend="Tipo di cerimonia"
        value={rite}
        onChange={(next) => {
          setRite(next);
          setMissing(false);
        }}
        options={RITE_OPTIONS}
        error={missing ? "Scegli un'opzione, anche «Non lo so ancora»." : undefined}
        testId="rite-choices"
      />
      <p className="text-muted-foreground">{RITE_NOTE}</p>
      <FailureNote failure={ctx.failure} />
      <Actions busy={ctx.busy} onBack={ctx.onBack} />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------------- 4. dates

interface DatesDraft {
  scenarios: ScenarioDraft[];
}

export function DatesStep(ctx: StepContext) {
  const { answers } = ctx.state;
  // The first visit starts with the prefilled scenario; once confirmed, what was saved is shown.
  const initialScenarios =
    answers.lastStep >= 4 || answers.scenarios.length > 0
      ? [...answers.scenarios]
      : [defaultScenario()];
  const saved: DatesDraft = { scenarios: initialScenarios };
  return (
    <Drafted
      draftKey="step-dates"
      scope={ctx.scope}
      saved={saved}
      sanitize={(draft) => {
        const list = Array.isArray(draft.scenarios) ? draft.scenarios : [];
        const clean = list.filter(
          (item): item is ScenarioDraft =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            (item.kind === "fixed" || item.kind === "period") &&
            typeof item.dateFrom === "string" &&
            (item.dateTo === null || typeof item.dateTo === "string") &&
            (item.label === null || typeof item.label === "string"),
        );
        return { scenarios: clean };
      }}
    >
      {({ initial, save, clear }) => (
        <DatesForm ctx={ctx} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function DatesForm({
  ctx,
  initial,
  save,
  clear,
}: {
  ctx: StepContext;
  initial: DatesDraft;
  save: (value: DatesDraft) => void;
  clear: () => void;
}) {
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>(initial.scenarios);
  const [showProblems, setShowProblems] = useState(false);
  const change = (next: ScenarioDraft[]) => {
    setScenarios(next);
    save({ scenarios: next });
  };
  return (
    <StepForm
      onSubmit={async () => {
        if (
          scenarios.some((item) => scenarioProblem(item) !== null || parseScenario(item) === null)
        ) {
          setShowProblems(true);
          return;
        }
        const ok = await ctx.submit({ step: "dates", skip: false, scenarios });
        if (ok) clear();
      }}
    >
      <ScenarioEditor
        scenarios={scenarios}
        onChange={change}
        today={ctx.today}
        showProblems={showProblems}
      />
      <FailureNote failure={ctx.failure} />
      <Actions
        busy={ctx.busy}
        onBack={ctx.onBack}
        onSkip={async () => {
          const ok = await ctx.submit({ step: "dates", skip: true, scenarios: [] });
          if (ok) clear();
        }}
      />
    </StepForm>
  );
}

// -------------------------------------------------------------------------------- 5. guests

export function GuestsStep(ctx: StepContext) {
  const [band, setBand] = useState<GuestBand | null>(ctx.state.guestBand);
  const [missing, setMissing] = useState(false);
  return (
    <StepForm
      onSubmit={async () => {
        if (!band) {
          setMissing(true);
          return;
        }
        await ctx.submit({ step: "guests", band });
      }}
    >
      <ChoiceCards
        legend="Quanti invitati"
        value={band}
        onChange={(next) => {
          setBand(next);
          setMissing(false);
        }}
        options={GUEST_BANDS.map((value) => ({ value, label: GUEST_BAND_LABELS[value] }))}
        error={missing ? "Scegli un'opzione, anche «Non lo so ancora»." : undefined}
        testId="guest-choices"
      />
      <FailureNote failure={ctx.failure} />
      <Actions busy={ctx.busy} onBack={ctx.onBack} />
    </StepForm>
  );
}

// -------------------------------------------------------------------------------- 6. budget

interface BudgetDraft {
  text: string;
}

export function BudgetStep(ctx: StepContext) {
  const cents = ctx.state.answers.budgetCents;
  const saved: BudgetDraft = { text: cents === null ? "" : formatCents(cents) };
  return (
    <Drafted draftKey="step-budget" scope={ctx.scope} saved={saved}>
      {({ initial, save, clear }) => (
        <BudgetForm ctx={ctx} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function BudgetForm({
  ctx,
  initial,
  save,
  clear,
}: {
  ctx: StepContext;
  initial: BudgetDraft;
  save: (value: BudgetDraft) => void;
  clear: () => void;
}) {
  const [text, setText] = useState(typeof initial.text === "string" ? initial.text : "");
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <StepForm
      onSubmit={async () => {
        const parsed = text.trim() === "" ? null : parseEuroToCents(text);
        if (parsed && !parsed.ok) {
          setError(parsed.message);
          return;
        }
        setError(undefined);
        const ok = await ctx.submit({
          step: "budget",
          skip: false,
          totalCents: parsed ? parsed.cents : null,
        });
        if (ok) clear();
      }}
    >
      <MoneyInput
        label="Budget totale"
        value={text}
        onValueChange={(next) => {
          setText(next);
          setError(undefined);
          save({ text: next });
        }}
        error={error}
        hint="Facoltativo: lo potrai cambiare quando vuoi, anche dal Budget."
        name="budgetTotal"
      />
      <FailureNote failure={ctx.failure} />
      <Actions
        busy={ctx.busy}
        onBack={ctx.onBack}
        onSkip={async () => {
          const ok = await ctx.submit({ step: "budget", skip: true, totalCents: null });
          if (ok) clear();
        }}
      />
    </StepForm>
  );
}

// --------------------------------------------------------------------------------- 7. style

interface StyleDraft {
  styleLabel: string | null;
  styleNote: string;
  region: string | null;
  comune: string;
}

export function StyleStep(ctx: StepContext) {
  const { state } = ctx;
  const saved: StyleDraft = {
    styleLabel: state.styleLabel,
    styleNote: state.styleNote ?? "",
    region: state.region,
    comune: state.comune ?? "",
  };
  return (
    <Drafted draftKey="step-style" scope={ctx.scope} saved={saved}>
      {({ initial, save, clear }) => (
        <StyleForm ctx={ctx} initial={initial} save={save} clear={clear} />
      )}
    </Drafted>
  );
}

function StyleForm({
  ctx,
  initial,
  save,
  clear,
}: {
  ctx: StepContext;
  initial: StyleDraft;
  save: (value: StyleDraft) => void;
  clear: () => void;
}) {
  const [value, setValue] = useState(initial);
  const change = (patch: Partial<StyleDraft>) => {
    const next = { ...value, ...patch };
    setValue(next);
    save(next);
  };
  return (
    <StepForm
      onSubmit={async () => {
        const ok = await ctx.submit({
          step: "style",
          skip: false,
          styleLabel: value.styleLabel,
          styleNote: value.styleNote,
          region: value.region,
          comune: value.comune,
        });
        if (ok) clear();
      }}
    >
      <ChoiceCards
        legend="Stile"
        value={value.styleLabel}
        onChange={(next) => change({ styleLabel: next })}
        options={STYLE_LABELS.map((label) => ({ value: label, label }))}
        columns={2}
        testId="style-choices"
      />
      <TextArea
        id="style-note"
        label="Una nota sullo stile (facoltativa)"
        value={value.styleNote}
        onChange={(styleNote) => change({ styleNote })}
        maxLength={500}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="region">Regione</Label>
        <Select
          value={value.region ?? undefined}
          onValueChange={(region) => change({ region })}
          name="region"
        >
          <SelectTrigger id="region" data-testid="region-select">
            <SelectValue placeholder="Scegli la regione" />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((region) => (
              <SelectItem key={region} value={region}>
                {region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TextField
        id="comune"
        label="Comune"
        value={value.comune}
        onChange={(comune) => change({ comune })}
        hint="Dove pensate di sposarvi, se lo sapete già."
      />
      <FailureNote failure={ctx.failure} />
      <Actions
        busy={ctx.busy}
        onBack={ctx.onBack}
        onSkip={async () => {
          const ok = await ctx.submit({
            step: "style",
            skip: true,
            styleLabel: null,
            styleNote: null,
            region: null,
            comune: null,
          });
          if (ok) clear();
        }}
      />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------------- 8. theme

export function ThemeStep({
  ctx,
  onFinish,
}: {
  ctx: StepContext;
  onFinish: (skipTheme: boolean) => Promise<void>;
}) {
  const { cancelPreview } = useTheme();
  return (
    <div className="flex flex-col gap-6">
      <ThemeGallery onSave={saveThemeAction} />
      <FailureNote failure={ctx.failure} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {ctx.onBack ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={ctx.onBack}
            disabled={ctx.busy}
          >
            Indietro
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={ctx.busy}
          data-testid="step-skip"
          onClick={() => {
            cancelPreview();
            void onFinish(true);
          }}
        >
          Non lo so ancora
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={ctx.busy}
          aria-busy={ctx.busy}
          className="sm:ml-auto"
          data-testid="step-finish"
          onClick={() => {
            cancelPreview();
            void onFinish(false);
          }}
        >
          {ctx.busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
          Concludi
        </Button>
      </div>
    </div>
  );
}
