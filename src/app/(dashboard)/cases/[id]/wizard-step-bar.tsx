import { CheckCircle2 } from 'lucide-react';

// --- Types ---

export interface StepInfo {
  number: number;
  label: string;
  subtitle: string;
  hint?: string;
}

interface WizardStepBarProps {
  steps: StepInfo[];
  activeStep: number;
  autoStep: number;
  onSetStep: (step: number) => void;
}

// --- Component ---

export function WizardStepBar({
  steps,
  activeStep,
  autoStep,
  onSetStep,
}: WizardStepBarProps) {
  const currentStep = steps.find((s) => s.number === activeStep);

  return (
    <nav aria-label="Passaggi caso" className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm py-2">
      {/* Mobile: show only active step as prominent card + dots */}
      <div className="sm:hidden">
        {currentStep && (
          <div className="rounded-xl border-2 border-primary bg-primary/5 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold animate-pulse">
                {autoStep > currentStep.number ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  currentStep.number
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{currentStep.label}</p>
                <p className="text-xs text-muted-foreground">{currentStep.subtitle}</p>
                {currentStep.hint && (
                  <p className="text-xs text-primary/80 mt-0.5 font-medium">{currentStep.hint}</p>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Dots for orientation */}
        <div className="flex items-center justify-center gap-2 mt-2">
          {steps.map((step) => (
            <button
              key={step.number}
              type="button"
              onClick={() => onSetStep(step.number)}
              className={`h-2 rounded-full transition-all ${
                step.number === activeStep
                  ? 'w-6 bg-primary'
                  : autoStep > step.number
                    ? 'w-2 bg-green-500'
                    : 'w-2 bg-muted-foreground/30'
              }`}
              aria-label={`Vai a ${step.label}`}
            />
          ))}
          <span className="ml-1 text-xs text-muted-foreground">{activeStep}/5</span>
        </div>
      </div>

      {/* Desktop: horizontal stepper with wider connectors, less button-like */}
      <div className="hidden sm:flex items-center gap-1">
        {steps.map((step, index) => {
          const isActive = activeStep === step.number;
          const isCompleted = autoStep > step.number;
          return (
            <div key={step.number} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => onSetStep(step.number)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-all ${
                  isActive
                    ? 'bg-primary/5 shadow-sm ring-2 ring-primary/30'
                    : isCompleted
                      ? 'bg-green-50/50 dark:bg-green-950/10'
                      : 'hover:bg-muted/50'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground animate-pulse'
                    : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : step.number}
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.subtitle}
                  </p>
                </div>
              </button>
              {index < steps.length - 1 && (
                <div className={`mx-1 h-0.5 flex-1 min-w-3 shrink-0 rounded ${
                  autoStep > step.number ? 'bg-green-500' : 'bg-muted'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
