'use client'

// Shared wizard chrome: step indicator + navigation buttons.

export function WizardSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
              i < current
                ? 'bg-cold text-white'
                : i === current
                  ? 'bg-warm text-white'
                  : 'border border-line-2 bg-surface-3 text-ink-3'
            }`}
          >
            {i < current ? '✓' : i + 1}
          </div>
          <span
            className={`hidden text-xs font-bold sm:block ${i === current ? 'text-ink' : 'text-ink-3'}`}
          >
            {s}
          </span>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-line-2" />}
        </div>
      ))}
    </div>
  )
}

export function WizardNav({
  onBack,
  onNext,
  nextLabel = 'Next →',
  nextDisabled = false,
  busy = false,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
  busy?: boolean
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line-2 bg-surface px-4 py-2.5 text-sm font-bold text-ink-2"
        >
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || busy}
        className="rounded-lg bg-ink px-6 py-2.5 font-bold text-cream active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? 'Working…' : nextLabel}
      </button>
    </div>
  )
}
