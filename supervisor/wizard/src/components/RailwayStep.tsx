import { useState } from "react";
import styles from "./RailwayStep.module.css";

interface RailwayStepProps {
  status: "idle" | "pairing" | "complete" | "error";
  pairingCode?: string;
  url?: string;
  error?: string;
  onStart: () => void;
  onSignOut?: () => void;
}

export function RailwayStep({
  status,
  pairingCode,
  url,
  error,
  onStart,
  onSignOut,
}: RailwayStepProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (pairingCode) {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (status === "complete") {
    return (
      <div className={styles.container}>
        <div className={styles.completeState}>
          <span className={styles.checkmark}>{"\u2713"}</span>
          <span>Railway: signed in</span>
          {onSignOut && (
            <button
              type="button"
              className={styles.signOutLink}
              onClick={onSignOut}
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.container}>
        <p className={styles.errorState}>{error ?? "Authentication failed"}</p>
        <button type="button" className={styles.retryButton} onClick={onStart}>
          Try again
        </button>
      </div>
    );
  }

  if (status === "pairing") {
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Railway Authentication</h3>
        <div className={styles.pairingSection}>
          <p className={styles.description}>
            Enter this code to sign in:
          </p>
          <div className={styles.pairingCode} data-testid="pairing-code">
            {pairingCode}
          </div>
          <button
            type="button"
            className={styles.copyButton}
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <p className={styles.pairingInstructions}>
            Go to{" "}
            <a
              href={url ?? "https://railway.com/cli-login"}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pairingLink}
            >
              railway.com/cli-login
            </a>{" "}
            and enter the code above.
          </p>
          <div className={styles.waiting}>
            <span className={styles.spinner} />
            Waiting for confirmation...
          </div>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Railway Authentication</h3>
      <p className={styles.description}>
        Verifies you own this Railway project.
      </p>
      <button type="button" className={styles.primaryButton} onClick={onStart}>
        Sign in with Railway
      </button>
      <button type="button" className={styles.altLink} onClick={onStart}>
        Use auth token instead
      </button>
    </div>
  );
}
