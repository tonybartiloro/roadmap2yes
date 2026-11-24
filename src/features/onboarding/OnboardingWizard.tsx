"use client";

import { useEffect, useRef, useState } from "react";
import type { PlainDate } from "@/lib/dates/plain-date";
import { finishOnboardingAction, saveStepAction } from "./actions";
import type { Failure, OnboardingState } from "./data";
import {
  SAVE_FAILED,
  STEP_COUNT,
  STEP_IDS,
  STEP_TITLES,
  resumeStep,
  stepNumber,
  type StepId,
} from "./model";
import {
  BudgetStep,
  DatesStep,
  GuestsStep,
  PartnerStep,
  RiteStep,
  StyleStep,
  ThemeStep,
  YouStep,
  type StepContext,
} from "./steps";
import { Summary } from "./Summary";
import type { OnboardingSummary } from "./types";

const NETWORK_FAILURE: Failure = { ok: false, code: "unreachable", message: SAVE_FAILED };

/**
 * The 8-step onboarding (AC12, AC13; design §3.2): one question per screen, "Passo 3 di 8" in text
 * plus a progress bar, every step saved when confirmed, resumable from the last confirmed one,
 * "Indietro" always available, focus on the title at every change. Server actions do the writing;
 * this component only holds what is on screen.
 */
export function OnboardingWizard({
  initial,
  scope,
  emailOn,
  today,
}: {
  initial: OnboardingState;
  /** `userId:weddingId`: namespace of the local drafts. */
  scope: string;
  emailOn: boolean;
  today: PlainDate;
}) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<StepId>(resumeStep(initial.answers));
  const [resumedFrom] = useState<StepId | null>(
    initial.answers.lastStep > 0 ? resumeStep(initial.answers) : null,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const number = stepNumber(step);
  useEffect(() => {
    heading.current?.focus();
  }, [step, summary]);

  function go(next: StepId) {
    setFailure(null);
    setStep(next);
  }

  async function submit(input: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setFailure(null);
    try {
      const result = await saveStepAction(input);
      if (!result.ok) {
        setFailure(result);
        return false;
      }
      setState(result.state);
      const index = STEP_IDS.indexOf(step);
      go(STEP_IDS[Math.min(index + 1, STEP_COUNT - 1)] as StepId);
      return true;
    } catch {
      setFailure(NETWORK_FAILURE);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finish(skipTheme: boolean): Promise<void> {
    setBusy(true);
    setFailure(null);
    try {
      const result = await finishOnboardingAction({ skipTheme });
      if (result.ok) setSummary(result.summary);
      else setFailure(result);
    } catch {
      setFailure(NETWORK_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <Summary ref={heading} summary={summary} />
      </div>
    );
  }

  const index = STEP_IDS.indexOf(step);
  const ctx: StepContext = {
    state,
    scope,
    busy,
    failure,
    submit,
    onBack: index > 0 ? () => go(STEP_IDS[index - 1] as StepId) : null,
    emailOn,
    today,
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-muted-foreground font-semibold" data-testid="onboarding-progress-text">
          Passo {number} di {STEP_COUNT}
        </p>
        <div
          role="progressbar"
          aria-label="Avanzamento dell'onboarding"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={number}
          aria-valuetext={`Passo ${number} di ${STEP_COUNT}`}
          className="bg-muted h-3 w-full overflow-hidden rounded-full"
          data-testid="onboarding-progress"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] motion-reduce:transition-none"
            style={{ width: `${(number / STEP_COUNT) * 100}%` }}
          />
        </div>
        {resumedFrom === step ? (
          <p className="text-muted-foreground" data-testid="onboarding-resume">
            Bentornato, riprendiamo dal passo {number} di {STEP_COUNT}.
          </p>
        ) : null}
      </header>

      <h1
        ref={heading}
        tabIndex={-1}
        className="font-heading text-[28px] leading-9 outline-none"
        data-testid="onboarding-title"
      >
        {STEP_TITLES[step]}
      </h1>
      <p className="sr-only" role="status" aria-live="polite">
        Passo {number} di {STEP_COUNT}: {STEP_TITLES[step]}
      </p>

      {step === "you" ? <YouStep key={step} {...ctx} /> : null}
      {step === "partner" ? <PartnerStep key={step} {...ctx} /> : null}
      {step === "rite" ? <RiteStep key={step} {...ctx} /> : null}
      {step === "dates" ? <DatesStep key={step} {...ctx} /> : null}
      {step === "guests" ? <GuestsStep key={step} {...ctx} /> : null}
      {step === "budget" ? <BudgetStep key={step} {...ctx} /> : null}
      {step === "style" ? <StyleStep key={step} {...ctx} /> : null}
      {step === "theme" ? <ThemeStep key={step} ctx={ctx} onFinish={finish} /> : null}
    </div>
  );
}
