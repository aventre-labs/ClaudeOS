// ============================================================
// ClaudeOS Wizard - Frontend Type Definitions
// ============================================================
// Mirrors backend WizardState/WizardSSEEvents shapes from
// supervisor/src/types.ts. Kept in sync manually.
// ============================================================

// --- Backend Mirror Types ---

export type WizardStep = "railway" | "anthropic" | "launch";

export interface WizardStepRailway {
  completed: boolean;
  completedAt?: string;
  tokenStored?: boolean;
}

export interface WizardStepAnthropic {
  completed: boolean;
  completedAt?: string;
  method?: "api-key" | "claude-login";
}

export interface WizardStatus {
  status: "incomplete" | "completed";
  steps: {
    railway: WizardStepRailway;
    anthropic: WizardStepAnthropic;
  };
  startedAt: string;
  completedAt?: string;
}

// --- Frontend UI State ---

export interface RailwayUIState {
  status: "idle" | "pairing" | "complete" | "error";
  pairingCode?: string;
  url?: string;
  error?: string;
}

export interface AnthropicUIState {
  status: "idle" | "validating" | "loginStarted" | "complete" | "error";
  loginUrl?: string;
  error?: string;
}

export interface BuildUIState {
  status: "idle" | "installing" | "complete" | "error";
  current?: string;
  progress?: number;
  total?: number;
  error?: string;
}

export interface LaunchUIState {
  status: "idle" | "launching" | "ready" | "error";
  error?: string;
}

export interface WizardUIState {
  activeStep: WizardStep;
  railway: RailwayUIState;
  anthropic: AnthropicUIState;
  build: BuildUIState;
  launch: LaunchUIState;
}

// --- Actions (discriminated union for useReducer) ---

export type WizardAction =
  | { type: "INIT"; status: WizardStatus }
  | { type: "SET_ACTIVE_STEP"; step: WizardStep }
  | { type: "RAILWAY_STARTED"; pairingCode: string; url: string }
  | { type: "RAILWAY_COMPLETE"; success: boolean; error?: string }
  | { type: "ANTHROPIC_KEY_VALIDATED"; success: boolean; error?: string }
  | { type: "ANTHROPIC_LOGIN_STARTED"; url: string }
  | { type: "ANTHROPIC_LOGIN_COMPLETE"; success: boolean; error?: string }
  | { type: "BUILD_PROGRESS"; current: string; progress: number; total: number }
  | { type: "BUILD_COMPLETE" }
  | { type: "BUILD_ERROR"; error: string }
  | { type: "STEP_COMPLETED"; step: string; completedAt: string }
  | { type: "LAUNCH_STARTED" }
  | { type: "LAUNCH_READY"; url: string }
  | { type: "LAUNCH_ERROR"; error: string };

// --- Initial State ---

export const initialWizardUIState: WizardUIState = {
  activeStep: "railway",
  railway: { status: "idle" },
  anthropic: { status: "idle" },
  build: { status: "idle" },
  launch: { status: "idle" },
};

// --- Reducer ---

export function wizardReducer(
  state: WizardUIState,
  action: WizardAction,
): WizardUIState {
  switch (action.type) {
    case "INIT": {
      const { status } = action;
      const railwayStatus = status.steps.railway.completed
        ? "complete"
        : "idle";
      const anthropicStatus = status.steps.anthropic.completed
        ? "complete"
        : "idle";
      // Determine active step based on completion
      let activeStep: WizardStep = "railway";
      if (status.steps.railway.completed) activeStep = "anthropic";
      if (status.steps.anthropic.completed) activeStep = "launch";
      if (status.status === "completed") activeStep = "launch";
      return {
        ...state,
        activeStep,
        railway: { status: railwayStatus },
        anthropic: { status: anthropicStatus },
        // If wizard is completed, user is refreshing during launch -- show transition
        launch: status.status === "completed"
          ? { status: "launching" }
          : state.launch,
      };
    }
    case "SET_ACTIVE_STEP":
      return { ...state, activeStep: action.step };
    case "RAILWAY_STARTED":
      return {
        ...state,
        railway: {
          status: "pairing",
          pairingCode: action.pairingCode,
          url: action.url,
        },
      };
    case "RAILWAY_COMPLETE":
      return {
        ...state,
        railway: action.success
          ? { status: "complete" }
          : { status: "error", error: action.error },
      };
    case "ANTHROPIC_KEY_VALIDATED":
      return {
        ...state,
        anthropic: action.success
          ? { status: "complete" }
          : { status: "error", error: action.error },
      };
    case "ANTHROPIC_LOGIN_STARTED":
      return {
        ...state,
        anthropic: { status: "loginStarted", loginUrl: action.url },
      };
    case "ANTHROPIC_LOGIN_COMPLETE":
      return {
        ...state,
        anthropic: action.success
          ? { status: "complete" }
          : { status: "error", error: action.error },
      };
    case "BUILD_PROGRESS":
      return {
        ...state,
        build: {
          status: "installing",
          current: action.current,
          progress: action.progress,
          total: action.total,
        },
      };
    case "BUILD_COMPLETE":
      return { ...state, build: { status: "complete" } };
    case "BUILD_ERROR":
      return { ...state, build: { status: "error", error: action.error } };
    case "STEP_COMPLETED": {
      const next = { ...state };
      if (action.step === "railway") {
        next.railway = { status: "complete" };
        if (next.activeStep === "railway") next.activeStep = "anthropic";
      } else if (action.step === "anthropic") {
        next.anthropic = { status: "complete" };
        if (next.activeStep === "anthropic") next.activeStep = "launch";
      }
      return next;
    }
    case "LAUNCH_STARTED":
      return { ...state, launch: { status: "launching" } };
    case "LAUNCH_READY":
      return { ...state, launch: { status: "ready" } };
    case "LAUNCH_ERROR":
      return { ...state, launch: { status: "error", error: action.error } };
    default:
      return state;
  }
}
