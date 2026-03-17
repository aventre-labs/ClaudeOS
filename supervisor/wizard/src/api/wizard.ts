// ============================================================
// ClaudeOS Wizard - REST API Client
// ============================================================
// Typed fetch wrappers for all wizard backend endpoints.
// Base path: /api/v1/wizard
// ============================================================

import type { WizardStatus } from "../types";

const BASE = "/api/v1/wizard";

async function handleResponse(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }
}

export async function getWizardStatus(): Promise<WizardStatus> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }
  return res.json() as Promise<WizardStatus>;
}

export async function startRailwayLogin(): Promise<void> {
  const res = await fetch(`${BASE}/railway/start`, { method: "POST" });
  await handleResponse(res);
}

export async function submitAnthropicKey(apiKey: string): Promise<void> {
  const res = await fetch(`${BASE}/anthropic/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  await handleResponse(res);
}

export async function startClaudeLogin(): Promise<void> {
  const res = await fetch(`${BASE}/anthropic/login`, { method: "POST" });
  await handleResponse(res);
}

export async function submitAuthCode(code: string): Promise<void> {
  const res = await fetch(`${BASE}/anthropic/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  await handleResponse(res);
}

export async function startOAuthLogin(): Promise<{ url: string }> {
  const res = await fetch(`${BASE}/anthropic/oauth/start`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }
  return res.json() as Promise<{ url: string }>;
}

export async function submitOAuthCode(code: string): Promise<void> {
  const res = await fetch(`${BASE}/anthropic/oauth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  await handleResponse(res);
}

export async function skipAnthropicStep(): Promise<void> {
  const res = await fetch(`${BASE}/anthropic/skip`, { method: "POST" });
  await handleResponse(res);
}

export async function completeWizard(): Promise<void> {
  const res = await fetch(`${BASE}/complete`, { method: "POST" });
  await handleResponse(res);
}

export async function launchWizard(): Promise<void> {
  const res = await fetch(`${BASE}/launch`, { method: "POST" });
  await handleResponse(res);
}
