import fs from 'fs';
import path from 'path';
import { FalkorDB } from 'falkordb';
import {
  GraphMemoryState,
  SubTopic,
  MemoryNode,
  MemoryEdge,
  MemoryNodeKind,
  EdgeRelationType,
  PagingTraceStep,
  AgentRunResult,
  SUPPORTED_AGENT_MODELS,
  SavedGraphPath,
  ModelDescriptor,
  ModelProvider,
  AgentProfile,
  CustomWorkflow,
  WorkspaceMetadata,
  IdeClientSession,
  IdeClientType,
} from '../src/types/memory.ts';
import {
  INITIAL_GRAPH_STATE,
  DEFAULT_WORKFLOWS,
  createBlankWorkspaceState,
  estimateTokens,
} from './initialGraphData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'graph_memory.json');
const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');

export class GraphMemoryEngine {
  private state: GraphMemoryState;
  private falkorClient: Awaited<ReturnType<typeof FalkorDB.connect>> | null = null;
  private graphName: string = process.env.FALKORDB_GRAPH_NAME || 'engram_multi_agent_memory';

  constructor() {
    this.state = this.loadFromDisk();
    this.recalculateTokenCounts();
    if (process.env.FALKORDB_URL) {
      this.connectFalkorDB(process.env.FALKORDB_URL).catch((err) => {
        console.warn('Optional FalkorDB connection not reachable at startup, using persistent disk Cypher engine:', err.message);
      });
    }
  }

  private getWorkspaceFilePath(workspaceId: string): string {
    const safeId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(WORKSPACES_DIR, `${safeId}.json`);
  }

  private normalizeLoadedState(parsed: GraphMemoryState): GraphMemoryState {
    if (!Array.isArray(parsed.savedPaths)) {
      parsed.savedPaths = structuredClone(INITIAL_GRAPH_STATE.savedPaths);
    }
    if (!Array.isArray(parsed.availableModels) || parsed.availableModels.length === 0) {
      parsed.availableModels = structuredClone(SUPPORTED_AGENT_MODELS);
    }
    if (!Array.isArray(parsed.workflows)) {
      parsed.workflows =
        parsed.rootGraphId === 'engram_main_context'
          ? structuredClone(DEFAULT_WORKFLOWS)
          : [];
    }
    if (!Array.isArray(parsed.connectedIdeSessions) || parsed.connectedIdeSessions.length === 0) {
      const firstAg = parsed.agents?.[0] || INITIAL_GRAPH_STATE.agents[0];
      const secondAg = parsed.agents?.[1] || firstAg;
      parsed.connectedIdeSessions = [
        {
          id: 'ide_claude_code_1',
          clientType: 'Claude Code CLI',
          workspaceName: parsed.rootGraphName,
          repoBranch: 'main',
          boundAgentId: firstAg.id,
          boundAgentName: firstAg.name,
          activeModel: 'Claude 3.7 Sonnet',
          lastToolCalled: 'engram_get_index',
          status: 'connected',
          connectedAt: '2026-10-08T08:10:00Z',
          lastHeartbeatAt: new Date().toISOString(),
          totalCalls: 4,
        },
        {
          id: 'ide_openai_codex_1',
          clientType: 'OpenAI Codex CLI',
          workspaceName: parsed.rootGraphName,
          repoBranch: 'feat/graph-memory',
          boundAgentId: secondAg.id,
          boundAgentName: secondAg.name,
          activeModel: 'ChatGPT (o3-mini)',
          lastToolCalled: 'engram_checkout_subtopic',
          status: 'connected',
          connectedAt: '2026-10-08T08:15:00Z',
          lastHeartbeatAt: new Date().toISOString(),
          totalCalls: 3,
        },
      ];
    }
    parsed.agents = parsed.agents.map((ag, idx) => {
      const fallbackAg = INITIAL_GRAPH_STATE.agents[idx] || INITIAL_GRAPH_STATE.agents[0];
      return {
        ...fallbackAg,
        ...ag,
        activeModelId: ag.activeModelId || fallbackAg.activeModelId,
        activeModelLabel: ag.activeModelLabel || fallbackAg.activeModelLabel,
        activeProvider: ag.activeProvider || fallbackAg.activeProvider,
        modelSwitchCount:
          typeof ag.modelSwitchCount === 'number'
            ? ag.modelSwitchCount
            : fallbackAg.modelSwitchCount,
        activePathIds: Array.isArray(ag.activePathIds)
          ? ag.activePathIds
          : fallbackAg.activePathIds,
      };
    });
    parsed.traceHistory = parsed.traceHistory.map((t) => ({
      ...t,
      activeModel: t.activeModel || 'Claude 3.7 Sonnet',
    }));
    return parsed;
  }

  private loadFromDisk(): GraphMemoryState {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(WORKSPACES_DIR)) {
        fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
      }
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as GraphMemoryState;
        if (parsed && parsed.rootGraphId && Array.isArray(parsed.subtopics)) {
          const normalized = this.normalizeLoadedState(parsed);
          this.saveToDisk(normalized);
          return normalized;
        }
      }
    } catch (e) {
      console.warn('Failed to load existing graph state, initializing fresh state:', e);
    }
    const initial = structuredClone(INITIAL_GRAPH_STATE);
    this.saveToDisk(initial);
    return initial;
  }

  private saveToDisk(stateToSave: GraphMemoryState = this.state): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(WORKSPACES_DIR)) {
        fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
      const wsFile = this.getWorkspaceFilePath(stateToSave.rootGraphId);
      fs.writeFileSync(wsFile, JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to persist graph state to disk:', e);
    }
  }

  public listWorkspaces(): WorkspaceMetadata[] {
    try {
      if (!fs.existsSync(WORKSPACES_DIR)) {
        fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
      }
      const files = fs.readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith('.json'));
      const list: WorkspaceMetadata[] = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(WORKSPACES_DIR, file), 'utf-8');
          const ws = JSON.parse(raw) as GraphMemoryState;
          if (ws && ws.rootGraphId) {
            list.push({
              id: ws.rootGraphId,
              name: ws.rootGraphName,
              description: ws.rootGraphDescription,
              subtopicCount: Array.isArray(ws.subtopics) ? ws.subtopics.length : 0,
              nodeCount: Array.isArray(ws.nodes) ? ws.nodes.length : 0,
              agentCount: Array.isArray(ws.agents) ? ws.agents.length : 0,
              updatedAt:
                ws.subtopics?.[0]?.updatedAt || new Date().toISOString(),
            });
          }
        } catch {
          // ignore malformed file
        }
      }
      if (!list.some((w) => w.id === this.state.rootGraphId)) {
        list.unshift({
          id: this.state.rootGraphId,
          name: this.state.rootGraphName,
          description: this.state.rootGraphDescription,
          subtopicCount: this.state.subtopics.length,
          nodeCount: this.state.nodes.length,
          agentCount: this.state.agents.length,
          updatedAt: new Date().toISOString(),
        });
      }
      return list;
    } catch {
      return [];
    }
  }

  public switchWorkspace(workspaceId: string): GraphMemoryState {
    const wsPath = this.getWorkspaceFilePath(workspaceId);
    if (!fs.existsSync(wsPath)) {
      if (workspaceId === 'engram_main_context') {
        this.state = structuredClone(INITIAL_GRAPH_STATE);
        this.saveToDisk();
        return this.getState();
      }
      throw new Error(`Workspace "${workspaceId}" not found.`);
    }
    const raw = fs.readFileSync(wsPath, 'utf-8');
    const parsed = JSON.parse(raw) as GraphMemoryState;
    this.state = this.normalizeLoadedState(parsed);
    this.recalculateTokenCounts();
    this.saveToDisk();
    return this.getState();
  }

  public createWorkspace(params: {
    name: string;
    description: string;
    template?: 'blank' | 'enterprise_sample';
  }): GraphMemoryState {
    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 18);
    const id = `ws_${slug || 'project'}_${Date.now().toString(36).slice(-4)}`;

    if (params.template === 'enterprise_sample') {
      const cloned = structuredClone(INITIAL_GRAPH_STATE);
      cloned.rootGraphId = id;
      cloned.rootGraphName = params.name.trim();
      cloned.rootGraphDescription =
        params.description.trim() || cloned.rootGraphDescription;
      this.state = cloned;
    } else {
      this.state = createBlankWorkspaceState({
        id,
        name: params.name.trim(),
        description: params.description.trim(),
      });
    }

    this.recalculateTokenCounts();
    this.saveToDisk();
    return this.getState();
  }

  public importWorkspaceJson(rawState: Partial<GraphMemoryState>): GraphMemoryState {
    if (!rawState || !Array.isArray(rawState.subtopics) || !Array.isArray(rawState.nodes)) {
      throw new Error('Invalid workspace JSON: must include subtopics and nodes arrays.');
    }
    const imported: GraphMemoryState = this.normalizeLoadedState({
      ...structuredClone(INITIAL_GRAPH_STATE),
      ...rawState,
      rootGraphId:
        rawState.rootGraphId || `ws_imported_${Date.now().toString(36).slice(-4)}`,
      rootGraphName: rawState.rootGraphName || 'Imported Corporate Graph',
    } as GraphMemoryState);
    this.state = imported;
    this.recalculateTokenCounts();
    this.saveToDisk();
    return this.getState();
  }

  public recalculateTokenCounts(): void {
    for (const sub of this.state.subtopics) {
      sub.summaryTokenCount = estimateTokens(`${sub.name} (${sub.domain}): ${sub.summary}`);
      const subNodes = this.state.nodes.filter((n) => n.subtopicId === sub.id);
      let fullTokens = sub.summaryTokenCount;
      for (const node of subNodes) {
        node.tokenCount = estimateTokens(`${node.title} [${node.kind}]: ${node.content}`);
        fullTokens += node.tokenCount;
      }
      sub.fullTokenCount = fullTokens;
    }
  }

  public getState(): GraphMemoryState {
    this.recalculateTokenCounts();
    this.state.workspaces = this.listWorkspaces();
    return this.state;
  }

  public resetToDefault(): GraphMemoryState {
    this.state = structuredClone(INITIAL_GRAPH_STATE);
    this.recalculateTokenCounts();
    this.saveToDisk();
    return this.state;
  }

  public async connectFalkorDB(url: string, graphName?: string): Promise<{ connected: boolean; endpoint: string; message: string }> {
    if (graphName) {
      this.graphName = graphName;
    }
    try {
      if (this.falkorClient) {
        await this.falkorClient.close().catch(() => {});
      }
      const client = await FalkorDB.connect({ url });
      this.falkorClient = client;
      this.state.falkorConnected = true;
      this.state.falkorEndpoint = url;
      await this.syncAllToFalkorDB();
      this.saveToDisk();
      return {
        connected: true,
        endpoint: url,
        message: `Connected to FalkorDB (${url}) and synced graph '${this.graphName}'.`,
      };
    } catch (err: any) {
      this.falkorClient = null;
      this.state.falkorConnected = false;
      this.state.falkorEndpoint = 'embedded://falkordb-cypher-engine';
      this.saveToDisk();
      throw new Error(`Could not connect to FalkorDB at ${url}: ${err?.message || 'Connection refused'}`);
    }
  }

  private async runCypherOnFalkor(cypher: string, params?: Record<string, any>): Promise<void> {
    if (!this.falkorClient || !this.state.falkorConnected) return;
    try {
      const graph = this.falkorClient.selectGraph(this.graphName);
      await graph.query(cypher, { params });
    } catch (err: any) {
      console.warn('FalkorDB live query warning:', err?.message);
    }
  }

  public async syncAllToFalkorDB(): Promise<void> {
    if (!this.falkorClient || !this.state.falkorConnected) return;
    const graph = this.falkorClient.selectGraph(this.graphName);
    await graph.query(`MATCH (n) DETACH DELETE n`).catch(() => {});
    await graph.query(
      `CREATE (:RootGraph {id: $id, name: $name, description: $desc})`,
      {
        params: {
          id: this.state.rootGraphId,
          name: this.state.rootGraphName,
          desc: this.state.rootGraphDescription,
        },
      }
    );
    for (const sub of this.state.subtopics) {
      await graph.query(
        `MATCH (g:RootGraph {id: $rootId})
         CREATE (g)-[:HAS_SUBTOPIC]->(:SubTopic {
           id: $id, name: $name, domain: $domain, summary: $summary, version: $version, updatedAt: $updatedAt
         })`,
        {
          params: {
            rootId: this.state.rootGraphId,
            id: sub.id,
            name: sub.name,
            domain: sub.domain,
            summary: sub.summary,
            version: sub.version,
            updatedAt: sub.updatedAt,
          },
        }
      );
    }
    for (const node of this.state.nodes) {
      await graph.query(
        `MATCH (s:SubTopic {id: $subtopicId})
         CREATE (s)-[:CONTAINS_MEMORY]->(:MemoryNode {
           id: $id, subtopicId: $subtopicId, title: $title, content: $content, kind: $kind, confidence: $confidence
         })`,
        {
          params: {
            subtopicId: node.subtopicId,
            id: node.id,
            title: node.title,
            content: node.content,
            kind: node.kind,
            confidence: node.confidence,
          },
        }
      );
    }
  }

  public getAgentActiveTokens(agentId: string): {
    summaryIndexTokens: number;
    mountedSubtopicTokens: number;
    totalActiveTokens: number;
    unloadedGraphTokens: number;
  } {
    this.recalculateTokenCounts();
    const agent = this.state.agents.find((a) => a.id === agentId);
    const summaryIndexTokens = this.state.subtopics.reduce((acc, s) => acc + s.summaryTokenCount, 0);
    const totalFullGraphTokens = this.state.subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);

    if (!agent) {
      return {
        summaryIndexTokens,
        mountedSubtopicTokens: 0,
        totalActiveTokens: summaryIndexTokens,
        unloadedGraphTokens: totalFullGraphTokens - summaryIndexTokens,
      };
    }

    let mountedSubtopicTokens = 0;
    for (const subId of agent.mountedSubtopicIds) {
      const sub = this.state.subtopics.find((s) => s.id === subId);
      if (sub) {
        const internalTokens = Math.max(0, sub.fullTokenCount - sub.summaryTokenCount);
        mountedSubtopicTokens += internalTokens;
      }
    }

    const totalActiveTokens = summaryIndexTokens + mountedSubtopicTokens;
    const unloadedGraphTokens = Math.max(0, totalFullGraphTokens - totalActiveTokens);

    return {
      summaryIndexTokens,
      mountedSubtopicTokens,
      totalActiveTokens,
      unloadedGraphTokens,
    };
  }

  /**
   * Hot-swaps an agent's LLM model (e.g., Claude 3.7 Sonnet <-> ChatGPT GPT-4o <-> Gemini 3.8 Flash)
   * WITHOUT erasing any context, mounted sub-topics, or saved graph paths.
   */
  public async switchAgentModel(
    agentId: string,
    newModelId: string
  ): Promise<{
    step: PagingTraceStep;
    previousModel: string;
    newModel: string;
    preservedSubtopics: string[];
    preservedPaths: string[];
  }> {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const modelDescriptor =
      this.state.availableModels.find((m) => m.id === newModelId) ||
      SUPPORTED_AGENT_MODELS.find((m) => m.id === newModelId) ||
      {
        id: newModelId,
        label: newModelId,
        provider: 'OpenAI ChatGPT' as const,
      };

    const previousModel = agent.activeModelLabel;
    const now = new Date().toISOString();
    const tokenStats = this.getAgentActiveTokens(agentId);

    agent.activeModelId = modelDescriptor.id;
    agent.activeModelLabel = modelDescriptor.label;
    agent.activeProvider = modelDescriptor.provider;
    agent.modelSwitchCount = (agent.modelSwitchCount || 0) + 1;
    agent.lastActiveAt = now;

    // Update any active subtopic leases held by this agent so the new model inherits them seamlessly
    for (const sub of this.state.subtopics) {
      for (const lease of sub.activeLeases) {
        if (lease.agentId === agent.id) {
          lease.activeModel = modelDescriptor.label;
        }
      }
    }

    const cypher = `MATCH (a:Agent {id: '${agent.id}'})\nSET a.activeModelId = '${modelDescriptor.id}',\n    a.activeModelLabel = ${JSON.stringify(modelDescriptor.label)},\n    a.activeProvider = ${JSON.stringify(modelDescriptor.provider)},\n    a.modelSwitchCount = ${agent.modelSwitchCount}\nWITH a OPTIONAL MATCH (a)-[lease:HOLDING_CONTEXT]->(s:SubTopic)\nSET lease.activeModel = ${JSON.stringify(modelDescriptor.label)}\nRETURN a.id, a.activeModelLabel, collect(s.id) AS preservedLeases, a.activePathIds AS preservedPaths`;

    await this.runCypherOnFalkor(cypher);

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: now,
      agentId: agent.id,
      agentName: agent.name,
      activeModel: modelDescriptor.label,
      phase: 'MODEL_HOT_SWAP',
      summary: `Hot-swapped ${agent.name} model: ${previousModel} → ${modelDescriptor.label} (0 context erased).`,
      detail: `Preserved ${this.state.subtopics.length} sub-topic summaries, ${agent.mountedSubtopicIds.length} mounted sub-topic lease(s) [${agent.mountedSubtopicIds.join(', ') || 'none'}], and ${this.state.savedPaths.length} shared traversal paths in FalkorDB.`,
      cypherQuery: cypher,
      activeTokensBefore: tokenStats.totalActiveTokens,
      activeTokensAfter: tokenStats.totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();

    return {
      step,
      previousModel,
      newModel: modelDescriptor.label,
      preservedSubtopics: [...agent.mountedSubtopicIds],
      preservedPaths: this.state.savedPaths.map((p) => p.id),
    };
  }

  /**
   * Saves a multi-hop graph traversal path so any model (Claude, ChatGPT, Gemini) can access it.
   */
  public async saveGraphPath(params: {
    title: string;
    description: string;
    nodeIds: string[];
    agentId: string;
  }): Promise<SavedGraphPath> {
    const agent = this.state.agents.find((a) => a.id === params.agentId) || this.state.agents[0];
    const validNodes = params.nodeIds
      .map((id) => this.state.nodes.find((n) => n.id === id))
      .filter((n): n is MemoryNode => Boolean(n));

    if (validNodes.length < 2) {
      throw new Error('A graph traversal path requires at least 2 connected or sequential MemoryNodes.');
    }

    const subtopicIds = Array.from(new Set(validNodes.map((n) => n.subtopicId)));
    const nodeIdSet = new Set(validNodes.map((n) => n.id));
    const edgeIds = this.state.edges
      .filter((e) => nodeIdSet.has(e.sourceId) && nodeIdSet.has(e.targetId))
      .map((e) => e.id);

    const newPath: SavedGraphPath = {
      id: `path_${Date.now().toString(36)}`,
      title: params.title.trim(),
      description: params.description.trim(),
      subtopicIds,
      nodeIds: validNodes.map((n) => n.id),
      edgeIds,
      createdByAgentId: agent.id,
      authoredByModel: agent.activeModelLabel,
      createdAt: new Date().toISOString(),
    };

    this.state.savedPaths.unshift(newPath);
    if (!agent.activePathIds.includes(newPath.id)) {
      agent.activePathIds.push(newPath.id);
    }

    this.saveToDisk();
    return newPath;
  }

  /**
   * Returns the portable, model-agnostic context & path bundle for any external LLM
   * (Claude, ChatGPT, Gemini, Llama, or MCP client) connecting to this graph.
   */
  public getAgentScopedGraphView(agentId: string) {
    this.recalculateTokenCounts();
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const tokenStats = this.getAgentActiveTokens(agentId);

    const subtopicDirectory = this.state.subtopics.map((s) => {
      const isMounted = agent.mountedSubtopicIds.includes(s.id);
      const nodeCount = this.state.nodes.filter((n) => n.subtopicId === s.id).length;
      return {
        id: s.id,
        name: s.name,
        domain: s.domain,
        summary: s.summary,
        version: s.version,
        lastUpdatedBy: s.lastUpdatedBy,
        lastUpdatedByModel: s.lastUpdatedByModel,
        updatedAt: s.updatedAt,
        nodeCount,
        summaryTokenCount: s.summaryTokenCount,
        fullTokenCount: s.fullTokenCount,
        statusInAgentMemory: isMounted ? 'PAGED_IN_MOUNTED' : 'PAGED_OUT_SUMMARY_ONLY',
      };
    });

    const mountedDetails = this.state.subtopics
      .filter((s) => agent.mountedSubtopicIds.includes(s.id))
      .map((s) => {
        const nodes = this.state.nodes.filter((n) => n.subtopicId === s.id);
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edges = this.state.edges.filter(
          (e) => nodeIds.has(e.sourceId) || nodeIds.has(e.targetId)
        );
        return {
          subtopicId: s.id,
          subtopicName: s.name,
          version: s.version,
          summary: s.summary,
          nodes,
          edges,
        };
      });

    return {
      agent,
      rootGraphId: this.state.rootGraphId,
      tokenStats,
      subtopicDirectory,
      mountedSubtopics: mountedDetails,
      savedPaths: this.state.savedPaths,
      universalToolSchemas: {
        openaiChatGptTools: [
          {
            type: 'function',
            function: {
              name: 'checkout_subtopic',
              description: 'Page in full MemoryNodes and edges inside a FalkorDB SubTopic.',
              parameters: {
                type: 'object',
                properties: {
                  subtopicId: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['subtopicId', 'reason'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'update_subtopic_graph',
              description: 'Commit new MemoryNodes, edges, and an updated summary back into the FalkorDB SubTopic.',
              parameters: {
                type: 'object',
                properties: {
                  subtopicId: { type: 'string' },
                  newNodes: { type: 'array' },
                  updatedSummary: { type: 'string' },
                  commitMessage: { type: 'string' },
                },
                required: ['subtopicId', 'newNodes', 'updatedSummary', 'commitMessage'],
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'release_subtopic',
              description: 'Evict a checked-out SubTopic from working memory back into the FalkorDB graph.',
              parameters: {
                type: 'object',
                properties: {
                  subtopicId: { type: 'string' },
                  releaseReason: { type: 'string' },
                },
                required: ['subtopicId', 'releaseReason'],
              },
            },
          },
        ],
        anthropicClaudeTools: [
          {
            name: 'checkout_subtopic',
            description: 'Page in full MemoryNodes and edges inside a FalkorDB SubTopic.',
            input_schema: {
              type: 'object',
              properties: {
                subtopicId: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['subtopicId', 'reason'],
            },
          },
          {
            name: 'update_subtopic_graph',
            description: 'Commit new MemoryNodes, edges, and an updated summary back into the FalkorDB SubTopic.',
            input_schema: {
              type: 'object',
              properties: {
                subtopicId: { type: 'string' },
                newNodes: { type: 'array' },
                updatedSummary: { type: 'string' },
                commitMessage: { type: 'string' },
              },
              required: ['subtopicId', 'newNodes', 'updatedSummary', 'commitMessage'],
            },
          },
          {
            name: 'release_subtopic',
            description: 'Evict a checked-out SubTopic from working memory back into the FalkorDB graph.',
            input_schema: {
              type: 'object',
              properties: {
                subtopicId: { type: 'string' },
                releaseReason: { type: 'string' },
              },
              required: ['subtopicId', 'releaseReason'],
            },
          },
        ],
      },
    };
  }

  public recordIndexScan(agentId: string, reason: string): PagingTraceStep {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    agent.status = 'inspecting_index';
    agent.lastActiveAt = new Date().toISOString();
    const { totalActiveTokens } = this.getAgentActiveTokens(agentId);

    const cypher = `MATCH (g:RootGraph {id: '${this.state.rootGraphId}'})-[:HAS_SUBTOPIC]->(s:SubTopic)\nOPTIONAL MATCH (p:TraversalPath)\nRETURN s.id, s.name, s.domain, s.summary, s.version, collect(DISTINCT p.id) AS sharedPaths\nORDER BY s.id`;

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: new Date().toISOString(),
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      phase: 'INDEX_SCAN',
      summary: `${agent.name} (${agent.activeModelLabel}) scanned RootGraph Summary Index (${this.state.subtopics.length} sub-topics, ${this.state.savedPaths.length} shared paths).`,
      detail: reason,
      cypherQuery: cypher,
      activeTokensBefore: totalActiveTokens,
      activeTokensAfter: totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();
    return step;
  }

  public async checkoutSubtopic(
    agentId: string,
    subtopicId: string,
    reason: string
  ): Promise<{
    step: PagingTraceStep;
    subtopic: SubTopic;
    nodes: MemoryNode[];
    edges: MemoryEdge[];
    crossTopicHints: Array<{ edge: MemoryEdge; externalNode: MemoryNode; externalSubtopic: SubTopic }>;
  }> {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const subtopic = this.state.subtopics.find((s) => s.id === subtopicId);
    if (!subtopic) throw new Error(`Sub-Topic ${subtopicId} not found in RootGraph`);

    const beforeStats = this.getAgentActiveTokens(agentId);
    const now = new Date().toISOString();

    if (!agent.mountedSubtopicIds.includes(subtopicId)) {
      agent.mountedSubtopicIds.push(subtopicId);
    }
    agent.status = 'paged_in_reasoning';
    agent.lastActiveAt = now;

    const existingLeaseIdx = subtopic.activeLeases.findIndex((l) => l.agentId === agentId);
    if (existingLeaseIdx >= 0) {
      subtopic.activeLeases[existingLeaseIdx] = {
        agentId: agent.id,
        agentName: agent.name,
        activeModel: agent.activeModelLabel,
        checkedOutAt: now,
        reason,
      };
    } else {
      subtopic.activeLeases.push({
        agentId: agent.id,
        agentName: agent.name,
        activeModel: agent.activeModelLabel,
        checkedOutAt: now,
        reason,
      });
    }

    const afterStats = this.getAgentActiveTokens(agentId);
    const subNodes = this.state.nodes.filter((n) => n.subtopicId === subtopicId);
    const subNodeIds = new Set(subNodes.map((n) => n.id));

    const relatedEdges = this.state.edges.filter(
      (e) => subNodeIds.has(e.sourceId) || subNodeIds.has(e.targetId)
    );

    const crossTopicHints: Array<{ edge: MemoryEdge; externalNode: MemoryNode; externalSubtopic: SubTopic }> = [];
    for (const edge of relatedEdges) {
      const otherNodeId = subNodeIds.has(edge.sourceId) ? edge.targetId : edge.sourceId;
      if (!subNodeIds.has(otherNodeId)) {
        const externalNode = this.state.nodes.find((n) => n.id === otherNodeId);
        if (externalNode) {
          const externalSub = this.state.subtopics.find((s) => s.id === externalNode.subtopicId);
          if (externalSub) {
            crossTopicHints.push({ edge, externalNode, externalSubtopic: externalSub });
          }
        }
      }
    }

    const cypher = `MATCH (a:Agent {id: '${agent.id}'}), (s:SubTopic {id: '${subtopic.id}'})\nMERGE (a)-[:HOLDING_CONTEXT {checkedOutAt: '${now}', activeModel: ${JSON.stringify(agent.activeModelLabel)}, reason: ${JSON.stringify(reason)}}]->(s)\nWITH s MATCH (s)-[:CONTAINS_MEMORY]->(m:MemoryNode)\nOPTIONAL MATCH (m)-[r]->(target:MemoryNode)\nRETURN s, collect(DISTINCT m) AS nodes, collect(DISTINCT r) AS edges`;

    await this.runCypherOnFalkor(cypher);

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: now,
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      phase: 'PAGE_IN_CHECKOUT',
      subtopicId: subtopic.id,
      subtopicName: subtopic.name,
      summary: `Paged IN [${subtopic.name}] for ${agent.name} on ${agent.activeModelLabel} (+${afterStats.totalActiveTokens - beforeStats.totalActiveTokens} tokens).`,
      detail: `Reason: ${reason}. Loaded ${subNodes.length} MemoryNodes and ${relatedEdges.length} edges into working memory.`,
      cypherQuery: cypher,
      activeTokensBefore: beforeStats.totalActiveTokens,
      activeTokensAfter: afterStats.totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();

    return {
      step,
      subtopic,
      nodes: subNodes,
      edges: relatedEdges,
      crossTopicHints,
    };
  }

  public async mutateSubtopicGraph(params: {
    agentId: string;
    subtopicId: string;
    newNodes?: Array<{
      title: string;
      content: string;
      kind: MemoryNodeKind;
      confidence?: number;
      connectToNodeId?: string;
      relationType?: EdgeRelationType;
      edgeRationale?: string;
    }>;
    updatedNodes?: Array<{
      nodeId: string;
      title?: string;
      content: string;
    }>;
    updatedSummary: string;
    commitMessage: string;
  }): Promise<{
    step: PagingTraceStep;
    subtopic: SubTopic;
    createdNodes: MemoryNode[];
    createdEdges: MemoryEdge[];
  }> {
    const agent = this.state.agents.find((a) => a.id === params.agentId);
    if (!agent) throw new Error(`Agent ${params.agentId} not found`);

    const subtopic = this.state.subtopics.find((s) => s.id === params.subtopicId);
    if (!subtopic) throw new Error(`Sub-Topic ${params.subtopicId} not found`);

    const beforeStats = this.getAgentActiveTokens(params.agentId);
    const now = new Date().toISOString();
    agent.status = 'committing_graph';
    agent.lastActiveAt = now;
    agent.totalCommits += 1;

    const createdNodes: MemoryNode[] = [];
    const createdEdges: MemoryEdge[] = [];

    if (params.newNodes && Array.isArray(params.newNodes)) {
      for (const item of params.newNodes) {
        const nodeId = `node_${params.subtopicId.replace('sub_', '')}_${Date.now().toString(36).slice(-4)}_${Math.random().toString(36).slice(2, 4)}`;
        const newNode: MemoryNode = {
          id: nodeId,
          subtopicId: subtopic.id,
          title: item.title,
          content: item.content,
          kind: item.kind || MemoryNodeKind.FACT,
          confidence: item.confidence ?? 0.96,
          createdByAgentId: agent.id,
          authoredByModel: agent.activeModelLabel,
          updatedAt: now,
          tokenCount: estimateTokens(`${item.title} [${item.kind || 'Fact'}]: ${item.content}`),
        };
        this.state.nodes.push(newNode);
        createdNodes.push(newNode);

        if (item.connectToNodeId) {
          const targetNode = this.state.nodes.find((n) => n.id === item.connectToNodeId);
          if (targetNode) {
            const newEdge: MemoryEdge = {
              id: `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
              sourceId: newNode.id,
              targetId: item.connectToNodeId,
              relation: item.relationType || EdgeRelationType.RELATES_TO,
              rationale: item.edgeRationale || params.commitMessage,
              createdByAgentId: agent.id,
              authoredByModel: agent.activeModelLabel,
              createdAt: now,
            };
            this.state.edges.push(newEdge);
            createdEdges.push(newEdge);

            // Also automatically record a persistent cross-model path when linking nodes across sub-topics!
            if (targetNode.subtopicId !== subtopic.id) {
              const autoPath: SavedGraphPath = {
                id: `path_${Date.now().toString(36).slice(-5)}`,
                title: `${newNode.title} → ${targetNode.title}`,
                description: `Cross-subtopic path (${subtopic.id} → ${targetNode.subtopicId}) persisted by ${agent.name} (${agent.activeModelLabel}). Accessible to all models.`,
                subtopicIds: [subtopic.id, targetNode.subtopicId],
                nodeIds: [newNode.id, targetNode.id],
                edgeIds: [newEdge.id],
                createdByAgentId: agent.id,
                authoredByModel: agent.activeModelLabel,
                createdAt: now,
              };
              this.state.savedPaths.unshift(autoPath);
              if (!agent.activePathIds.includes(autoPath.id)) {
                agent.activePathIds.push(autoPath.id);
              }
            }
          }
        }
      }
    }

    if (params.updatedNodes && Array.isArray(params.updatedNodes)) {
      for (const upd of params.updatedNodes) {
        const existing = this.state.nodes.find((n) => n.id === upd.nodeId && n.subtopicId === subtopic.id);
        if (existing) {
          if (upd.title) existing.title = upd.title;
          existing.content = upd.content;
          existing.updatedAt = now;
          existing.createdByAgentId = agent.id;
          existing.authoredByModel = agent.activeModelLabel;
        }
      }
    }

    if (params.updatedSummary && params.updatedSummary.trim().length > 10) {
      subtopic.summary = params.updatedSummary.trim();
    }
    subtopic.version += 1;
    subtopic.updatedAt = now;
    subtopic.lastUpdatedBy = agent.id;
    subtopic.lastUpdatedByModel = agent.activeModelLabel;
    subtopic.revisionHistory.push({
      version: subtopic.version,
      summary: subtopic.summary,
      updatedByAgentId: agent.id,
      authoredByModel: agent.activeModelLabel,
      updatedAt: now,
      commitNote: params.commitMessage,
    });

    this.recalculateTokenCounts();
    const afterStats = this.getAgentActiveTokens(params.agentId);

    const nodeCreateCypher = createdNodes
      .map(
        (n) =>
          `CREATE (s)-[:CONTAINS_MEMORY]->(:MemoryNode {id: '${n.id}', kind: '${n.kind}', authoredByModel: ${JSON.stringify(agent.activeModelLabel)}, title: ${JSON.stringify(n.title)}, content: ${JSON.stringify(n.content)}})`
      )
      .join('\n');

    const cypher = `MATCH (s:SubTopic {id: '${subtopic.id}'})\n${nodeCreateCypher ? nodeCreateCypher + '\n' : ''}SET s.summary = ${JSON.stringify(subtopic.summary)},\n    s.version = ${subtopic.version},\n    s.lastUpdatedBy = '${agent.id}',\n    s.lastUpdatedByModel = ${JSON.stringify(agent.activeModelLabel)},\n    s.updatedAt = '${now}'\nRETURN s.id, s.version, s.summary`;

    await this.runCypherOnFalkor(cypher);

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: now,
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      phase: 'GRAPH_COMMIT',
      subtopicId: subtopic.id,
      subtopicName: subtopic.name,
      summary: `${agent.name} (${agent.activeModelLabel}) committed +${createdNodes.length} nodes, +${createdEdges.length} edges to [${subtopic.name}] (v${subtopic.version}).`,
      detail: `${params.commitMessage} — New Sub-Topic Summary: "${subtopic.summary}"`,
      cypherQuery: cypher,
      activeTokensBefore: beforeStats.totalActiveTokens,
      activeTokensAfter: afterStats.totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();

    return {
      step,
      subtopic,
      createdNodes,
      createdEdges,
    };
  }

  public async releaseSubtopic(
    agentId: string,
    subtopicId: string,
    releaseReason: string
  ): Promise<{ step: PagingTraceStep; subtopic: SubTopic }> {
    const agent = this.state.agents.find((a) => a.id === agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);

    const subtopic = this.state.subtopics.find((s) => s.id === subtopicId);
    if (!subtopic) throw new Error(`Sub-Topic ${subtopicId} not found`);

    const beforeStats = this.getAgentActiveTokens(agentId);
    const now = new Date().toISOString();

    agent.mountedSubtopicIds = agent.mountedSubtopicIds.filter((id) => id !== subtopicId);
    subtopic.activeLeases = subtopic.activeLeases.filter((l) => l.agentId !== agentId);

    agent.status = agent.mountedSubtopicIds.length > 0 ? 'paged_in_reasoning' : 'idle';
    agent.lastActiveAt = now;

    const afterStats = this.getAgentActiveTokens(agentId);
    const freedTokens = Math.max(0, beforeStats.totalActiveTokens - afterStats.totalActiveTokens);

    const cypher = `MATCH (a:Agent {id: '${agent.id}'})-[lease:HOLDING_CONTEXT]->(s:SubTopic {id: '${subtopic.id}'})\nDELETE lease\nRETURN a.id AS agentId, s.id AS releasedSubtopic, s.version AS persistedVersion`;

    await this.runCypherOnFalkor(cypher);

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: now,
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      phase: 'PAGE_OUT_RELEASE',
      subtopicId: subtopic.id,
      subtopicName: subtopic.name,
      summary: `Sent [${subtopic.name}] back into FalkorDB (-${freedTokens} tokens freed from working memory).`,
      detail: `${releaseReason}. Context remains persisted in FalkorDB for any model (Claude, ChatGPT, Gemini) to check out next.`,
      cypherQuery: cypher,
      activeTokensBefore: beforeStats.totalActiveTokens,
      activeTokensAfter: afterStats.totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();

    return { step, subtopic };
  }

  public async createSubtopic(params: {
    name: string;
    domain: string;
    summary: string;
    color?: string;
    createdByAgentId?: string;
    initialNodes?: Array<{
      title: string;
      content: string;
      kind: MemoryNodeKind;
    }>;
  }): Promise<{ subtopic: SubTopic; step: PagingTraceStep }> {
    const now = new Date().toISOString();
    const agentId = params.createdByAgentId || 'agent_atlas';
    const agent = this.state.agents.find((a) => a.id === agentId) || this.state.agents[0];

    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 14);
    const subtopicId = `sub_${slug}_${Date.now().toString(36).slice(-3)}`;

    const palette = ['#10B981', '#F59E0B', '#38BDF8', '#F43F5E', '#A855F7', '#14B8A6', '#6366F1'];
    const color = params.color || palette[this.state.subtopics.length % palette.length];

    const newSub: SubTopic = {
      id: subtopicId,
      name: params.name.trim(),
      domain: params.domain.trim() || 'Specialized Context',
      color,
      summary: params.summary.trim(),
      version: 1,
      updatedAt: now,
      lastUpdatedBy: agent.id,
      lastUpdatedByModel: agent.activeModelLabel,
      summaryTokenCount: 0,
      fullTokenCount: 0,
      activeLeases: [],
      revisionHistory: [
        {
          version: 1,
          summary: params.summary.trim(),
          updatedByAgentId: agent.id,
          authoredByModel: agent.activeModelLabel,
          updatedAt: now,
          commitNote: `Created new sub-topic partition in RootGraph via ${agent.activeModelLabel}`,
        },
      ],
    };

    this.state.subtopics.push(newSub);

    if (params.initialNodes && Array.isArray(params.initialNodes)) {
      for (const n of params.initialNodes) {
        if (!n.title || !n.content) continue;
        this.state.nodes.push({
          id: `node_${slug}_${Math.random().toString(36).slice(2, 6)}`,
          subtopicId: newSub.id,
          title: n.title.trim(),
          content: n.content.trim(),
          kind: n.kind || MemoryNodeKind.FACT,
          confidence: 0.97,
          createdByAgentId: agent.id,
          authoredByModel: agent.activeModelLabel,
          updatedAt: now,
          tokenCount: estimateTokens(`${n.title}: ${n.content}`),
        });
      }
    }

    this.recalculateTokenCounts();
    const { totalActiveTokens } = this.getAgentActiveTokens(agent.id);

    const cypher = `MATCH (g:RootGraph {id: '${this.state.rootGraphId}'})\nCREATE (g)-[:HAS_SUBTOPIC]->(s:SubTopic {\n  id: '${newSub.id}',\n  name: ${JSON.stringify(newSub.name)},\n  domain: ${JSON.stringify(newSub.domain)},\n  summary: ${JSON.stringify(newSub.summary)},\n  version: 1,\n  lastUpdatedByModel: ${JSON.stringify(agent.activeModelLabel)}\n})\nRETURN s`;

    await this.runCypherOnFalkor(cypher);

    const step: PagingTraceStep = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      stepNumber: this.state.traceHistory.length + 1,
      timestamp: now,
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      phase: 'SUBTOPIC_SPLIT',
      subtopicId: newSub.id,
      subtopicName: newSub.name,
      summary: `Created new Sub-Topic partition [${newSub.name}] attached to RootGraph.`,
      detail: `Domain: ${newSub.domain} · Authored by ${agent.name} (${agent.activeModelLabel}) · Initial Summary: "${newSub.summary}"`,
      cypherQuery: cypher,
      activeTokensBefore: totalActiveTokens,
      activeTokensAfter: totalActiveTokens,
    };

    this.state.traceHistory.push(step);
    this.saveToDisk();

    return { subtopic: newSub, step };
  }

  public recordRunResult(run: AgentRunResult): void {
    for (const agentId of run.involvedAgentIds) {
      const ag = this.state.agents.find((a) => a.id === agentId);
      if (ag) {
        ag.status = ag.mountedSubtopicIds.length > 0 ? 'paged_in_reasoning' : 'idle';
        ag.totalTasksCompleted += 1;
        ag.currentTask = undefined;
      }
    }
    this.state.runHistory.unshift(run);
    if (this.state.runHistory.length > 25) {
      this.state.runHistory = this.state.runHistory.slice(0, 25);
    }
    this.saveToDisk();
  }

  public releaseAllLeases(): PagingTraceStep[] {
    const steps: PagingTraceStep[] = [];
    for (const agent of this.state.agents) {
      const mounted = [...agent.mountedSubtopicIds];
      for (const subId of mounted) {
        const sub = this.state.subtopics.find((s) => s.id === subId);
        if (sub) {
          const before = this.getAgentActiveTokens(agent.id).totalActiveTokens;
          agent.mountedSubtopicIds = agent.mountedSubtopicIds.filter((id) => id !== subId);
          sub.activeLeases = sub.activeLeases.filter((l) => l.agentId !== agent.id);
          agent.status = 'idle';
          const after = this.getAgentActiveTokens(agent.id).totalActiveTokens;
          const step: PagingTraceStep = {
            id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            stepNumber: this.state.traceHistory.length + 1,
            timestamp: new Date().toISOString(),
            agentId: agent.id,
            agentName: agent.name,
            activeModel: agent.activeModelLabel,
            phase: 'PAGE_OUT_RELEASE',
            subtopicId: sub.id,
            subtopicName: sub.name,
            summary: `Evicted [${sub.name}] from ${agent.name} (${agent.activeModelLabel}) back to FalkorDB.`,
            detail: 'Triggered context garbage collection sweep — agent now holds only the Sub-Topic Summary Index.',
            cypherQuery: `MATCH (a:Agent {id: '${agent.id}'})-[lease:HOLDING_CONTEXT]->(s:SubTopic {id: '${sub.id}'}) DELETE lease`,
            activeTokensBefore: before,
            activeTokensAfter: after,
          };
          this.state.traceHistory.push(step);
          steps.push(step);
        }
      }
    }
    this.saveToDisk();
    return steps;
  }

  public generateExportCypherScript(): string {
    const lines: string[] = [
      `// EngramGraph — FalkorDB Model-Agnostic Multi-Agent Memory Schema & Seed`,
      `// Generated at ${new Date().toISOString()}`,
      `MATCH (n) DETACH DELETE n;`,
      ``,
      `CREATE (root:RootGraph {id: ${JSON.stringify(this.state.rootGraphId)}, name: ${JSON.stringify(this.state.rootGraphName)}});`,
      ``,
    ];

    for (const sub of this.state.subtopics) {
      lines.push(
        `MATCH (root:RootGraph {id: ${JSON.stringify(this.state.rootGraphId)}})`,
        `CREATE (root)-[:HAS_SUBTOPIC]->(:SubTopic {id: ${JSON.stringify(sub.id)}, name: ${JSON.stringify(sub.name)}, domain: ${JSON.stringify(sub.domain)}, summary: ${JSON.stringify(sub.summary)}, version: ${sub.version}, lastUpdatedByModel: ${JSON.stringify(sub.lastUpdatedByModel || 'Claude 3.7 Sonnet')}, summaryTokenCount: ${sub.summaryTokenCount}, fullTokenCount: ${sub.fullTokenCount}});`
      );
    }
    lines.push('');

    for (const node of this.state.nodes) {
      lines.push(
        `MATCH (s:SubTopic {id: ${JSON.stringify(node.subtopicId)}})`,
        `CREATE (s)-[:CONTAINS_MEMORY]->(:MemoryNode {id: ${JSON.stringify(node.id)}, title: ${JSON.stringify(node.title)}, kind: ${JSON.stringify(node.kind)}, content: ${JSON.stringify(node.content)}, authoredByModel: ${JSON.stringify(node.authoredByModel || 'Claude 3.7 Sonnet')}, confidence: ${node.confidence}, tokenCount: ${node.tokenCount}});`
      );
    }
    lines.push('');

    for (const edge of this.state.edges) {
      lines.push(
        `MATCH (a:MemoryNode {id: ${JSON.stringify(edge.sourceId)}}), (b:MemoryNode {id: ${JSON.stringify(edge.targetId)}})`,
        `CREATE (a)-[:${edge.relation} {rationale: ${JSON.stringify(edge.rationale)}, createdBy: ${JSON.stringify(edge.createdByAgentId)}, authoredByModel: ${JSON.stringify(edge.authoredByModel || 'Claude 3.7 Sonnet')}}]->(b);`
      );
    }
    lines.push('');

    for (const p of this.state.savedPaths) {
      lines.push(
        `CREATE (:TraversalPath {id: ${JSON.stringify(p.id)}, title: ${JSON.stringify(p.title)}, subtopicIds: ${JSON.stringify(p.subtopicIds.join(','))}, nodeIds: ${JSON.stringify(p.nodeIds.join(' -> '))}, authoredByModel: ${JSON.stringify(p.authoredByModel)}});`
      );
    }

    return lines.join('\n');
  }

  /**
   * Register a custom model in the workspace (e.g. DeepSeek R1, Qwen 2.5 Coder, Ollama, vLLM, Claude, GPT)
   */
  public registerCustomModel(params: {
    id: string;
    label: string;
    provider: ModelProvider;
    endpointRoute?: string;
    contextBudgetTokens?: number;
  }): ModelDescriptor {
    const cleanId = params.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, '-');
    if (!cleanId) throw new Error('Model ID is required');

    const existingIdx = this.state.availableModels.findIndex((m) => m.id === cleanId);
    const model: ModelDescriptor = {
      id: cleanId,
      label: params.label.trim() || cleanId,
      provider: params.provider,
      endpointRoute: params.endpointRoute?.trim() || `custom://${cleanId}`,
      contextBudgetTokens: Number(params.contextBudgetTokens) || 8192,
      isCustom: true,
    };

    if (existingIdx >= 0) {
      this.state.availableModels[existingIdx] = model;
    } else {
      this.state.availableModels.push(model);
    }

    this.saveToDisk();
    return model;
  }

  /**
   * Create a custom corporate agent with its own role, specialty, and assigned model
   */
  public createCustomAgent(params: {
    name: string;
    role: string;
    specialty: string;
    modelId: string;
    accentColor?: string;
  }): AgentProfile {
    const slug = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 14);
    const id = `agent_${slug}_${Date.now().toString(36).slice(-3)}`;
    const model =
      this.state.availableModels.find((m) => m.id === params.modelId) ||
      this.state.availableModels[0] ||
      SUPPORTED_AGENT_MODELS[0];

    const palette = ['#10B981', '#38BDF8', '#F59E0B', '#A855F7', '#F43F5E', '#14B8A6'];
    const agent: AgentProfile = {
      id,
      name: params.name.trim(),
      role: params.role.trim() || 'Domain Specialist',
      specialty:
        params.specialty.trim() ||
        'Reads sub-topic summaries, checks out relevant partitions, and commits structured updates.',
      accentColor: params.accentColor || palette[this.state.agents.length % palette.length],
      activeModelId: model.id,
      activeModelLabel: model.label,
      activeProvider: model.provider,
      modelSwitchCount: 0,
      status: 'idle',
      mountedSubtopicIds: [],
      activePathIds: [],
      totalTasksCompleted: 0,
      totalCommits: 0,
      lastActiveAt: new Date().toISOString(),
      isCustom: true,
    };

    this.state.agents.push(agent);
    this.saveToDisk();
    return agent;
  }

  public deleteAgent(agentId: string): void {
    if (this.state.agents.length <= 1) {
      throw new Error('Workspace must retain at least 1 active agent.');
    }
    this.state.agents = this.state.agents.filter((a) => a.id !== agentId);
    for (const sub of this.state.subtopics) {
      sub.activeLeases = sub.activeLeases.filter((l) => l.agentId !== agentId);
    }
    this.saveToDisk();
  }

  /**
   * Save or update a custom multi-agent workflow pipeline
   */
  public saveWorkflow(params: {
    id?: string;
    name: string;
    description: string;
    stages: Array<{
      agentId: string;
      modelOverrideId?: string;
      instruction: string;
      autoReleaseAfterStage?: boolean;
    }>;
  }): CustomWorkflow {
    if (!params.name.trim() || !Array.isArray(params.stages) || params.stages.length === 0) {
      throw new Error('Workflow requires a name and at least 1 stage.');
    }
    const wfId = params.id || `wf_${Date.now().toString(36)}`;
    const wf: CustomWorkflow = {
      id: wfId,
      name: params.name.trim(),
      description: params.description.trim() || 'Multi-step agent graph pipeline',
      createdAt: new Date().toISOString(),
      stages: params.stages.map((s, idx) => ({
        id: `stage_${idx + 1}_${Date.now().toString(36).slice(-2)}`,
        agentId: s.agentId,
        modelOverrideId: s.modelOverrideId || undefined,
        instruction: s.instruction.trim(),
        autoReleaseAfterStage: s.autoReleaseAfterStage !== false,
      })),
    };

    const existingIdx = this.state.workflows.findIndex((w) => w.id === wfId);
    if (existingIdx >= 0) {
      this.state.workflows[existingIdx] = wf;
    } else {
      this.state.workflows.unshift(wf);
    }
    this.saveToDisk();
    return wf;
  }

  public deleteWorkflow(workflowId: string): void {
    this.state.workflows = this.state.workflows.filter((w) => w.id !== workflowId);
    this.saveToDisk();
  }

  /**
   * Batch ingest partitioned sub-topics, memory nodes, and cross-topic edges from raw corporate documents
   */
  public async ingestPartitionedKnowledge(params: {
    agentId?: string;
    documentTitle: string;
    subtopics: Array<{
      name: string;
      domain: string;
      summary: string;
      nodes: Array<{
        title: string;
        content: string;
        kind: MemoryNodeKind;
      }>;
    }>;
  }): Promise<{
    createdSubtopics: SubTopic[];
    createdNodesCount: number;
    createdPath?: SavedGraphPath;
  }> {
    const agent =
      this.state.agents.find((a) => a.id === params.agentId) || this.state.agents[0];
    const createdSubtopics: SubTopic[] = [];
    const createdNodeIds: string[] = [];
    let createdNodesCount = 0;

    for (const st of params.subtopics) {
      const res = await this.createSubtopic({
        name: st.name,
        domain: st.domain,
        summary: st.summary,
        createdByAgentId: agent.id,
        initialNodes: st.nodes,
      });
      createdSubtopics.push(res.subtopic);
      const subNodes = this.state.nodes.filter((n) => n.subtopicId === res.subtopic.id);
      createdNodesCount += subNodes.length;
      if (subNodes[0]) {
        createdNodeIds.push(subNodes[0].id);
      }
    }

    // Link sequential ingested subtopics with cross-topic RELATES_TO / DEPENDS_ON edges and create a SavedGraphPath
    for (let i = 0; i < createdNodeIds.length - 1; i++) {
      this.state.edges.push({
        id: `edge_ingest_${Date.now()}_${i}`,
        sourceId: createdNodeIds[i],
        targetId: createdNodeIds[i + 1],
        relation: EdgeRelationType.RELATES_TO,
        rationale: `Cross-domain link extracted from "${params.documentTitle}"`,
        createdByAgentId: agent.id,
        authoredByModel: agent.activeModelLabel,
        createdAt: new Date().toISOString(),
      });
    }

    let createdPath: SavedGraphPath | undefined;
    if (createdNodeIds.length >= 2) {
      createdPath = await this.saveGraphPath({
        title: `${params.documentTitle} Knowledge Chain`,
        description: `Auto-extracted cross-topic path across ${createdSubtopics.length} sub-topics from "${params.documentTitle}".`,
        nodeIds: createdNodeIds,
        agentId: agent.id,
      });
    }

    this.recalculateTokenCounts();
    this.saveToDisk();
    return { createdSubtopics, createdNodesCount, createdPath };
  }

  /**
   * Registers or updates a live IDE / CLI session (Claude Code, OpenAI Codex, Cursor, VS Code, Windsurf)
   */
  public registerOrTouchIdeSession(params: {
    clientType: IdeClientType;
    agentId?: string;
    repoBranch?: string;
    toolCalled?: string;
  }): IdeClientSession {
    if (!Array.isArray(this.state.connectedIdeSessions)) {
      this.state.connectedIdeSessions = [];
    }
    const agent =
      this.state.agents.find((a) => a.id === params.agentId) || this.state.agents[0];
    const now = new Date().toISOString();

    let session = this.state.connectedIdeSessions.find(
      (s) => s.clientType === params.clientType && s.boundAgentId === agent.id
    );

    if (!session) {
      session = {
        id: `ide_${Date.now().toString(36)}`,
        clientType: params.clientType,
        workspaceName: this.state.rootGraphName,
        repoBranch: params.repoBranch || 'main',
        boundAgentId: agent.id,
        boundAgentName: agent.name,
        activeModel: agent.activeModelLabel,
        lastToolCalled: params.toolCalled || 'engram_get_index',
        status: agent.mountedSubtopicIds.length > 0 ? 'active_paging' : 'connected',
        connectedAt: now,
        lastHeartbeatAt: now,
        totalCalls: 1,
      };
      this.state.connectedIdeSessions.unshift(session);
    } else {
      session.workspaceName = this.state.rootGraphName;
      session.boundAgentName = agent.name;
      session.activeModel = agent.activeModelLabel;
      if (params.repoBranch) session.repoBranch = params.repoBranch;
      if (params.toolCalled) session.lastToolCalled = params.toolCalled;
      session.status = agent.mountedSubtopicIds.length > 0 ? 'active_paging' : 'connected';
      session.lastHeartbeatAt = now;
      session.totalCalls += 1;
    }

    this.saveToDisk();
    return session;
  }

  /**
   * Handles Model Context Protocol (MCP) JSON-RPC 2.0 requests from Claude Code, OpenAI Codex, Cursor, VS Code, or Windsurf.
   */
  public async handleMcpJsonRpc(
    rpcBody: {
      jsonrpc?: string;
      id?: string | number | null;
      method: string;
      params?: Record<string, any>;
    },
    clientType: IdeClientType = 'Claude Code CLI'
  ): Promise<Record<string, any>> {
    const rpcId = rpcBody.id ?? 1;
    const method = rpcBody.method || 'tools/list';
    const params = rpcBody.params || {};
    const defaultAgent = this.state.agents[0];

    if (method === 'initialize') {
      this.registerOrTouchIdeSession({
        clientType,
        agentId: defaultAgent?.id,
        toolCalled: 'mcp.initialize',
      });
      return {
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'engramgraph-falkordb-mcp',
            version: '2.4.0',
          },
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
          },
        },
      };
    }

    if (method === 'tools/list') {
      this.registerOrTouchIdeSession({
        clientType,
        agentId: defaultAgent?.id,
        toolCalled: 'tools/list',
      });
      return {
        jsonrpc: '2.0',
        id: rpcId,
        result: {
          tools: [
            {
              name: 'engram_get_index',
              description:
                'Returns the RootGraph Sub-Topic Summary Directory and Shared Multi-Hop Graph Paths without bloating the IDE context window.',
              inputSchema: {
                type: 'object',
                properties: {
                  agentId: {
                    type: 'string',
                    description: `Agent ID (e.g. ${this.state.agents.map((a) => a.id).join(', ')})`,
                  },
                },
              },
            },
            {
              name: 'engram_checkout_subtopic',
              description:
                'Pages in (mounts) the full MemoryNodes and semantic edges inside a specific Sub-Topic when your IDE task requires detailed context.',
              inputSchema: {
                type: 'object',
                properties: {
                  agentId: { type: 'string' },
                  subtopicId: {
                    type: 'string',
                    description: `Sub-Topic ID (e.g. ${this.state.subtopics.map((s) => s.id).join(', ')})`,
                  },
                  reason: { type: 'string' },
                },
                required: ['subtopicId'],
              },
            },
            {
              name: 'engram_commit_memory',
              description:
                'Commits new MemoryNodes (Fact, Decision, Procedure, Constraint), semantic edges, and an updated executive summary back into a Sub-Topic.',
              inputSchema: {
                type: 'object',
                properties: {
                  agentId: { type: 'string' },
                  subtopicId: { type: 'string' },
                  title: { type: 'string' },
                  content: { type: 'string' },
                  kind: {
                    type: 'string',
                    enum: ['Fact', 'Decision', 'Episode', 'Procedure', 'Constraint'],
                  },
                  connectToNodeId: { type: 'string' },
                  updatedSummary: { type: 'string' },
                  commitMessage: { type: 'string' },
                },
                required: ['subtopicId', 'title', 'content'],
              },
            },
            {
              name: 'engram_release_subtopic',
              description:
                'Evicts (sends back) a mounted Sub-Topic from active IDE working memory back into FalkorDB once finished.',
              inputSchema: {
                type: 'object',
                properties: {
                  agentId: { type: 'string' },
                  subtopicId: { type: 'string' },
                  reason: { type: 'string' },
                },
                required: ['subtopicId'],
              },
            },
            {
              name: 'engram_switch_model',
              description:
                'Hot-swaps the active model assigned to an agent (e.g. Claude Code <-> OpenAI Codex <-> Gemini) while preserving all graph leases and paths.',
              inputSchema: {
                type: 'object',
                properties: {
                  agentId: { type: 'string' },
                  modelId: { type: 'string' },
                },
                required: ['modelId'],
              },
            },
          ],
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = String(params.name || '');
      const args = (params.arguments || {}) as Record<string, any>;
      const agentId = String(args.agentId || defaultAgent?.id || 'agent_atlas');

      this.registerOrTouchIdeSession({
        clientType,
        agentId,
        toolCalled: toolName,
      });

      if (toolName === 'engram_get_index') {
        this.recordIndexScan(
          agentId,
          `[${clientType}] Queried Sub-Topic Summary Directory & Shared Paths via MCP`
        );
        const view = this.getAgentScopedGraphView(agentId);
        return {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    workspace: this.state.rootGraphName,
                    activeTokens: view.tokenStats.totalActiveTokens,
                    subtopicSummaries: view.subtopicDirectory,
                    sharedPaths: view.savedPaths,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'engram_checkout_subtopic') {
        const subId = String(args.subtopicId || this.state.subtopics[0]?.id);
        const reason = String(args.reason || `Checked out from ${clientType} via MCP`);
        const res = await this.checkoutSubtopic(agentId, subId, reason);
        return {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'PAGED_IN_MOUNTED',
                    subtopic: res.subtopic.name,
                    version: res.subtopic.version,
                    nodes: res.nodes,
                    edges: res.edges,
                    crossTopicHints: res.crossTopicHints.map((h) => ({
                      relation: h.edge.relation,
                      targetSubtopic: h.externalSubtopic.name,
                      targetNode: h.externalNode.title,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'engram_commit_memory') {
        const subId = String(args.subtopicId || this.state.subtopics[0]?.id);
        const sub = this.state.subtopics.find((s) => s.id === subId) || this.state.subtopics[0];
        const title = String(args.title || `${clientType} Codebase Update`);
        const content = String(args.content || 'Updated architectural constraint from IDE session.');
        const kind = (args.kind as MemoryNodeKind) || MemoryNodeKind.DECISION;
        const updatedSummary = String(
          args.updatedSummary ||
            `${sub.summary.split('.')[0]}. Updated via ${clientType} with "${title}".`
        );
        const commitMessage = String(
          args.commitMessage || `[${clientType}] Committed "${title}"`
        );

        const res = await this.mutateSubtopicGraph({
          agentId,
          subtopicId: sub.id,
          newNodes: [
            {
              title,
              content,
              kind,
              connectToNodeId: args.connectToNodeId
                ? String(args.connectToNodeId)
                : this.state.nodes.find((n) => n.subtopicId === sub.id)?.id,
              relationType: EdgeRelationType.DEPENDS_ON,
              edgeRationale: `Committed from ${clientType} IDE workspace`,
            },
          ],
          updatedSummary,
          commitMessage,
        });

        return {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'GRAPH_COMMITTED',
                    subtopic: res.subtopic.name,
                    newVersion: res.subtopic.version,
                    createdNodes: res.createdNodes,
                    updatedSummary: res.subtopic.summary,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'engram_release_subtopic') {
        const subId = String(args.subtopicId || this.state.subtopics[0]?.id);
        const reason = String(
          args.reason || `Released from ${clientType} back to FalkorDB`
        );
        const res = await this.releaseSubtopic(agentId, subId, reason);
        return {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'RELEASED_TO_FALKORDB',
                    subtopicId: res.subtopic.id,
                    activeTokensAfter: res.step.activeTokensAfter,
                  },
                  null,
                  2
                ),
              },
            ],
          },
        };
      }

      if (toolName === 'engram_switch_model') {
        const modelId = String(args.modelId || 'gpt-4o');
        const res = await this.switchAgentModel(agentId, modelId);
        return {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          },
        };
      }

      throw new Error(`Unknown MCP tool: ${toolName}`);
    }

    return {
      jsonrpc: '2.0',
      id: rpcId,
      result: { status: 'ok', workspace: this.state.rootGraphId },
    };
  }

  /**
   * Generates a standalone, zero-dependency Node.js MCP Stdio Bridge script (`engram-mcp-bridge.mjs`)
   * so local CLI tools (`claude mcp add`, `codex`, Cursor, Windsurf, VS Code) can pipe stdio JSON-RPC
   * directly to this live EngramGraph workspace.
   */
  public generateStandaloneMcpBridgeScript(originUrl: string, defaultAgentId?: string): string {
    const agentId = defaultAgentId || this.state.agents[0]?.id || 'agent_atlas';
    return `#!/usr/bin/env node
/**
 * EngramGraph — Zero-Dependency MCP Stdio Bridge for Claude Code, OpenAI Codex CLI, Cursor & VS Code
 * Workspace: ${this.state.rootGraphName} (${this.state.rootGraphId})
 * Default Bound Agent: ${agentId}
 *
 * Usage with Claude Code:
 *   claude mcp add engram-memory -- node ./engram-mcp-bridge.mjs
 *
 * Usage with OpenAI Codex CLI / Cursor / VS Code:
 *   Add to .cursor/mcp.json or ~/.codex/config.json
 */

import readline from 'readline';

const ENGRAM_ENDPOINT = process.env.ENGRAM_URL || ${JSON.stringify(originUrl)};
const CLIENT_NAME = process.env.ENGRAM_CLIENT || "Claude Code CLI";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const request = JSON.parse(trimmed);
    const res = await fetch(\`\${ENGRAM_ENDPOINT}/api/mcp\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Engram-Client': CLIENT_NAME,
      },
      body: JSON.stringify(request),
    });
    const data = await res.json();
    process.stdout.write(JSON.stringify(data) + '\\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: err.message || 'MCP Bridge error' },
      }) + '\\n'
    );
  }
});
`;
  }
}
