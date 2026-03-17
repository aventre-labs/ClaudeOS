import { useReducer, useRef, useCallback } from "react";
import {
  wizardReducer,
  initialWizardUIState,
  type WizardStep,
} from "./types";
import { useWizardStatus } from "./hooks/useWizardStatus";
import { useSSE } from "./hooks/useSSE";
import {
  startRailwayLogin,
  submitAnthropicKey,
  startOAuthLogin,
  submitOAuthCode,
  skipAnthropicStep,
  launchWizard,
} from "./api/wizard";
import { Stepper, type StepDef } from "./components/Stepper";
import { RailwayStep } from "./components/RailwayStep";
import { AnthropicStep } from "./components/AnthropicStep";
import { LaunchStep } from "./components/LaunchStep";
import { LaunchTransition } from "./components/LaunchTransition";
import { BuildProgress } from "./components/BuildProgress";
import styles from "./App.module.css";

export function App() {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardUIState);
  const { status: wizardStatus, loading, error: statusError, refetch } = useWizardStatus();
  const initRef = useRef(false);

  // Initialize state from server status on first successful fetch
  if (wizardStatus && !initRef.current) {
    initRef.current = true;
    dispatch({ type: "INIT", status: wizardStatus });
  }

  // Memoize SSE handlers with useRef to prevent reconnection (Pitfall 5)
  const handlersRef = useRef<Record<string, (data: unknown) => void>>({});
  handlersRef.current = {
    "railway:started": (data) => {
      const d = data as { pairingCode: string; url: string };
      dispatch({ type: "RAILWAY_STARTED", pairingCode: d.pairingCode, url: d.url });
    },
    "railway:complete": (data) => {
      const d = data as { success: boolean; error?: string };
      dispatch({ type: "RAILWAY_COMPLETE", success: d.success, error: d.error });
    },
    "anthropic:key-validated": (data) => {
      const d = data as { success: boolean; error?: string };
      dispatch({ type: "ANTHROPIC_KEY_VALIDATED", success: d.success, error: d.error });
    },
    "anthropic:login-started": (data) => {
      const d = data as { url: string };
      dispatch({ type: "ANTHROPIC_LOGIN_STARTED", url: d.url });
    },
    "anthropic:login-complete": (data) => {
      const d = data as { success: boolean; error?: string };
      dispatch({ type: "ANTHROPIC_LOGIN_COMPLETE", success: d.success, error: d.error });
    },
    "build:progress": (data) => {
      const d = data as { current: string; progress: number; total: number };
      dispatch({ type: "BUILD_PROGRESS", current: d.current, progress: d.progress, total: d.total });
    },
    "build:complete": () => {
      dispatch({ type: "BUILD_COMPLETE" });
    },
    "build:error": (data) => {
      const d = data as { error: string };
      dispatch({ type: "BUILD_ERROR", error: d.error });
    },
    "wizard:step-completed": (data) => {
      const d = data as { step: string; completedAt: string };
      dispatch({ type: "STEP_COMPLETED", step: d.step, completedAt: d.completedAt });
    },
    "launch:ready": (data) => {
      const d = data as { url: string };
      dispatch({ type: "LAUNCH_READY", url: d.url });
      // Redirect -- no back button to wizard
      window.location.replace(d.url);
    },
    "launch:error": (data) => {
      const d = data as { error: string };
      dispatch({ type: "LAUNCH_ERROR", error: d.error });
    },
  };

  // Use a stable handlers object that delegates to the ref
  const stableHandlers = useRef(
    Object.fromEntries(
      [
        "railway:started",
        "railway:complete",
        "anthropic:key-validated",
        "anthropic:login-started",
        "anthropic:login-complete",
        "build:progress",
        "build:complete",
        "build:error",
        "wizard:step-completed",
        "launch:ready",
        "launch:error",
      ].map((event) => [
        event,
        (data: unknown) => handlersRef.current[event]?.(data),
      ]),
    ),
  ).current;

  useSSE({ url: "/api/v1/wizard/events", handlers: stableHandlers });

  // Step click handler
  const handleStepClick = useCallback(
    (key: string) => {
      dispatch({ type: "SET_ACTIVE_STEP", step: key as WizardStep });
    },
    [],
  );

  // API call handlers with error catching
  const handleRailwayStart = useCallback(async () => {
    try {
      await startRailwayLogin();
    } catch (err) {
      dispatch({
        type: "RAILWAY_COMPLETE",
        success: false,
        error: err instanceof Error ? err.message : "Failed to start Railway login",
      });
    }
  }, []);

  const handleAnthropicKey = useCallback(async (key: string) => {
    try {
      await submitAnthropicKey(key);
      // SSE event will dispatch ANTHROPIC_KEY_VALIDATED on success
    } catch (err) {
      dispatch({
        type: "ANTHROPIC_KEY_VALIDATED",
        success: false,
        error: err instanceof Error ? err.message : "Failed to validate key",
      });
    }
  }, []);

  const handleAnthropicLogin = useCallback(async () => {
    try {
      const { url } = await startOAuthLogin();
      dispatch({ type: "ANTHROPIC_LOGIN_STARTED", url });
    } catch (err) {
      dispatch({
        type: "ANTHROPIC_LOGIN_COMPLETE",
        success: false,
        error: err instanceof Error ? err.message : "Failed to start login",
      });
    }
  }, []);

  const handleSubmitAuthCode = useCallback(async (code: string) => {
    try {
      await submitOAuthCode(code);
    } catch (err) {
      dispatch({
        type: "ANTHROPIC_LOGIN_COMPLETE",
        success: false,
        error: err instanceof Error ? err.message : "Failed to submit auth code",
      });
    }
  }, []);

  const handleSkipAnthropic = useCallback(async () => {
    try {
      await skipAnthropicStep();
    } catch {
      // SSE will handle the state update
    }
  }, []);

  const handleLaunch = useCallback(async () => {
    dispatch({ type: "LAUNCH_STARTED" });
    try {
      await launchWizard();
    } catch (err) {
      dispatch({
        type: "LAUNCH_ERROR",
        error: err instanceof Error ? err.message : "Failed to launch ClaudeOS",
      });
    }
  }, []);

  const handleRetry = useCallback(async () => {
    dispatch({ type: "LAUNCH_STARTED" });
    try {
      await launchWizard();
    } catch (err) {
      dispatch({
        type: "LAUNCH_ERROR",
        error: err instanceof Error ? err.message : "Failed to launch ClaudeOS",
      });
    }
  }, []);

  // Derive stepper steps
  const steps: StepDef[] = [
    {
      key: "railway",
      label: "Railway",
      completed: state.railway.status === "complete",
      active: state.activeStep === "railway",
    },
    {
      key: "anthropic",
      label: "Claude",
      completed: state.anthropic.status === "complete",
      active: state.activeStep === "anthropic",
    },
    {
      key: "launch",
      label: "Launch",
      completed: false,
      active: state.activeStep === "launch",
    },
  ];

  // Render active step content
  const renderStep = () => {
    switch (state.activeStep) {
      case "railway":
        return (
          <RailwayStep
            status={state.railway.status}
            pairingCode={state.railway.pairingCode}
            url={state.railway.url}
            error={state.railway.error}
            onStart={handleRailwayStart}
          />
        );
      case "anthropic":
        return (
          <AnthropicStep
            status={state.anthropic.status}
            loginUrl={state.anthropic.loginUrl}
            error={state.anthropic.error}
            onSubmitKey={handleAnthropicKey}
            onStartLogin={handleAnthropicLogin}
            onSubmitAuthCode={handleSubmitAuthCode}
            onSkip={handleSkipAnthropic}
          />
        );
      case "launch":
        return (
          <LaunchStep
            railwayComplete={state.railway.status === "complete"}
            anthropicComplete={state.anthropic.status === "complete"}
            buildComplete={state.build.status === "complete"}
            onLaunch={handleLaunch}
          />
        );
    }
  };

  // Full-page launch transition replaces the entire wizard card
  if (state.launch.status !== "idle") {
    return (
      <LaunchTransition
        status={state.launch.status as "launching" | "ready" | "error"}
        error={state.launch.error}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoName}>Claude</span>
            <span className={styles.logoOS}>OS</span>
          </div>
          <p className={styles.subtitle}>Setup</p>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Loading...
          </div>
        ) : statusError ? (
          <div className={styles.errorBanner}>
            Failed to load wizard status. <button onClick={refetch}>Retry</button>
          </div>
        ) : (
          <>
            <Stepper steps={steps} onStepClick={handleStepClick} />
            <div className={styles.stepContent}>{renderStep()}</div>
          </>
        )}

        <BuildProgress
          status={state.build.status}
          currentExtension={state.build.current}
          progress={state.build.progress}
          total={state.build.total}
          error={state.build.error}
        />
      </div>
    </div>
  );
}
