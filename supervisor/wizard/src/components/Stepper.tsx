import styles from "./Stepper.module.css";

export interface StepDef {
  key: string;
  label: string;
  completed: boolean;
  active: boolean;
}

interface StepperProps {
  steps: StepDef[];
  onStepClick: (key: string) => void;
}

export function Stepper({ steps, onStepClick }: StepperProps) {
  return (
    <div className={styles.stepper} role="navigation" aria-label="Setup steps">
      {steps.map((step, i) => (
        <div key={step.key} style={{ display: "contents" }}>
          <button
            type="button"
            className={[
              styles.step,
              step.active ? styles.active : "",
              step.completed ? styles.completed : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onStepClick(step.key)}
            aria-current={step.active ? "step" : undefined}
          >
            <span className={styles.circle}>
              {step.completed ? "\u2713" : i + 1}
            </span>
            <span className={styles.label}>{step.label}</span>
          </button>
          {i < steps.length - 1 && (
            <div
              className={[
                styles.connector,
                step.completed ? styles.connectorActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          )}
        </div>
      ))}
    </div>
  );
}
