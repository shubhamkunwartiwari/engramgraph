# EngramGraph — Persistent Multi-Agent Graph Memory Engine

**EngramGraph** is a model-agnostic, persistent multi-agent memory platform powered by **FalkorDB** and **Model Context Protocol (MCP)**. It decouples context from individual LLMs so teams can switch freely between **Claude**, **ChatGPT (GPT-4o / o3-mini)**, **Gemini**, **Llama**, or **DeepSeek**—and connect local coding agents like **Claude Code CLI**, **OpenAI Codex CLI**, and **Cursor**—without ever losing context or overflowing token windows.

---

## Core Architecture (The 5-Rule Paging Protocol)

1. **One Main Graph Partitioned into Sub-Topics (`(:RootGraph)-[:HAS_SUBTOPIC]->(:SubTopic)`)**
   - All project and company context lives in a single unified graph partitioned into distinct domain sub-topics (*Service Topology*, *Zero-Trust Auth*, *Graph Paging Engine*, *Incident Runbooks*, *Product Governance*, or your own custom partitions).
2. **Summary-First Working Memory**
   - Agents never load the entire graph at once. By default, every agent holds only the **Root Graph handle + a 2-sentence summary of each sub-topic** (~200 tokens total, saving ~85% of context window tokens).
3. **On-Demand Sub-Topic Checkout (`checkout_subtopic`)**
   - When an agent needs deep details for a task, it pulls (`PAGE_IN_CHECKOUT`) only the relevant sub-topic into active working memory.
4. **Autonomous Graph Updates (`update_subtopic_graph`)**
   - After completing its reasoning or code edits, the agent commits new Memory Nodes (`Fact`, `Decision`, `Procedure`, `Constraint`, `Episode`), links cross-topic edges, and bumps the sub-topic's executive summary version (`v1 → v2 → v3`).
5. **Context Eviction Back to Graph (`release_subtopic`)**
   - As soon as the agent no longer needs the detailed nodes loaded, it sends the sub-topic back into FalkorDB (`PAGE_OUT_RELEASE`), returning its active memory window to summary-only mode.

---

## Key Platform Features

- **Zero-Loss Model Hot-Swapping:** Switch any agent between Claude, ChatGPT, Gemini, Llama, or custom self-hosted vLLM/Ollama models at any time—even mid-task. All checked-out sub-topics and multi-hop traversal paths remain intact in the graph.
- **Multi-Workspace Project Isolation:** Create blank workspaces for new corporate projects, ingest raw PRDs/docs to auto-partition them into graph sub-topics, and export/import JSON or FalkorDB Cypher scripts.
- **Multi-Stage Workflow Studio:** Chain multiple agents and models sequentially over the shared graph.
- **Claude Code, OpenAI Codex CLI & IDE Integration (MCP):**
  - Exposes a live **MCP JSON-RPC 2.0 Server** (`POST /api/mcp`) and a zero-dependency stdio bridge (`engram-mcp-bridge.mjs`).
  - Download ready-to-use `CLAUDE.md` (for Claude Code) and `AGENTS.md` (for OpenAI Codex CLI) instruction files directly from the app.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the full-stack Express + Vite server on port 3000
npm run dev
```

### Connecting Claude Code CLI
```bash
curl -sL "http://localhost:3000/api/ide/engram-mcp-bridge.mjs" -o engram-mcp-bridge.mjs
claude mcp add engram-memory -- node ./engram-mcp-bridge.mjs
```

### Connecting OpenAI Codex CLI
Download `engram-mcp-bridge.mjs` and `AGENTS.md` from the **IDEs & CLI** tab into your repository root, then add `engram-memory` to `~/.codex/config.json`.
