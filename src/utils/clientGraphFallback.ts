import {
  AgentProfile,
  AgentRunResult,
  CustomWorkflow,
  EdgeRelationType,
  GraphMemoryState,
  IdeClientType,
  MemoryEdge,
  MemoryNode,
  MemoryNodeKind,
  ModelDescriptor,
  ModelProvider,
  PagingTraceStep,
  SavedGraphPath,
  SubTopic,
  SUPPORTED_AGENT_MODELS,
} from '../types/memory.ts';
import {
  createBlankWorkspaceState,
  DEFAULT_WORKFLOWS,
  estimateTokens,
  INITIAL_GRAPH_STATE,
} from '../../server/initialGraphData.ts';

const STORAGE_KEY = 'engram_browser_graph_state_v1';

function recalculateTokens(state: GraphMemoryState): GraphMemoryState {
  for (const sub of state.subtopics) {
    sub.summaryTokenCount = estimateTokens(`${sub.name} (${sub.domain}): ${sub.summary}`);
    const subNodes = state.nodes.filter((n) => n.subtopicId === sub.id);
    let nodesTokens = 0;
    for (const node of subNodes) {
      node.tokenCount = estimateTokens(`${node.title} [${node.kind}]: ${node.content}`);
      nodesTokens += node.tokenCount;
    }
    sub.fullTokenCount = sub.summaryTokenCount + nodesTokens;
  }
  if (!Array.isArray(state.workspaces) || state.workspaces.length === 0) {
    state.workspaces = [
      {
        id: state.rootGraphId,
        name: state.rootGraphName,
        description: state.rootGraphDescription,
        subtopicCount: state.subtopics.length,
        nodeCount: state.nodes.length,
        updatedAt: new Date().toISOString(),
      },
    ];
  } else {
    const idx = state.workspaces.findIndex((w) => w.id === state.rootGraphId);
    const meta = {
      id: state.rootGraphId,
      name: state.rootGraphName,
      description: state.rootGraphDescription,
      subtopicCount: state.subtopics.length,
      nodeCount: state.nodes.length,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) state.workspaces[idx] = meta;
    else state.workspaces.push(meta);
  }
  return state;
}

function calcActiveTokens(state: GraphMemoryState, agentId: string): number {
  const summaryTokens = state.subtopics.reduce((acc, s) => acc + s.summaryTokenCount, 0);
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return summaryTokens;
  let mountedTokens = 0;
  for (const subId of agent.mountedSubtopicIds) {
    const sub = state.subtopics.find((s) => s.id === subId);
    if (sub) mountedTokens += Math.max(0, sub.fullTokenCount - sub.summaryTokenCount);
  }
  return summaryTokens + mountedTokens;
}

export function loadBrowserFallbackState(): GraphMemoryState {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as GraphMemoryState;
        if (parsed && Array.isArray(parsed.subtopics) && Array.isArray(parsed.agents)) {
          if (!Array.isArray(parsed.availableModels) || parsed.availableModels.length === 0) {
            parsed.availableModels = structuredClone(SUPPORTED_AGENT_MODELS);
          }
          if (!Array.isArray(parsed.workflows)) {
            parsed.workflows = structuredClone(DEFAULT_WORKFLOWS);
          }
          if (!Array.isArray(parsed.ideSessions)) {
            parsed.ideSessions = [];
          }
          return recalculateTokens(parsed);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  const fresh = recalculateTokens(structuredClone(INITIAL_GRAPH_STATE));
  saveBrowserFallbackState(fresh);
  return fresh;
}

export function saveBrowserFallbackState(state: GraphMemoryState): GraphMemoryState {
  const updated = recalculateTokens(state);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore quota errors
  }
  return structuredClone(updated);
}

export function resetBrowserFallbackState(): GraphMemoryState {
  const fresh = recalculateTokens(structuredClone(INITIAL_GRAPH_STATE));
  return saveBrowserFallbackState(fresh);
}

export function browserCheckoutSubtopic(
  agentId: string,
  subtopicId: string,
  reason: string
): { subtopic: SubTopic; step: PagingTraceStep; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const agent = state.agents.find((a) => a.id === agentId) || state.agents[0];
  const subtopic = state.subtopics.find((s) => s.id === subtopicId) || state.subtopics[0];
  const before = calcActiveTokens(state, agent.id);
  const now = new Date().toISOString();

  if (!agent.mountedSubtopicIds.includes(subtopic.id)) {
    agent.mountedSubtopicIds.push(subtopic.id);
  }
  if (!subtopic.activeLeases.some((l) => l.agentId === agent.id)) {
    subtopic.activeLeases.push({
      agentId: agent.id,
      agentName: agent.name,
      activeModel: agent.activeModelLabel,
      checkedOutAt: now,
      reason,
    });
  }
  agent.status = 'reasoning';
  agent.lastActiveAt = now;

  const after = calcActiveTokens(state, agent.id);
  const step: PagingTraceStep = {
    id: `trace_${Date.now()}`,
    stepNumber: state.traceHistory.length + 1,
    timestamp: now,
    agentId: agent.id,
    agentName: agent.name,
    activeModel: agent.activeModelLabel,
    phase: 'PAGE_IN_CHECKOUT',
    subtopicId: subtopic.id,
    subtopicName: subtopic.name,
    summary: `${agent.name} (${agent.activeModelLabel}) paged in [${subtopic.name}] (+${Math.max(0, after - before)} tokens).`,
    detail: reason,
    cypherQuery: `MATCH (s:SubTopic {id: '${subtopic.id}'})<-[:BELONGS_TO_SUBTOPIC]-(n:MemoryNode) RETURN s, collect(n)`,
    activeTokensBefore: before,
    activeTokensAfter: after,
  };
  state.traceHistory.unshift(step);
  return { subtopic, step, state: saveBrowserFallbackState(state) };
}

export function browserReleaseSubtopic(
  agentId: string,
  subtopicId: string,
  reason: string
): { subtopic: SubTopic; step: PagingTraceStep; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const agent = state.agents.find((a) => a.id === agentId) || state.agents[0];
  const subtopic = state.subtopics.find((s) => s.id === subtopicId) || state.subtopics[0];
  const before = calcActiveTokens(state, agent.id);
  const now = new Date().toISOString();

  agent.mountedSubtopicIds = agent.mountedSubtopicIds.filter((id) => id !== subtopic.id);
  subtopic.activeLeases = subtopic.activeLeases.filter((l) => l.agentId !== agent.id);
  if (agent.mountedSubtopicIds.length === 0) agent.status = 'idle';
  agent.lastActiveAt = now;

  const after = calcActiveTokens(state, agent.id);
  const step: PagingTraceStep = {
    id: `trace_${Date.now()}`,
    stepNumber: state.traceHistory.length + 1,
    timestamp: now,
    agentId: agent.id,
    agentName: agent.name,
    activeModel: agent.activeModelLabel,
    phase: 'PAGE_OUT_RELEASE',
    subtopicId: subtopic.id,
    subtopicName: subtopic.name,
    summary: `${agent.name} evicted [${subtopic.name}] back to graph (-${Math.max(0, before - after)} tokens).`,
    detail: reason,
    cypherQuery: `MATCH (a:Agent {id: '${agent.id}'})-[r:CHECKED_OUT]->(s:SubTopic {id: '${subtopic.id}'}) DELETE r`,
    activeTokensBefore: before,
    activeTokensAfter: after,
  };
  state.traceHistory.unshift(step);
  return { subtopic, step, state: saveBrowserFallbackState(state) };
}

export function browserReleaseAllLeases(): GraphMemoryState {
  const state = loadBrowserFallbackState();
  for (const agent of state.agents) {
    agent.mountedSubtopicIds = [];
    agent.status = 'idle';
  }
  for (const sub of state.subtopics) {
    sub.activeLeases = [];
  }
  return saveBrowserFallbackState(state);
}

export function browserSwitchAgentModel(
  agentId: string,
  modelId: string
): { newModel: string; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const agent = state.agents.find((a) => a.id === agentId) || state.agents[0];
  const model =
    state.availableModels.find((m) => m.id === modelId) ||
    SUPPORTED_AGENT_MODELS.find((m) => m.id === modelId) ||
    SUPPORTED_AGENT_MODELS[0];
  const before = calcActiveTokens(state, agent.id);
  const prevLabel = agent.activeModelLabel;

  agent.activeModelId = model.id;
  agent.activeModelLabel = model.label;
  agent.activeProvider = model.provider;
  agent.modelSwitchCount = (agent.modelSwitchCount || 0) + 1;
  agent.lastActiveAt = new Date().toISOString();

  for (const sub of state.subtopics) {
    for (const lease of sub.activeLeases) {
      if (lease.agentId === agent.id) lease.activeModel = model.label;
    }
  }

  state.traceHistory.unshift({
    id: `trace_switch_${Date.now()}`,
    stepNumber: state.traceHistory.length + 1,
    timestamp: agent.lastActiveAt,
    agentId: agent.id,
    agentName: agent.name,
    activeModel: model.label,
    phase: 'MODEL_SWITCH',
    summary: `Hot-swapped ${agent.name} from ${prevLabel} → ${model.label} with 0 token re-ingestion.`,
    detail: `Graph state remains externalized in FalkorDB; ${agent.mountedSubtopicIds.length} active lease(s) preserved.`,
    cypherQuery: `MATCH (a:Agent {id: '${agent.id}'}) SET a.activeModelId = '${model.id}', a.activeModelLabel = '${model.label}'`,
    activeTokensBefore: before,
    activeTokensAfter: before,
  });

  return { newModel: model.label, state: saveBrowserFallbackState(state) };
}

export function browserCreateSubtopic(payload: {
  name: string;
  domain: string;
  summary: string;
  createdByAgentId: string;
  initialNodes: Array<{ title: string; content: string; kind: MemoryNodeKind }>;
}): { subtopic: SubTopic; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const agent = state.agents.find((a) => a.id === payload.createdByAgentId) || state.agents[0];
  const now = new Date().toISOString();
  const id = `sub_${ payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18)}_${Date.now().toString().slice(-3)}`;

  const subtopic: SubTopic = {
    id,
    name: payload.name,
    domain: payload.domain || 'Custom Domain',
    color: '#10B981',
    summary: payload.summary,
    version: 1,
    updatedAt: now,
    lastUpdatedBy: agent.id,
    lastUpdatedByModel: agent.activeModelLabel,
    summaryTokenCount: estimateTokens(payload.summary),
    fullTokenCount: estimateTokens(payload.summary),
    activeLeases: [],
    revisionHistory: [
      {
        version: 1,
        summary: payload.summary,
        updatedByAgentId: agent.id,
        authoredByModel: agent.activeModelLabel,
        updatedAt: now,
        commitNote: 'Created sub-topic partition',
      },
    ],
  };
  state.subtopics.push(subtopic);

  for (const n of payload.initialNodes || []) {
    if (!n.title.trim()) continue;
    const node: MemoryNode = {
      id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subtopicId: id,
      title: n.title,
      content: n.content,
      kind: n.kind || MemoryNodeKind.FACT,
      confidence: 0.96,
      createdByAgentId: agent.id,
      authoredByModel: agent.activeModelLabel,
      updatedAt: now,
      tokenCount: estimateTokens(`${n.title}: ${n.content}`),
    };
    state.nodes.push(node);
  }

  return { subtopic, state: saveBrowserFallbackState(state) };
}

export function browserMutateSubtopic(payload: {
  agentId: string;
  subtopicId: string;
  newNodes: Array<{
    title: string;
    content: string;
    kind: MemoryNodeKind;
    connectToNodeId?: string;
    relationType?: EdgeRelationType;
    edgeRationale?: string;
  }>;
  updatedSummary: string;
  commitMessage: string;
}): { subtopic: SubTopic; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const agent = state.agents.find((a) => a.id === payload.agentId) || state.agents[0];
  const subtopic = state.subtopics.find((s) => s.id === payload.subtopicId) || state.subtopics[0];
  const now = new Date().toISOString();

  for (const n of payload.newNodes || []) {
    if (!n.title.trim()) continue;
    const nodeId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    state.nodes.push({
      id: nodeId,
      subtopicId: subtopic.id,
      title: n.title,
      content: n.content,
      kind: n.kind || MemoryNodeKind.FACT,
      confidence: 0.97,
      createdByAgentId: agent.id,
      authoredByModel: agent.activeModelLabel,
      updatedAt: now,
      tokenCount: estimateTokens(`${n.title}: ${n.content}`),
    });
    if (n.connectToNodeId) {
      state.edges.push({
        id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        source: nodeId,
        target: n.connectToNodeId,
        relationType: n.relationType || EdgeRelationType.RELATES_TO,
        weight: 0.94,
        rationale: n.edgeRationale || payload.commitMessage,
      });
    }
  }

  if (payload.updatedSummary && payload.updatedSummary.trim()) {
    subtopic.summary = payload.updatedSummary.trim();
  }
  subtopic.version += 1;
  subtopic.updatedAt = now;
  subtopic.lastUpdatedBy = agent.id;
  subtopic.lastUpdatedByModel = agent.activeModelLabel;
  subtopic.revisionHistory.unshift({
    version: subtopic.version,
    summary: subtopic.summary,
    updatedByAgentId: agent.id,
    authoredByModel: agent.activeModelLabel,
    updatedAt: now,
    commitNote: payload.commitMessage || 'Updated sub-topic memory',
  });
  agent.totalCommits += 1;

  return { subtopic, state: saveBrowserFallbackState(state) };
}

export function browserRunAgentTask(payload: {
  taskPrompt: string;
  agentIds: string[];
  autoEvictOnFinish?: boolean;
  simulateMidRunModelSwitch?: { targetModelId: string };
}): { run: AgentRunResult; state: GraphMemoryState } {
  let state = loadBrowserFallbackState();
  const primaryAgent =
    state.agents.find((a) => payload.agentIds.includes(a.id)) || state.agents[0];
  const targetSub = state.subtopics[0];
  const steps: PagingTraceStep[] = [];

  const checkoutRes = browserCheckoutSubtopic(
    primaryAgent.id,
    targetSub.id,
    `Selected [${targetSub.name}] from summary index for task: "${payload.taskPrompt.slice(0, 80)}"`
  );
  steps.push(checkoutRes.step);
  state = checkoutRes.state;

  const modelsUsed = [primaryAgent.activeModelLabel];
  if (payload.simulateMidRunModelSwitch?.targetModelId) {
    const sw = browserSwitchAgentModel(
      primaryAgent.id,
      payload.simulateMidRunModelSwitch.targetModelId
    );
    state = sw.state;
    modelsUsed.push(sw.newModel);
  }

  const mut = browserMutateSubtopic({
    agentId: primaryAgent.id,
    subtopicId: targetSub.id,
    newNodes: [
      {
        title: `Verified Synthesis: ${payload.taskPrompt.slice(0, 46)}`,
        content: `Synthesized resolution across [${targetSub.name}] using ${modelsUsed.join(' → ')} while keeping non-relevant sub-topics unmounted.`,
        kind: MemoryNodeKind.DECISION,
        connectToNodeId: state.nodes.find((n) => n.subtopicId === targetSub.id)?.id,
        relationType: EdgeRelationType.GOVERNED_BY,
      },
    ],
    updatedSummary: targetSub.summary,
    commitMessage: `Autonomous graph commit (${modelsUsed.join(' → ')})`,
  });
  state = mut.state;

  if (payload.autoEvictOnFinish !== false) {
    const rel = browserReleaseSubtopic(
      primaryAgent.id,
      targetSub.id,
      'Auto-evicted sub-topic back to FalkorDB after task completion'
    );
    steps.push(rel.step);
    state = rel.state;
  }

  const fullCorpusTokens = state.subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);
  const peakActiveTokens = Math.min(
    fullCorpusTokens,
    state.subtopics.reduce((acc, s) => acc + s.summaryTokenCount, 0) + targetSub.fullTokenCount
  );

  const run: AgentRunResult = {
    runId: `run_${Date.now()}`,
    taskPrompt: payload.taskPrompt,
    involvedAgents: payload.agentIds,
    modelsUsed,
    finalSynthesis: `Completed selective sub-topic paging across [${targetSub.name}] with ${modelsUsed.join(' → ')}. Peak active context stayed at ${peakActiveTokens} tokens vs ${fullCorpusTokens} full-graph tokens.`,
    steps,
    peakActiveTokens,
    fullGraphTokens: fullCorpusTokens,
    tokenSavingsPercent:
      fullCorpusTokens > 0
        ? Math.round(((fullCorpusTokens - peakActiveTokens) / fullCorpusTokens) * 100)
        : 65,
    completedAt: new Date().toISOString(),
  };
  state.runHistory.unshift(run);
  return { run, state: saveBrowserFallbackState(state) };
}

export function browserSwitchWorkspace(workspaceId: string): GraphMemoryState {
  const state = loadBrowserFallbackState();
  if (workspaceId === 'engram_main_context') {
    return resetBrowserFallbackState();
  }
  return state;
}

export function browserCreateWorkspace(payload: {
  name: string;
  description: string;
  template: 'blank' | 'enterprise_sample';
}): GraphMemoryState {
  if (payload.template === 'enterprise_sample') {
    const sample = structuredClone(INITIAL_GRAPH_STATE);
    sample.rootGraphId = `ws_${Date.now()}`;
    sample.rootGraphName = payload.name;
    sample.rootGraphDescription = payload.description || sample.rootGraphDescription;
    return saveBrowserFallbackState(sample);
  }
  const blank = createBlankWorkspaceState({
    id: `ws_${Date.now()}`,
    name: payload.name,
    description: payload.description,
  });
  return saveBrowserFallbackState(blank);
}

export function browserIngestDocument(payload: {
  documentTitle: string;
  rawText: string;
  agentId: string;
}): {
  createdSubtopics: SubTopic[];
  createdPath: SavedGraphPath | null;
  state: GraphMemoryState;
} {
  const paragraphs = payload.rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sub = browserCreateSubtopic({
    name: payload.documentTitle.slice(0, 42),
    domain: 'Ingested Knowledge',
    summary: (paragraphs[0] || payload.rawText).slice(0, 220),
    createdByAgentId: payload.agentId,
    initialNodes: paragraphs.slice(0, 4).map((p, idx) => ({
      title: `${payload.documentTitle} — Section ${idx + 1}`,
      content: p.slice(0, 360),
      kind: idx === 0 ? MemoryNodeKind.FACT : MemoryNodeKind.PROCEDURE,
    })),
  });
  return {
    createdSubtopics: [sub.subtopic],
    createdPath: null,
    state: sub.state,
  };
}

export function browserRegisterCustomModel(payload: {
  id: string;
  label: string;
  provider: ModelProvider;
  endpointRoute?: string;
  contextBudgetTokens: number;
}): { model: ModelDescriptor; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const model: ModelDescriptor = {
    id: payload.id,
    label: payload.label,
    provider: payload.provider,
    badgeColor: '#10B981',
    strengths: 'Custom registered model endpoint',
    isCustom: true,
    endpointRoute: payload.endpointRoute,
    contextBudgetTokens: payload.contextBudgetTokens,
  };
  state.availableModels.push(model);
  return { model, state: saveBrowserFallbackState(state) };
}

export function browserCreateCustomAgent(payload: {
  name: string;
  role: string;
  specialty: string;
  modelId: string;
}): { agent: AgentProfile; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const model =
    state.availableModels.find((m) => m.id === payload.modelId) || SUPPORTED_AGENT_MODELS[0];
  const agent: AgentProfile = {
    id: `agent_${Date.now()}`,
    name: payload.name,
    role: payload.role,
    specialty: payload.specialty || 'Domain reasoning & graph updates',
    accentColor: '#10B981',
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
  };
  state.agents.push(agent);
  return { agent, state: saveBrowserFallbackState(state) };
}

export function browserDeleteAgent(agentId: string): GraphMemoryState {
  const state = loadBrowserFallbackState();
  if (state.agents.length > 1) {
    state.agents = state.agents.filter((a) => a.id !== agentId);
  }
  return saveBrowserFallbackState(state);
}

export function browserSaveWorkflow(payload: {
  name: string;
  description: string;
  stages: Array<{
    agentId: string;
    modelOverrideId: string;
    instruction: string;
    autoReleaseAfterStage: boolean;
  }>;
}): { workflow: CustomWorkflow; state: GraphMemoryState } {
  const state = loadBrowserFallbackState();
  const workflow: CustomWorkflow = {
    id: `wf_${Date.now()}`,
    name: payload.name,
    description: payload.description,
    createdAt: new Date().toISOString(),
    stages: payload.stages.map((s, idx) => ({
      id: `stage_${idx + 1}`,
      ...s,
    })),
  };
  state.workflows.unshift(workflow);
  return { workflow, state: saveBrowserFallbackState(state) };
}

export function browserDeleteWorkflow(workflowId: string): GraphMemoryState {
  const state = loadBrowserFallbackState();
  state.workflows = state.workflows.filter((w) => w.id !== workflowId);
  return saveBrowserFallbackState(state);
}

export function browserHandleMcp(
  rpcPayload: Record<string, any>,
  clientType: IdeClientType
): Record<string, any> {
  const state = loadBrowserFallbackState();
  return {
    jsonrpc: '2.0',
    id: rpcPayload.id ?? 1,
    result: {
      clientType,
      protocolVersion: '2025-03-26',
      subtopicIndexCount: state.subtopics.length,
      status: 'OK (Embedded Browser Graph Engine)',
    },
    _stateSnapshot: state,
  };
}
