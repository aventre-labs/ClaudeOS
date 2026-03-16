import { useState, useEffect } from "react";
import styles from "./LaunchTransition.module.css";

interface LaunchTransitionProps {
  status: "launching" | "ready" | "error";
  error?: string;
  onRetry: () => void;
}

const STATUS_MESSAGES = [
  "Starting code-server...",
  "Configuring workspace...",
  "Almost ready...",
];

export function LaunchTransition({
  status,
  error,
  onRetry,
}: LaunchTransitionProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (status !== "launching") return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === "ready") {
    // App handles the redirect; render nothing
    return null;
  }

  if (status === "error") {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <h2 className={styles.errorHeading}>Failed to start ClaudeOS</h2>
          <p className={styles.errorDetail}>
            {error ?? "An unexpected error occurred."}
          </p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.retryButton}
              onClick={onRetry}
            >
              Retry
            </button>
            <button
              type="button"
              className={styles.logsButton}
              onClick={() => window.open("/api/v1/logs", "_blank")}
            >
              View Logs
            </button>
          </div>
        </div>
      </div>
    );
  }

  // status === "launching"
  return (
    <div className={styles.page}>
      <div className={styles.logoLarge}>
        <span>Claude</span>
        <span className={styles.os}>OS</span>
      </div>
      <div className={styles.progressDots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <p className={styles.statusText}>{STATUS_MESSAGES[messageIndex]}</p>
    </div>
  );
}
