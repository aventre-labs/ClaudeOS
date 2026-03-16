import styles from "./LaunchStep.module.css";

interface LaunchStepProps {
  railwayComplete: boolean;
  anthropicComplete: boolean;
  buildComplete: boolean;
  onLaunch: () => void;
}

export function LaunchStep({
  railwayComplete,
  anthropicComplete,
  buildComplete,
  onLaunch,
}: LaunchStepProps) {
  const allReady = railwayComplete && anthropicComplete && buildComplete;

  const checks = [
    { label: "Railway authenticated", done: railwayComplete },
    { label: "Anthropic authenticated", done: anthropicComplete },
    { label: "Extensions installed", done: buildComplete },
  ];

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Launch</h3>
      <ul className={styles.checklist}>
        {checks.map((check) => (
          <li
            key={check.label}
            className={[styles.checkItem, check.done ? styles.checkComplete : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={styles.checkIcon}>
              {check.done ? (
                "\u2713"
              ) : (
                <span className={styles.pendingIcon} />
              )}
            </span>
            {check.label}
          </li>
        ))}
      </ul>
      {allReady && (
        <p className={styles.readyText}>
          All set! Click Launch to start your ClaudeOS instance.
        </p>
      )}
      <button
        type="button"
        className={styles.launchButton}
        disabled={!allReady}
        onClick={onLaunch}
      >
        Launch ClaudeOS
      </button>
    </div>
  );
}
