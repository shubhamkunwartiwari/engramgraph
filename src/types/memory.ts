export enum MemoryNodeKind {
  FACT = 'Fact',
  DECISION = 'Decision',
  EPISODE = 'Episode',
  PROCEDURE = 'Procedure',
  CONSTRAINT = 'Constraint',
}

export enum EdgeRelationType {
  DEPENDS_ON = 'DEPENDS_ON',
  CAUSED_BY = 'CAUSED_BY',
  SUPERSEDES = 'SUPERSEDES',
  MITIGATES = 'MITIGATES',
  GOVERNED_BY = 'GOVERNED_BY',
  RELATES_TO = 'RELATES_TO',
}

export type ModelProvider =
  | 'Anthropic Claude'
  | 'OpenAI ChatGPT'
  | 'Google Gemini'
  | 'Meta Llama'
  | 'DeepSeek / OpenWeights'
  | 'Self-Hosted vLLM / Ollama';

export interface ModelDescriptor {
  id: string;
  label: string;
  provider: ModelProvider;
  endpointRoute?: string;
  contextBudgetTokens?: number;
  isCustom?: boolean;
}

export const SUPPORTED_AGENT_MODELS: ModelDescriptor[] = [
  {
    id: 'claude-3-7-sonnet',
    label: 'Claude 3.7 Sonnet',
    provider: 'Anthropic Claude',
    endpointRoute: 'anthropic://claude-3-7-sonnet',
    contextBudgetTokens: 8192,
  },
  {
    id: 'claude-3-5-haiku',
    label: 'Claude 3.5 Haiku',
    provider: 'Anthropic Claude',
    endpointRoute: 'anthropic://claude-3-5-haiku',
    contextBudgetTokens: 4096,
  },
  {
    id: 'gpt-4o',
    label: 'ChatGPT (GPT-4o)',
    provider: 'OpenAI ChatGPT',
    endpointRoute: 'openai://gpt-4o',
    contextBudgetTokens: 8192,
  },
  {
    id: 'o3-mini',
    label: 'ChatGPT (o3-mini)',
    provider: 'OpenAI ChatGPT',
    endpointRoute: 'openai://o3-mini',
    contextBudgetTokens: 8192,
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'Google Gemini',
    endpointRoute: 'gemini://gemini-3.8-flash',
    contextBudgetTokens: 16384,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    provider: 'Google Gemini',
    endpointRoute: 'gemini://gemini-3.1-flash-lite',
    contextBudgetTokens: 8192,
  },
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B Instruct',
    provider: 'Meta Llama',
    endpointRoute: 'vllm://llama-3.3-70b-instruct',
    contextBudgetTokens: 8192,
  },
];

export interface MemoryNode {
  id: string;
  subtopicId: string;
  title: string;
  content: string;
  kind: MemoryNodeKind;
  confidence: number;
  createdByAgentId: string;
  authoredByModel?: string;
  updatedAt: string;
  tokenCount: number;
}

export interface MemoryEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: EdgeRelationType;
  rationale: string;
  createdByAgentId: string;
  authoredByModel?: string;
  createdAt: string;
}

export interface SavedGraphPath {
  id: string;
  title: string;
  description: string;
  subtopicIds: string[];
  nodeIds: string[];
  edgeIds: string[];
  createdByAgentId: string;
  authoredByModel: string;
  createdAt: string;
}

export interface SubTopicLease {
  agentId: string;
  agentName: string;
  activeModel: string;
  checkedOutAt: string;
  reason: string;
}

export interface SubTopicSummaryRevision {
  version: number;
  summary: string;
  updatedByAgentId: string;
  authoredByModel: string;
  updatedAt: string;
  commitNote: string;
}

export interface SubTopic {
  id: string;
  name: string;
  domain: string;
  color: string;
  summary: string;
  version: number;
  updatedAt: string;
  lastUpdatedBy: string;
  lastUpdatedByModel?: string;
  summaryTokenCount: number;
  fullTokenCount: number;
  activeLeases: SubTopicLease[];
  revisionHistory: SubTopicSummaryRevision[];
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  specialty: string;
  accentColor: string;
  activeModelId: string;
  activeModelLabel: string;
  activeProvider: ModelProvider;
  modelSwitchCount: number;
  status:
    | 'idle'
    | 'inspecting_index'
    | 'paged_in_reasoning'
    | 'committing_graph'
    | 'releasing_context';
  currentTask?: string;
  mountedSubtopicIds: string[];
  activePathIds: string[];
  totalTasksCompleted: number;
  totalCommits: number;
  lastActiveAt: string;
  isCustom?: boolean;
}

export interface WorkflowStage {
  id: string;
  agentId: string;
  modelOverrideId?: string;
  instruction: string;
  autoReleaseAfterStage: boolean;
}

export interface CustomWorkflow {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  createdAt: string;
  lastRunAt?: string;
}

export interface WorkspaceMetadata {
  id: string;
  name: string;
  description: string;
  subtopicCount: number;
  nodeCount: number;
  agentCount: number;
  updatedAt: string;
}

export interface PagingTraceStep {
  id: string;
  stepNumber: number;
  timestamp: string;
  agentId: string;
  agentName: string;
  activeModel: string;
  phase:
    | 'INDEX_SCAN'
    | 'PAGE_IN_CHECKOUT'
    | 'CROSS_TOPIC_TRAVERSE'
    | 'GRAPH_COMMIT'
    | 'PAGE_OUT_RELEASE'
    | 'SUBTOPIC_SPLIT'
    | 'MODEL_HOT_SWAP';
  subtopicId?: string;
  subtopicName?: string;
  summary: string;
  detail: string;
  cypherQuery: string;
  activeTokensBefore: number;
  activeTokensAfter: number;
}

export interface AgentRunResult {
  runId: string;
  taskPrompt: string;
  mode: 'single_agent' | 'multi_agent_handoff';
  involvedAgentIds: string[];
  modelsUsed: string[];
  finalSynthesis: string;
  steps: PagingTraceStep[];
  startedAt: string;
  completedAt: string;
  peakActiveTokens: number;
  fullGraphTokensAvoided: number;
}

export type IdeClientType =
  | 'Claude Code CLI'
  | 'OpenAI Codex CLI'
  | 'Cursor IDE'
  | 'VS Code Copilot'
  | 'Windsurf IDE'
  | 'Custom MCP Client';

export interface IdeClientSession {
  id: string;
  clientType: IdeClientType;
  workspaceName: string;
  repoBranch: string;
  boundAgentId: string;
  boundAgentName: string;
  activeModel: string;
  lastToolCalled: string;
  status: 'connected' | 'active_paging';
  connectedAt: string;
  lastHeartbeatAt: string;
  totalCalls: number;
}

export interface GraphMemoryState {
  rootGraphId: string;
  rootGraphName: string;
  rootGraphDescription: string;
  falkorConnected: boolean;
  falkorEndpoint: string;
  availableModels: ModelDescriptor[];
  workflows: CustomWorkflow[];
  workspaces?: WorkspaceMetadata[];
  connectedIdeSessions?: IdeClientSession[];
  subtopics: SubTopic[];
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  savedPaths: SavedGraphPath[];
  agents: AgentProfile[];
  traceHistory: PagingTraceStep[];
  runHistory: AgentRunResult[];
}
