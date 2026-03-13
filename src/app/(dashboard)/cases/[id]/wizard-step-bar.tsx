import { CheckCircle2 } from 'lucide-react';

// --- Types ---

interface StepInfo {
  number: number;
  label: string;
  subtitle: string;
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
  return (
    <nav aria-label="Passaggi caso" className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm py-2 flex items-center gap-2">
      {steps.map((step, index) => {
        const isActive = activeStep === step.number;
        const isCompleted = autoStep > step.number;
        return (
          <div key={step.number} className="flex flex-1 items-center">
            <button
              type="button"
              onClick={() => onSetStep(step.number)}
              className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all ${
                isActive
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : isCompleted
                    ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/10'
                    : 'border-muted hover:border-muted-foreground/30'
              }`}
              aria-current={isActive ? 'step' : undefined}
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isActive
                  ? 'bg-primary text-primary-foreground'
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
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {step.subtitle}
                </p>
              </div>
            </button>
            {index < steps.length - 1 && (
              <div className={`mx-2 h-0.5 w-4 shrink-0 rounded ${
                autoStep > step.number ? 'bg-green-500' : 'bg-muted'
              }`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
