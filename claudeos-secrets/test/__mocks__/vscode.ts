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

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
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

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path, ...pathSegments].join("/");
    return new Uri(base.scheme, base.authority, joined, base.query, base.fragment);
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
  onDidCloseTerminal: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  }),
  createStatusBarItem: vi.fn().mockReturnValue({
    text: "",
    tooltip: "",
    command: "",
    backgroundColor: undefined,
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  }),
  createWebviewPanel: vi.fn().mockReturnValue({
    webview: {
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      html: "",
      cspSource: "https://example.com",
      asWebviewUri: vi.fn((uri: Uri) => uri),
    },
    onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    reveal: vi.fn(),
    dispose: vi.fn(),
  }),
  withProgress: vi.fn().mockImplementation((_options: unknown, task: (progress: unknown) => Promise<unknown>) => {
    return task({ report: vi.fn() });
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

// --- extensions ---

export const extensions = {
  getExtension: vi.fn(),
};

// --- env ---

export const env = {
  clipboard: {
    writeText: vi.fn(),
  },
};

// --- ProgressLocation ---

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

// --- ViewColumn ---

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}
