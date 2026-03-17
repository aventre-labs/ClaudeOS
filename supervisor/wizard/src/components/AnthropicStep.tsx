import { useState } from "react";
import styles from "./AnthropicStep.module.css";

interface AnthropicStepProps {
  status: "idle" | "validating" | "loginStarted" | "complete" | "error";
  loginUrl?: string;
  error?: string;
  onSubmitKey: (key: string) => void;
  onStartLogin: () => void;
  onSubmitAuthCode?: (code: string) => void;
  onSkip?: () => void;
  onSignOut?: () => void;
}

export function AnthropicStep({
  status,
  loginUrl,
  error,
  onSubmitKey,
  onStartLogin,
  onSubmitAuthCode,
  onSkip,
  onSignOut,
}: AnthropicStepProps) {
  const [apiKey, setApiKey] = useState("");
  const [authCode, setAuthCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      onSubmitKey(apiKey.trim());
    }
  };

  if (status === "complete") {
    return (
      <div className={styles.container}>
        <div className={styles.completeState}>
          <span className={styles.checkmark}>{"\u2713"}</span>
          <span>Anthropic: authenticated</span>
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
        <button
          type="button"
          className={styles.retryButton}
          onClick={onStartLogin}
        >
          Try again
        </button>
      </div>
    );
  }

  if (status === "loginStarted") {
    return (
      <div className={styles.container}>
        <h3 className={styles.heading}>Anthropic Authentication</h3>
        <div className={styles.loginStarted}>
          {loginUrl ? (
            <>
              <p className={styles.description}>
                1. Click below to sign in with your Anthropic account
              </p>
              <a
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.loginButton}
                style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}
              >
                Open Anthropic Login
              </a>
              <p className={styles.description} style={{ marginTop: "1.25rem" }}>
                2. After authorizing, paste the code shown on the callback page:
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (authCode.trim() && onSubmitAuthCode) {
                    onSubmitAuthCode(authCode.trim());
                  }
                }}
                className={styles.inputGroup}
              >
                <input
                  type="text"
                  className={styles.apiKeyInput}
                  placeholder="Paste auth code here..."
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  aria-label="Authentication code"
                />
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={!authCode.trim()}
                >
                  Submit Code
                </button>
              </form>
            </>
          ) : (
            <div className={styles.waiting}>
              <span className={styles.spinner} />
              Starting login...
            </div>
          )}
        </div>
      </div>
    );
  }

  // idle or validating
  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Anthropic Authentication</h3>
      <p className={styles.description}>
        Authenticate Claude Code with Anthropic
      </p>
      <div className={styles.methods}>
        <div className={styles.method}>
          <div className={styles.methodLabel}>API Key</div>
          <form onSubmit={handleSubmit} className={styles.inputGroup}>
            <input
              type="password"
              className={styles.apiKeyInput}
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={status === "validating"}
              aria-label="Anthropic API Key"
            />
            <button
              type="submit"
              className={styles.submitButton}
              disabled={status === "validating" || !apiKey.trim()}
            >
              {status === "validating" && <span className={styles.spinner} />}
              {status === "validating" ? "Validating..." : "Validate Key"}
            </button>
          </form>
        </div>
        <div className={styles.method}>
          <div className={styles.methodLabel}>Claude Account</div>
          <button
            type="button"
            className={styles.loginButton}
            onClick={onStartLogin}
            disabled={status === "validating"}
          >
            Sign in with Anthropic
          </button>
        </div>
      </div>
      {onSkip && (
        <div className={styles.skipSection}>
          <button
            type="button"
            className={styles.skipButton}
            onClick={onSkip}
          >
            Skip — configure later in terminal
          </button>
          <p className={styles.skipHint}>
            You can run <code>claude auth login</code> in the terminal after setup
          </p>
        </div>
      )}
    </div>
  );
}
