// ============================================================
// VS Code API Mock for vitest
// ============================================================
// Manual mock of the vscode namespace. Used by ALL test files
// via the vitest alias in vitest.config.ts.
// Extended with WebviewPanel, StatusBar, Uri.joinPath for home extension.
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

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export enum ProgressLocation {
  Notification = 15,
  Window = 10,
  SourceControl = 1,
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

// --- Webview Panel Mock ---

function createMockWebviewPanel() {
  const onDidReceiveMessageEmitter = new EventEmitter<any>();
  const onDidDisposeEmitter = new EventEmitter<void>();

  return {
    webview: {
      postMessage: vi.fn().mockResolvedValue(true),
      onDidReceiveMessage: onDidReceiveMessageEmitter.event,
      html: "",
      cspSource: "https://mock.csp.source",
      asWebviewUri: (uri: Uri) => uri,
      _onDidReceiveMessageEmitter: onDidReceiveMessageEmitter,
    },
    onDidDispose: onDidDisposeEmitter.event,
    _onDidDisposeEmitter: onDidDisposeEmitter,
    reveal: vi.fn(),
    dispose: vi.fn(),
    visible: true,
    viewColumn: ViewColumn.One,
  };
}

// --- window ---

let _mockPanel: ReturnType<typeof createMockWebviewPanel> | null = null;

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
  createWebviewPanel: vi.fn().mockImplementation(() => {
    _mockPanel = createMockWebviewPanel();
    return _mockPanel;
  }),
  _getLastPanel: () => _mockPanel,
  _resetPanel: () => { _mockPanel = null; },
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
  getExtension: vi.fn().mockReturnValue(undefined),
};

// --- env ---

export const env = {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
};
