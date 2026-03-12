// ============================================================
// VS Code API Mock for vitest
// ============================================================
// Manual mock of the vscode namespace. Used by ALL test files
// via the vitest alias in vitest.config.ts.
// ============================================================

import { vi } from "vitest";

// --- EventEmitter ---

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

// --- Enums ---

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

// --- Classes ---

export class ThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: ThemeColor,
  ) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class TreeItem {
  label?: string | TreeItemLabel;
  id?: string;
  iconPath?: ThemeIcon;
  description?: string | boolean;
  contextValue?: string;
  collapsibleState?: TreeItemCollapsibleState;
  command?: Command;

  constructor(
    label: string | TreeItemLabel,
    collapsibleState?: TreeItemCollapsibleState,
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export interface TreeItemLabel {
  label: string;
  highlights?: [number, number][];
}

export interface Command {
  command: string;
  title: string;
  arguments?: unknown[];
}

// --- Uri ---

export class Uri {
  static file(path: string): Uri {
    return new Uri("file", "", path, "", "");
  }

  static parse(value: string): Uri {
    return new Uri("https", "", value, "", "");
  }

  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
  ) {}
}

// --- window ---

export const window = {
  showInputBox: vi.fn().mockResolvedValue(""),
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  createTerminal: vi.fn(),
  createTreeView: vi.fn().mockReturnValue({
    badge: undefined,
    onDidChangeVisibility: new EventEmitter<void>().event,
    dispose: vi.fn(),
  }),
};

// --- commands ---

export const commands = {
  registerCommand: vi.fn(),
  executeCommand: vi.fn(),
};

// --- workspace ---

export const workspace = {
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
    update: vi.fn(),
  }),
};
