# Feature Landscape

**Domain:** Browser-accessible AI agent operating environment (cloud IDE + agent computer hybrid)
**Researched:** 2026-03-11

## Competitive Context

ClaudeOS sits at the intersection of three product categories:

1. **Cloud IDEs** (Gitpod, GitHub Codespaces, Firebase Studio, Coder) -- browser-accessible development environments with VS Code interfaces
2. **Agentic IDEs** (Cursor, Windsurf, Antigravity, Claude Code itself) -- AI-first coding environments with autonomous agent capabilities
3. **Agent Platforms** (OpenHands, Replit Agent, Bolt.new) -- platforms where AI agents build software with varying degrees of autonomy

ClaudeOS is none of these. It is an **operating environment for Claude Code** -- a wrapper that gives an already-powerful CLI agent a browser UI, session management, and the ability to extend itself. The closest competitor in spirit is OpenHands (browser UI around sandboxed AI agent), but ClaudeOS deliberately constrains itself to Claude Code as the engine and VS Code extensions as the module system.

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Browser-accessible IDE interface | Every cloud IDE has this; it's the core promise | Low | code-server provides this out of the box |
| Terminal access to agent sessions | OpenHands, Codespaces, every cloud IDE has terminals; users expect to see what the agent is doing | Low | tmux attach via VS Code terminal -- already planned |
| Session creation and management | OpenHands has session management, Antigravity has Agent Manager; running a single session is not enough | Med | Create, list, stop, kill sessions -- already planned |
| File system access and editing | Every cloud IDE and agent platform lets you see and edit files | Low | code-server provides this natively |
| Persistent state across restarts | Codespaces, Gitpod, Coder all persist workspace state; losing work on restart is unacceptable | Low | Persistent volume at /data -- already planned |
| Authentication / access control | Every browser-exposed tool requires auth; code-server has password auth | Low | CLAUDEOS_AUTH_TOKEN -- already planned |
| Secret / API key management | OpenHands, Codespaces all handle secrets; Claude Code needs an API key to function | Med | claudeos-secrets extension -- already planned |
| Container-based deployment | Codespaces, OpenHands, Daytona all deploy as containers; Docker is the expected deployment unit | Low | Docker + Railway -- already planned |
| Git integration | Every agentic IDE has git; Claude Code uses git natively but the UI should surface it | Low | code-server has git UI built in |
| Dark theme, clean minimal UI | Every modern dev tool defaults to dark theme; cluttered UIs signal amateur products | Low | Already planned via settings.json |

## Differentiators

Features that set ClaudeOS apart. Not expected by default, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Self-improvement via natural prompting** | No other product lets the AI agent build and install extensions for its own environment at runtime. Antigravity manages agents but they don't extend the IDE itself. This is ClaudeOS's single biggest differentiator. | High | claudeos-self-improve extension -- already planned. Claude Code builds a VS Code extension, packages it as VSIX, installs it, and the environment gains new capabilities. No competitor does this. |
| **Extension system mapped to VS Code extensions** | Unlike OpenHands (monolithic Python), Replit (proprietary), or Cursor (closed), ClaudeOS's module system is standard VS Code extensions. Anyone who can build a VS Code extension can extend ClaudeOS. Zero proprietary API learning curve. | Med | Already planned. The extension template + install-from-GitHub-URL flow is well-designed. |
| **Extensions can bundle MCP servers** | Extensions don't just add UI -- they can add tools that Claude Code can use. A memory extension adds both a UI panel AND gives Claude Code a "remember" tool via MCP. This bidirectional extension model (UI + agent tools) is unique. | Med | Already planned. MCP server registration on extension activate/deactivate. |
| **Session archive and revival** | No competitor offers "archive a session, save its context, revive it later in a new session with the old context." Cursor/Windsurf sessions are ephemeral. OpenHands sessions live only while running. | Med | Already planned. Archive saves scrollback; revive feeds previous context to a new Claude Code session. |
| **Multi-session management with status** | Windsurf added parallel sessions in Wave 13, Antigravity has Agent Manager, but ClaudeOS's session sidebar with status indicators (active/idle/waiting), notification badges, and archive/zombie support is more thoughtfully designed for persistent agent management. | Med | Already planned via claudeos-sessions extension. |
| **Claude Code integrity guarantee** | ClaudeOS never modifies Claude Code. When Claude Code updates, ClaudeOS keeps working. This is a trust and forward-compatibility advantage over products that patch or wrap their AI engine. | Low | Design constraint, not a feature to build. Document it prominently. |
| **One-click cloud deployment** | Railway template with "Deploy on Railway" button. Most agent platforms require Docker knowledge or self-hosting expertise. | Low | Already planned. Railway template as separate repo. |

## Future Differentiators (Out of Scope for v1, High Value Later)

These are features that would significantly differentiate ClaudeOS but are correctly deferred to future phases.

| Feature | Value Proposition | Complexity | When |
|---------|-------------------|------------|------|
| **Persistent memory system (Mem0 or similar)** | Agents that remember across sessions is the #1 requested capability in the AI agent space. Mem0 and similar frameworks are maturing rapidly. ClaudeOS's extension system makes this a natural add-on. | High | Post-v1 extension |
| **Browser automation (stealth Chrome)** | OpenHands has browser access. Operator, Comet, and browser-use demonstrate demand. Claude Code with browser tools would be extremely powerful. | High | Post-v1 extension |
| **Scheduling and automation (n8n)** | Run Claude Code sessions on schedules or triggers. No agentic IDE does this well. | Med | Post-v1 extension |
| **Execution graph visualization** | Antigravity generates "artifacts" for transparency. Visualizing what Claude Code did across sessions would build trust and aid debugging. | High | Post-v1 extension |
| **Custom extension marketplace** | VS Code marketplace API compatibility means in-IDE search and install. Currently URL-based install is fine. | Med | Post-v1 infrastructure |
| **Multi-agent orchestration / Agent Teams integration** | Claude Code now supports Agent Teams natively. ClaudeOS could provide UI for orchestrating agent teams with visual task boards and inter-agent message flows. | High | Post-v1, dependent on Agent Teams API stability |
| **WebAuthn / passkey authentication** | Enterprise-grade auth replacing password-based access. | Med | Post-v1 extension |

## Anti-Features

Features to explicitly NOT build. These are traps that would dilute the product or violate core principles.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom chat UI / conversation interface** | OpenHands and Replit built custom chat UIs. ClaudeOS does not need one -- Claude Code's native terminal rendering IS the interface. Building a chat UI means maintaining a rendering layer, handling streaming, dealing with tool call display, etc. It's a massive surface area that duplicates what Claude Code already does well. | Use tmux terminal attach. Claude Code renders itself. |
| **Code generation / completion engine** | Cursor, Windsurf, Copilot are code completion products. ClaudeOS is not a code editor -- it's an environment for running Claude Code. Adding completion would compete with Claude Code's own capabilities. | Let Claude Code handle all code generation through its native interface. |
| **Custom AI model integration** | Supporting multiple LLM providers (OpenAI, Gemini, etc.) would turn ClaudeOS into a generic agent platform. ClaudeOS is specifically for Claude Code. | Claude Code handles model selection. ClaudeOS passes through model flags. |
| **No-code / visual app builder** | Lovable, Bolt.new, and Replit's vibe coding target non-developers. ClaudeOS targets developers and power users who want Claude Code with a better environment. | Keep the VS Code interface. The audience knows what an IDE is. |
| **Forking or patching code-server** | Theia, OpenVSCode Server, and custom forks fragment the ecosystem and create maintenance burden. | Configure via product.json, settings.json, and extensions only. |
| **Modifying Claude Code in any way** | Wrapping, shimming, or proxying Claude Code breaks forward compatibility and violates the core design dogma. | Interact through tmux and Claude Code's public CLI only. |
| **Multi-user / team features in v1** | Coder and Codespaces handle multi-user. Adding user management, permissions, and shared workspaces is a massive scope increase with minimal value for the initial single-user target. | Single-user container deployment. Each user gets their own instance. |
| **Language server / intellisense** | code-server already includes VS Code's language services. Adding custom language support is unnecessary. | Rely on code-server's built-in capabilities and installable VS Code extensions. |
| **Mobile-optimized interface** | Cloud IDEs have largely failed at mobile. The VS Code interface doesn't work well on phones. Don't try to fix this. | Target desktop/laptop browsers. Tablet is a stretch goal at best. |

## Feature Dependencies

```
code-server (running) ─────┬──> claudeos-sessions (requires supervisor API)
                            │        │
                            │        └──> claudeos-terminal (requires sessions to exist)
                            │
supervisor (:3100) ─────────┼──> claudeos-secrets (requires supervisor for persistence path)
                            │        │
                            │        └──> claudeos-self-improve (requires secrets for GitHub PAT)
                            │                    │
                            │                    └──> Extension install API (requires supervisor)
                            │
                            └──> claudeos-home (requires supervisor for session creation)

claudeos-secrets ──────────────> Used by: self-improve (PATs), future extensions (API keys)
claudeos-sessions ─────────────> Used by: terminal (open session), home (recent sessions)
```

**Critical path:** Supervisor -> Sessions API -> Sessions Extension -> Terminal Extension. This is the minimum path to a usable product.

**Parallel work:** Secrets, Home, and Self-Improve extensions can be built in parallel once the supervisor API is stable.

## MVP Recommendation

**Phase 1 -- Minimum Viable Product (what makes it usable):**
1. Supervisor boots code-server with branding (table stakes: browser IDE)
2. Session API: create, list, stop, kill (table stakes: session management)
3. claudeos-sessions extension with sidebar (table stakes: see your sessions)
4. claudeos-terminal extension (table stakes: interact with Claude Code)
5. Container deployment with persistent volume (table stakes: doesn't lose state)
6. Password authentication (table stakes: access control)

**Phase 2 -- Usable Product (what makes it feel complete):**
1. claudeos-secrets extension (table stakes: API key management)
2. claudeos-home extension (table stakes: welcome experience)
3. Session archive and revival (differentiator: persistent agent history)
4. First-boot auto-installation of default extensions (polish)
5. Railway deployment template (differentiator: one-click cloud deploy)

**Phase 3 -- Differentiated Product (what makes it special):**
1. claudeos-self-improve extension with MCP server (primary differentiator)
2. Extension template and install-from-GitHub flow (differentiator: extensibility)
3. Notification badges and session status indicators (polish)
4. Extension manager UI panel (differentiator: visual extension management)

**Defer to post-v1:** Memory system, browser automation, scheduling, execution graphs, marketplace, agent teams UI, passkey auth.

**Rationale:** The first two phases deliver a working product that anyone can deploy and use. Phase 3 delivers the "why ClaudeOS instead of just running Claude Code in a terminal" answer: self-improvement and extensibility. The deferred features are all correctly scoped as future extensions that don't block the core value proposition.

## Sources

- [OpenHands Platform](https://openhands.dev/) -- agent platform with sandbox, chat UI, terminal, browser, Jupyter
- [OpenHands March 2026 Update](https://openhands.dev/blog/openhands-product-update---march-2026) -- Plan Mode, GUI Slash Menu
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/2026-agentic-coding-trends-report) -- multi-agent, extended task horizons, engineer role shift
- [Builder.io Agentic IDE Comparison](https://www.builder.io/blog/agentic-ide) -- Cursor, Windsurf, Claude Code, Kiro, Fusion, Firebase Studio
- [Google Antigravity](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/) -- Agent Manager, dual interface, agent-first paradigm
- [Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams) -- multi-agent orchestration with lead + subagents
- [Firebase Studio](https://firebase.google.com/docs/studio) -- cloud IDE with Gemini, app prototyping agent
- [Windsurf Wave 13](https://windsurf.com/compare/windsurf-vs-cursor) -- parallel multi-agent sessions, Arena Mode, Plan Mode
- [Daytona](https://www.daytona.io/) -- 90ms environment creation, stateful operations, enterprise security
- [Replit Agent](https://replit.com/discover/best-vibe-coding-tools) -- autonomous Agent 3, cloud IDE, effort-based pricing
- [Mem0 Agent Memory](https://mem0.ai/blog/memory-in-agents-what-why-and-how/) -- persistent memory layer for agents
- [MCP joins Linux Foundation](https://github.blog/open-source/maintainers/mcp-joins-the-linux-foundation-what-this-means-for-developers-building-the-next-era-of-ai-tools-and-agents/) -- 97M monthly SDK downloads, universal adoption
- [code-server marketplace](https://github.com/coder/code-server/discussions/5017) -- Open-VSX gallery, custom marketplace options
