import { useEffect, useState } from "react";
import styles from "./BuildProgress.module.css";

interface BuildProgressProps {
  status: "idle" | "installing" | "complete" | "error";
  currentExtension?: string;
  progress?: number;
  total?: number;
  error?: string;
  onRetry?: () => void;
}

export function BuildProgress({
  status,
  currentExtension,
  progress,
  total,
  error,
  onRetry,
}: BuildProgressProps) {
  const [faded, setFaded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (status === "complete") {
      const fadeTimer = setTimeout(() => setFaded(true), 2000);
      const hideTimer = setTimeout(() => setHidden(true), 2500);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else {
      setFaded(false);
      setHidden(false);
    }
  }, [status]);

  if (status === "idle" || hidden) return null;

  if (status === "installing") {
    const pct = progress && total ? Math.round((progress / total) * 100) : 0;
    return (
      <div className={styles.footer} data-testid="build-progress">
        <div className={styles.installing}>
          <div className={styles.progressText}>
            <span>
              Installing{" "}
              <span className={styles.extensionName}>{currentExtension}</span>
              ...
            </span>
            <span className={styles.progressCount}>
              ({progress}/{total})
            </span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div
        className={[styles.footer, faded ? styles.fadeOut : ""]
          .filter(Boolean)
          .join(" ")}
        data-testid="build-progress"
      >
        <div className={styles.complete}>
          <span className={styles.checkmark}>{"\u2713"}</span>
          Extensions installed
        </div>
      </div>
    );
  }

  // error
  return (
    <div className={styles.footer} data-testid="build-progress">
      <div className={styles.error}>
        <span className={styles.errorText}>{error ?? "Build failed"}</span>
        {onRetry && (
          <button
            type="button"
            className={styles.retryButton}
            onClick={onRetry}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
