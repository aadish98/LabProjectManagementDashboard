interface OnboardingStepsProps {
  hasSelectedSpreadsheet: boolean;
  hasSelectedSheet: boolean;
  columnsReady: boolean;
  columnsValid: boolean;
  profileDone: boolean;
}

function stepClass(done: boolean, current: boolean): string {
  if (done) return "setup-step setup-step--done";
  if (current) return "setup-step setup-step--current";
  return "setup-step";
}

export function OnboardingSteps({
  hasSelectedSpreadsheet,
  hasSelectedSheet,
  columnsReady,
  columnsValid,
  profileDone
}: OnboardingStepsProps) {
  const steps = [
    {
      label: "File",
      done: hasSelectedSpreadsheet,
      current: !hasSelectedSpreadsheet
    },
    {
      label: "Tab",
      done: hasSelectedSheet,
      current: hasSelectedSpreadsheet && !hasSelectedSheet
    },
    {
      label: "Columns",
      done: columnsReady && columnsValid,
      current: hasSelectedSheet && (!columnsReady || !columnsValid)
    },
    {
      label: "Profile (optional)",
      done: profileDone,
      current: hasSelectedSheet && columnsReady && !profileDone
    }
  ];

  return (
    <ol className="setup-steps" aria-label="Task-log workbook connection steps">
      {steps.map((step, index) => (
        <li key={step.label} className={stepClass(step.done, step.current)}>
          <span className="setup-step__index">{index + 1}</span>
          <span className="setup-step__label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
