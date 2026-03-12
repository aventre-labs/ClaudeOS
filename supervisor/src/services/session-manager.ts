// ============================================================
// ClaudeOS Supervisor - SessionManager
// ============================================================
// Manages the full session lifecycle: create, list, stop, kill,
// archive, revive. Maintains in-memory state with disk persistence.
// ============================================================

import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, SessionStatus, SessionArchive } from "../types.js";
import type { TmuxService } from "./tmux.js";

export type StatusCallback = (sessionId: string, status: SessionStatus) => void;

function generateSessionId(): string {
  return `ses_${randomUUID().slice(0, 8)}`;
}

/**
 * Write file atomically: write to temp file, then rename.
 */
function atomicWrite(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data, "utf-8");
  renameSync(tmpPath, filePath);
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;
  private tmux: TmuxService;
  private onStatusChange: StatusCallback | null;
  private port: number;

  constructor(
    dataDir: string,
    tmux: TmuxService,
    onStatusChange?: StatusCallback,
    port: number = 3100,
  ) {
    this.dataDir = dataDir;
    this.tmux = tmux;
    this.onStatusChange = onStatusChange ?? null;
    this.port = port;
  }

  private sessionsDir(): string {
    return join(this.dataDir, "sessions");
  }

  private sessionDir(id: string): string {
    return join(this.sessionsDir(), id);
  }

  private emitStatus(sessionId: string, status: SessionStatus): void {
    if (this.onStatusChange) {
      this.onStatusChange(sessionId, status);
    }
  }

  private saveMetadata(session: Session): void {
    const metaPath = join(this.sessionDir(session.id), "meta.json");
    atomicWrite(metaPath, JSON.stringify(session, null, 2));
  }

  private requireSession(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }

  /**
   * Rebuild state from disk on startup.
   */
  async init(): Promise<void> {
    const sessDir = this.sessionsDir();
    if (!existsSync(sessDir)) {
      mkdirSync(sessDir, { recursive: true });
      return;
    }

    // Scan session directories for meta.json files
    const { readdirSync } = await import("node:fs");
    const entries = readdirSync(sessDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(sessDir, entry.name, "meta.json");
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Session;
          this.sessions.set(meta.id, meta);
        } catch {
          // Skip corrupted metadata
        }
      }
    }
  }

  /**
   * Create a new Claude Code session.
   */
  async create(options: {
    name?: string;
    workdir?: string;
    model?: string;
    flags?: string[];
  }): Promise<Session> {
    const id = generateSessionId();
    const name = options.name || `Session ${this.sessions.size + 1}`;

    // Build claude command
    const cmdParts = ["claude"];
    if (options.model) {
      cmdParts.push("--model", options.model);
    }
    if (options.flags) {
      cmdParts.push(...options.flags);
    }
    const command = cmdParts.join(" ");

    // Create tmux session with command as initial process
    await this.tmux.createSession(id, command, options.workdir);

    // Set hooks for event-driven status detection
    await this.tmux.setSessionHooks(id, this.port);

    // Enable output pipe for real-time streaming
    await this.tmux.enableOutputPipe(id, this.sessionsDir());

    const session: Session = {
      id,
      name,
      status: "active",
      createdAt: new Date().toISOString(),
      workdir: options.workdir,
      model: options.model,
      flags: options.flags,
    };

    this.sessions.set(id, session);
    this.saveMetadata(session);
    this.emitStatus(id, "active");

    return session;
  }

  /**
   * List all sessions.
   */
  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a single session by ID.
   */
  getSession(id: string): Session | null {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Stop a session by sending Ctrl+C.
   */
  async stop(id: string): Promise<void> {
    const session = this.requireSession(id);
    await this.tmux.stopSession(id);
    session.status = "stopped";
    this.saveMetadata(session);
    this.emitStatus(id, "stopped");
  }

  /**
   * Kill a session. Captures scrollback before destroying (locked decision).
   */
  async kill(id: string): Promise<string> {
    this.requireSession(id);
    const scrollback = await this.tmux.killSession(id);

    // Save scrollback to disk
    const scrollbackPath = join(this.sessionDir(id), "scrollback.txt");
    atomicWrite(scrollbackPath, scrollback);

    // Remove from active sessions
    this.sessions.delete(id);

    return scrollback;
  }

  /**
   * Archive a session. Stops it, captures scrollback, saves archive data.
   * Archives are kept forever (locked decision).
   */
  async archive(id: string): Promise<void> {
    const session = this.requireSession(id);

    // Stop the session first
    await this.tmux.stopSession(id);

    // Capture full scrollback
    const scrollback = await this.tmux.capturePane(id, true);

    // Save archive data
    const archiveDir = join(this.sessionDir(id), "archive");
    mkdirSync(archiveDir, { recursive: true });

    atomicWrite(join(archiveDir, "scrollback.txt"), scrollback);
    atomicWrite(
      join(archiveDir, "meta.json"),
      JSON.stringify(
        {
          sessionId: session.id,
          name: session.name,
          createdAt: session.createdAt,
          archivedAt: new Date().toISOString(),
          workdir: session.workdir,
          model: session.model,
          flags: session.flags,
        },
        null,
        2,
      ),
    );

    // Update status
    session.status = "archived";
    this.saveMetadata(session);
    this.emitStatus(id, "archived");
  }

  /**
   * Revive an archived session. Starts new session with --continue flag.
   * Revive is restore-only -- no optional prompt parameter (locked decision).
   */
  async revive(id: string): Promise<Session> {
    const session = this.requireSession(id);
    if (session.status !== "archived") {
      throw new Error(`Session ${id} is not archived (status: ${session.status})`);
    }

    const archiveDir = join(this.sessionDir(id), "archive");
    const scrollbackPath = join(archiveDir, "scrollback.txt");
    const metaPath = join(archiveDir, "meta.json");

    if (!existsSync(scrollbackPath) || !existsSync(metaPath)) {
      throw new Error(`Archive data missing for session ${id}`);
    }

    const archiveMeta = JSON.parse(readFileSync(metaPath, "utf-8"));

    // Build command with --continue flag
    const cmdParts = ["claude", "--continue"];
    if (archiveMeta.model) {
      cmdParts.push("--model", archiveMeta.model);
    }
    if (archiveMeta.flags) {
      cmdParts.push(...archiveMeta.flags);
    }
    const command = cmdParts.join(" ");

    // Create new session
    const newId = generateSessionId();
    const name = archiveMeta.name || session.name;

    await this.tmux.createSession(newId, command, archiveMeta.workdir);
    await this.tmux.setSessionHooks(newId, this.port);
    await this.tmux.enableOutputPipe(newId, this.sessionsDir());

    const newSession: Session = {
      id: newId,
      name,
      status: "active",
      createdAt: new Date().toISOString(),
      workdir: archiveMeta.workdir,
      model: archiveMeta.model,
      flags: archiveMeta.flags,
    };

    this.sessions.set(newId, newSession);
    this.saveMetadata(newSession);
    this.emitStatus(newId, "active");

    return newSession;
  }

  /**
   * Handle tmux hook events (event-driven status detection).
   */
  handleSessionEvent(sessionId: string, event: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    let newStatus: SessionStatus;
    switch (event) {
      case "exited":
        newStatus = "stopped";
        break;
      default:
        return;
    }

    session.status = newStatus;
    this.saveMetadata(session);
    this.emitStatus(sessionId, newStatus);
  }

  /**
   * Send input text to a session.
   */
  async sendInput(id: string, text: string): Promise<void> {
    this.requireSession(id);
    await this.tmux.sendKeys(id, text);
  }

  /**
   * Capture output from a session.
   */
  async captureOutput(id: string, scrollback: boolean = false): Promise<string> {
    this.requireSession(id);
    return this.tmux.capturePane(id, scrollback);
  }
}
