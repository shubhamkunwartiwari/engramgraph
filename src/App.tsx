/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  AgentRunResult,
  EdgeRelationType,
  GraphMemoryState,
  IdeClientType,
  MemoryNodeKind,
  ModelProvider,
  SUPPORTED_AGENT_MODELS,
} from './types/memory.ts';
import { HierarchicalGraphCanvas } from './components/HierarchicalGraphCanvas.tsx';
import {
  NewSubtopicModal,
  MutateSubtopicModal,
  FalkorConfigDrawer,
  IngestDocumentModal,
  NewWorkspaceModal,
} from './components/ModalsAndDrawers.tsx';
import {
  Plus,
  Database,
  ArrowDownLeft,
  ArrowUpRight,
  Play,
  Loader2,
  Route,
  RefreshCw,
  RotateCcw,
  Terminal,
  ChevronRight,
  ChevronDown,
  Compass,
  Activity,
  GitBranch,
  Cpu,
  Code2,
  FileText,
  FolderPlus,
  Trash2,
  Copy,
  Check,
  Download,
} from 'lucide-react';

type ActiveView = 'home' | 'workflows' | 'builder' | 'sdk' | 'activity';

const QUICK_EXAMPLES = [
  {
    title: 'Claude → ChatGPT Relay',
    subtitle: 'Switch models mid-task with zero loss',
    agents: ['agent_atlas', 'agent_cipher'],
    swapTo: 'gpt-4o',
    prompt:
      'Audit our Envoy circuit breaker and Ed25519 lease rules, verify they preserve INC-409 mitigation paths across model switches, and commit a unified policy update.',
  },
  {
    title: 'Incident Root-Cause Triage',
    subtitle: 'Pull SRE topic, add mitigation, release',
    agents: ['agent_nova'],
    swapTo: undefined,
    prompt:
      'Review INC-409 connection pool saturation in the SRE sub-topic, add a new automated connection draining rule, and release the context back to the graph.',
  },
  {
    title: 'EU Residency & Cost Check',
    subtitle: 'Multi-agent handoff across 2 sub-topics',
    agents: ['agent_vanguard', 'agent_atlas'],
    swapTo: undefined,
    prompt:
      'Verify how EU healthcare tenant multigraph namespaces enforce the $0.004/turn token budget and update the product summary.',
  },
];

export default function App() {
  const [state, setState] = useState<GraphMemoryState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent_atlas');
  const [selectedSubtopicId, setSelectedSubtopicId] = useState<string | null>('sub_arch');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null);
  const [strictAgentScopeView, setStrictAgentScopeView] = useState<boolean>(false);

  // Command bar states
  const [taskPrompt, setTaskPrompt] = useState<string>(QUICK_EXAMPLES[0].prompt);
  const [autoEvictOnFinish, setAutoEvictOnFinish] = useState<boolean>(true);
  const [midRunSwapModelId, setMidRunSwapModelId] = useState<string>('');
  const [isRunningTask, setIsRunningTask] = useState<boolean>(false);
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<AgentRunResult | null>(null);

  // Custom Model Form State
  const [customModelId, setCustomModelId] = useState('');
  const [customModelLabel, setCustomModelLabel] = useState('');
  const [customModelProvider, setCustomModelProvider] =
    useState<ModelProvider>('Self-Hosted vLLM / Ollama');
  const [customModelRoute, setCustomModelRoute] = useState('http://localhost:11434/v1');
  const [customModelBudget, setCustomModelBudget] = useState(8192);

  // Custom Agent Form State
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentRole, setNewAgentRole] = useState('');
  const [newAgentSpecialty, setNewAgentSpecialty] = useState('');
  const [newAgentModelId, setNewAgentModelId] = useState('claude-3-7-sonnet');

  // Custom Workflow Builder State
  const [wfName, setWfName] = useState('');
  const [wfDescription, setWfDescription] = useState('');
  const [wfStages, setWfStages] = useState<
    Array<{
      agentId: string;
      modelOverrideId: string;
      instruction: string;
      autoReleaseAfterStage: boolean;
    }>
  >([
    {
      agentId: 'agent_atlas',
      modelOverrideId: 'claude-3-7-sonnet',
      instruction:
        'Check out relevant architecture sub-topics, verify constraints, and commit findings.',
      autoReleaseAfterStage: true,
    },
    {
      agentId: 'agent_cipher',
      modelOverrideId: 'gpt-4o',
      instruction:
        'Audit the newly committed nodes for compliance and update the executive summary.',
      autoReleaseAfterStage: true,
    },
  ]);

  // Developer SDK & IDE Connect state
  const [sdkTab, setSdkTab] = useState<
    'claude_code' | 'openai_codex' | 'cursor_vscode' | 'typescript' | 'python'
  >('claude_code');
  const [simIdeClient, setSimIdeClient] = useState<IdeClientType>('Claude Code CLI');
  const [mcpCommitTitle, setMcpCommitTitle] = useState(
    'Enforce 150ms gRPC circuit breaker in payment gateway'
  );
  const [mcpCommitContent, setMcpCommitContent] = useState(
    'Added envoy retry policy and verified zero-loss lease handoff from IDE session.'
  );
  const [isCallingMcp, setIsCallingMcp] = useState(false);
  const [copiedSdk, setCopiedSdk] = useState(false);
  const [liveApiResponse, setLiveApiResponse] = useState<string | null>(null);

  // Modals
  const [isNewSubtopicOpen, setIsNewSubtopicOpen] = useState<boolean>(false);
  const [mutateModalSubtopicId, setMutateModalSubtopicId] = useState<string | null>(null);
  const [isFalkorDrawerOpen, setIsFalkorDrawerOpen] = useState<boolean>(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);
  const [isNewWorkspaceOpen, setIsNewWorkspaceOpen] = useState<boolean>(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  }, []);

  const fetchGraphState = useCallback(async () => {
    try {
      const res = await fetch('/api/graph/state');
      if (!res.ok) throw new Error('Failed to load graph state');
      const data = (await res.json()) as GraphMemoryState;
      setState(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load persistent memory graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraphState();
  }, [fetchGraphState]);

  const availableModels = useMemo(() => {
    if (!state || !Array.isArray(state.availableModels) || state.availableModels.length === 0) {
      return SUPPORTED_AGENT_MODELS;
    }
    return state.availableModels;
  }, [state]);

  const activeAgent = useMemo(() => {
    if (!state) return null;
    return state.agents.find((a) => a.id === selectedAgentId) || state.agents[0];
  }, [state, selectedAgentId]);

  const tokenStats = useMemo(() => {
    if (!state || !activeAgent) {
      return { summaryTokens: 0, mountedTokens: 0, activeTokens: 0, totalTokens: 1, savedPct: 0 };
    }
    const summaryTokens = state.subtopics.reduce((acc, s) => acc + s.summaryTokenCount, 0);
    const totalTokens = state.subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);
    let mountedTokens = 0;
    for (const id of activeAgent.mountedSubtopicIds) {
      const sub = state.subtopics.find((s) => s.id === id);
      if (sub) mountedTokens += Math.max(0, sub.fullTokenCount - sub.summaryTokenCount);
    }
    const activeTokens = summaryTokens + mountedTokens;
    const savedPct =
      totalTokens > 0 ? Math.round(((totalTokens - activeTokens) / totalTokens) * 100) : 0;
    return { summaryTokens, mountedTokens, activeTokens, totalTokens, savedPct };
  }, [state, activeAgent]);

  const handleSwitchWorkspace = async (workspaceId: string) => {
    try {
      const res = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to switch workspace');
      setState(data.state);
      setSelectedAgentId(data.state.agents[0]?.id || '');
      setSelectedSubtopicId(data.state.subtopics[0]?.id || null);
      setHighlightedPathId(null);
      triggerToast(`Switched to workspace [${data.state.rootGraphName}].`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleCreateWorkspace = async (payload: {
    name: string;
    description: string;
    template: 'blank' | 'enterprise_sample';
  }) => {
    const res = await fetch('/api/workspaces/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create workspace');
    setState(data.state);
    setSelectedAgentId(data.state.agents[0]?.id || '');
    setSelectedSubtopicId(data.state.subtopics[0]?.id || null);
    setHighlightedPathId(null);
    setActiveView('home');
    triggerToast(`Created workspace [${data.state.rootGraphName}].`);
  };

  const handleIngestDocument = async (payload: {
    documentTitle: string;
    rawText: string;
    agentId: string;
  }) => {
    const res = await fetch('/api/graph/ingest-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Document ingestion failed');
    setState(data.state);
    if (data.createdSubtopics?.[0]) {
      setSelectedSubtopicId(data.createdSubtopics[0].id);
    }
    if (data.createdPath) {
      setHighlightedPathId(data.createdPath.id);
    }
    setActiveView('home');
    triggerToast(
      `Partitioned "${payload.documentTitle}" into ${data.createdSubtopics.length} sub-topics & ${data.createdNodesCount} nodes.`
    );
  };

  const handleSwitchAgentModel = async (agentId: string, modelId: string) => {
    try {
      const res = await fetch('/api/agent/switch-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Model switch failed');
      setState(data.state);
      triggerToast(
        `Switched to ${data.newModel} — 0 context lost (${data.preservedSubtopics.length} topics & ${data.preservedPaths.length} paths kept).`
      );
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleCheckoutSubtopic = async (agentId: string, subtopicId: string) => {
    try {
      const res = await fetch('/api/graph/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          subtopicId,
          reason: 'Pulled full sub-topic into active working memory',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      setState(data.state);
      setSelectedSubtopicId(subtopicId);
      triggerToast(`Pulled [${data.subtopic?.name || subtopicId}] into ${activeAgent?.name}'s memory.`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleReleaseSubtopic = async (agentId: string, subtopicId: string) => {
    try {
      const res = await fetch('/api/graph/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          subtopicId,
          reason: 'Returned sub-topic back into FalkorDB graph storage',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Release failed');
      setState(data.state);
      triggerToast(`Sent [${data.subtopic?.name || subtopicId}] back into the graph.`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleReleaseAllLeases = async () => {
    try {
      const res = await fetch('/api/graph/release-all', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        triggerToast('All loaded sub-topics returned to the graph.');
      }
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleRunTask = async (
    customPrompt?: string,
    customAgentIds?: string[],
    customSwapModelId?: string
  ) => {
    const promptToRun = (customPrompt ?? taskPrompt).trim();
    if (!promptToRun || isRunningTask || !activeAgent) return;

    setIsRunningTask(true);
    try {
      const agentsToUse = customAgentIds || [activeAgent.id];
      const swapTarget = customSwapModelId ?? midRunSwapModelId;
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskPrompt: promptToRun,
          agentIds: agentsToUse,
          autoEvictOnFinish,
          simulateMidRunModelSwitch: swapTarget ? { targetModelId: swapTarget } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Agent run failed');
      setState(data.state);
      setLatestRun(data.run);
      triggerToast(
        `Finished (${data.run.steps.length} graph steps across ${data.run.modelsUsed?.join(' → ')}).`
      );
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    } finally {
      setIsRunningTask(false);
    }
  };

  const handleRegisterCustomModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelId.trim() || !customModelLabel.trim()) return;
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customModelId.trim(),
          label: customModelLabel.trim(),
          provider: customModelProvider,
          endpointRoute: customModelRoute.trim(),
          contextBudgetTokens: customModelBudget,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register model');
      setState(data.state);
      setCustomModelId('');
      setCustomModelLabel('');
      triggerToast(`Registered model [${data.model.label}] — available across all agents & workflows.`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleCreateCustomAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim() || !newAgentRole.trim()) return;
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName.trim(),
          role: newAgentRole.trim(),
          specialty: newAgentSpecialty.trim(),
          modelId: newAgentModelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create agent');
      setState(data.state);
      setSelectedAgentId(data.agent.id);
      setNewAgentName('');
      setNewAgentRole('');
      setNewAgentSpecialty('');
      triggerToast(`Created agent [${data.agent.name}] on ${data.agent.activeModelLabel}.`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not remove agent');
      setState(data.state);
      if (selectedAgentId === agentId && data.state.agents[0]) {
        setSelectedAgentId(data.state.agents[0].id);
      }
      triggerToast('Agent removed from workspace.');
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfName.trim() || wfStages.length === 0) return;
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wfName.trim(),
          description: wfDescription.trim(),
          stages: wfStages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save workflow');
      setState(data.state);
      setWfName('');
      setWfDescription('');
      triggerToast(`Saved workflow [${data.workflow.name}].`);
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleRunWorkflow = async (workflowId: string) => {
    if (runningWorkflowId) return;
    setRunningWorkflowId(workflowId);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Workflow execution failed');
      setState(data.state);
      setLatestRun(data.run);
      setActiveView('home');
      triggerToast(
        `Workflow complete (${data.run.steps.length} steps across ${data.run.modelsUsed.join(' → ')}).`
      );
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    } finally {
      setRunningWorkflowId(null);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
        triggerToast('Workflow deleted.');
      }
    } catch (err: any) {
      triggerToast(`Error: ${err.message}`);
    }
  };

  const handleCreateSubtopic = async (payload: {
    name: string;
    domain: string;
    summary: string;
    createdByAgentId: string;
    initialNodes: Array<{ title: string; content: string; kind: MemoryNodeKind }>;
  }) => {
    const res = await fetch('/api/graph/subtopic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create sub-topic');
    setState(data.state);
    setSelectedSubtopicId(data.subtopic.id);
    triggerToast(`Created sub-topic [${data.subtopic.name}].`);
  };

  const handleMutateSubtopic = async (payload: {
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
  }) => {
    const res = await fetch('/api/graph/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to mutate sub-topic');
    setState(data.state);
    triggerToast(`Updated [${data.subtopic.name}] to v${data.subtopic.version}.`);
  };

  const handleConnectFalkor = async (url: string, graphName: string) => {
    const res = await fetch('/api/falkordb/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, graphName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Connection failed');
    setState(data.state);
    triggerToast(data.message);
  };

  const handleResetGraph = async () => {
    const res = await fetch('/api/graph/reset', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.state) {
      setState(data.state);
      setLatestRun(null);
      setHighlightedPathId(null);
      triggerToast('Graph reset to default.');
    }
  };

  const handleExportWorkspaceJson = () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.rootGraphId}_engram_workspace.json`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Exported workspace JSON snapshot.');
  };

  const handleExecuteMcpTool = async (
    method: 'initialize' | 'tools/list' | 'tools/call',
    toolName?: string,
    toolArgs?: Record<string, any>
  ) => {
    if (!activeAgent || isCallingMcp) return;
    setIsCallingMcp(true);
    try {
      const rpcPayload = {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params:
          method === 'tools/call'
            ? {
                name: toolName,
                arguments: {
                  agentId: activeAgent.id,
                  ...toolArgs,
                },
              }
            : {},
      };
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Engram-Client': simIdeClient,
        },
        body: JSON.stringify(rpcPayload),
      });
      const data = await res.json();
      if (data._stateSnapshot) {
        setState(data._stateSnapshot);
        delete data._stateSnapshot;
      }
      setLiveApiResponse(JSON.stringify(data, null, 2));
      triggerToast(
        `[${simIdeClient}] executed MCP ${toolName || method} on ${activeAgent.name}.`
      );
    } catch (err: any) {
      triggerToast(`MCP Error: ${err.message}`);
    } finally {
      setIsCallingMcp(false);
    }
  };

  const handleDownloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast(`Downloaded ${filename} for your repo root.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090C10] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3 border border-slate-800 bg-[#0F1522] p-6 rounded-lg">
          <div className="h-4 w-36 bg-slate-800 animate-pulse rounded" />
          <div className="h-3 w-full bg-slate-800/70 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (error || !state || !activeAgent) {
    return (
      <div className="min-h-screen bg-[#090C10] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md border border-rose-500/40 bg-[#0F1522] p-6 rounded-lg space-y-4">
          <h1 className="text-base font-semibold text-white">Graph Engine Offline</h1>
          <p className="text-xs text-slate-300">{error}</p>
          <button
            type="button"
            onClick={fetchGraphState}
            className="tactile-emerald px-4 py-2 rounded-md text-xs font-semibold"
          >
            Reconnect
          </button>
        </div>
      </div>
    );
  }

  const totalMountedCount = state.agents.reduce(
    (acc, a) => acc + a.mountedSubtopicIds.length,
    0
  );

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sampleSubId = selectedSubtopicId || state.subtopics[0]?.id || 'sub_arch';

  const claudeMdContent = `# CLAUDE.md — EngramGraph Persistent Multi-Agent Memory Rules
Workspace: ${state.rootGraphName} (\`${state.rootGraphId}\`)
Bound Agent: ${activeAgent.name} (\`${activeAgent.id}\`)
MCP Server Endpoint: ${originUrl}/api/mcp

## Memory Paging Protocol (Mandatory)
1. **Summary First**: At the start of any coding task, call \`engram_get_index\` to inspect the ${state.subtopics.length} Sub-Topic summaries and shared multi-hop paths. Do NOT load all sub-topics at once.
2. **On-Demand Checkout**: Call \`engram_checkout_subtopic\` with \`subtopicId\` ONLY for the specific sub-topic relevant to the files you are editing.
3. **Commit Decisions Back**: After making architectural or code changes, call \`engram_commit_memory\` to record new Facts/Decisions/Procedures and refresh the sub-topic summary.
4. **Release Context**: Call \`engram_release_subtopic\` as soon as you finish using a sub-topic so it returns to FalkorDB and keeps your context window lean.`;

  const codexAgentsMdContent = `# AGENTS.md — OpenAI Codex CLI & Multi-Agent Graph Memory Protocol
Workspace: ${state.rootGraphName} (\`${state.rootGraphId}\`)
Default Agent: ${activeAgent.name} (\`${activeAgent.id}\`)
Live Graph Endpoint: ${originUrl}

## How Codex Interacts with EngramGraph
- **Step 1 (Index Scan)**: Run \`engram_get_index\` (or \`GET ${originUrl}/api/v1/index?agentId=${activeAgent.id}\`) to read the lightweight sub-topic summary directory and shared reasoning paths.
- **Step 2 (Page-In Sub-Topic)**: Run \`engram_checkout_subtopic\` (\`POST ${originUrl}/api/v1/checkout\`) for the target sub-topic (e.g. \`${sampleSubId}\`) before modifying related modules.
- **Step 3 (Update Graph)**: Commit new architectural decisions or bug root-causes via \`engram_commit_memory\` (\`POST ${originUrl}/api/graph/mutate\`).
- **Step 4 (Page-Out Release)**: Evict the sub-topic back to FalkorDB via \`engram_release_subtopic\` (\`POST ${originUrl}/api/v1/release\`) when done so Claude Code, Cursor, or GPT-4o can immediately inherit the updated state.`;

  const sdkSnippets: Record<
    'claude_code' | 'openai_codex' | 'cursor_vscode' | 'typescript' | 'python',
    string
  > = {
    claude_code: `# 1. Download the zero-dependency MCP Stdio Bridge into your repository
curl -sL "${originUrl}/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}" -o engram-mcp-bridge.mjs

# 2. Register EngramGraph with Claude Code CLI in 1 command
claude mcp add engram-memory -e ENGRAM_URL="${originUrl}" -e ENGRAM_CLIENT="Claude Code CLI" -- node ./engram-mcp-bridge.mjs

# 3. Verify inside Claude Code
# Run \`claude\` and type: /mcp
# Available tools: engram_get_index, engram_checkout_subtopic, engram_commit_memory, engram_release_subtopic, engram_switch_model`,
    openai_codex: `# 1. Download the MCP Bridge & AGENTS.md into your repository root
curl -sL "${originUrl}/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}" -o engram-mcp-bridge.mjs

# 2. Add to ~/.codex/config.json (or codex.json in repo root)
{
  "model": "o3-mini",
  "mcpServers": {
    "engram-memory": {
      "command": "node",
      "args": ["./engram-mcp-bridge.mjs"],
      "env": {
        "ENGRAM_URL": "${originUrl}",
        "ENGRAM_CLIENT": "OpenAI Codex CLI"
      }
    }
  }
}

# 3. Launch OpenAI Codex CLI with shared graph memory
codex "Scan EngramGraph index, checkout ${sampleSubId}, and audit our implementation"`,
    cursor_vscode: `// Save as .cursor/mcp.json (Cursor) or .vscode/mcp.json (VS Code Copilot) or ~/.codeium/windsurf/mcp_config.json
{
  "mcpServers": {
    "engram-falkordb-memory": {
      "command": "node",
      "args": ["./engram-mcp-bridge.mjs"],
      "env": {
        "ENGRAM_URL": "${originUrl}",
        "ENGRAM_CLIENT": "Cursor IDE"
      }
    }
  }
}`,
    typescript: `// EngramGraph TypeScript SDK — Works with Claude, OpenAI, Gemini, or LangGraph
const ENGRAM_URL = "${originUrl}";
const AGENT_ID = "${activeAgent.id}";

// 1. Fetch lightweight Sub-Topic Summary Index & Shared Graph Paths
const index = await fetch(\`\${ENGRAM_URL}/api/v1/index?agentId=\${AGENT_ID}\`).then(r => r.json());

// 2. Pull a specific Sub-Topic into working memory on demand
const mounted = await fetch(\`\${ENGRAM_URL}/api/v1/checkout\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agentId: AGENT_ID, subtopicId: "${sampleSubId}", reason: "Inspecting nodes" })
}).then(r => r.json());

// 3. Return Sub-Topic back to FalkorDB when done
await fetch(\`\${ENGRAM_URL}/api/v1/release\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agentId: AGENT_ID, subtopicId: "${sampleSubId}", reason: "Task complete" })
});`,
    python: `# EngramGraph Python Client — Plug into CrewAI, AutoGen, OpenAI, or Anthropic
import requests

ENGRAM_URL = "${originUrl}"
AGENT_ID = "${activeAgent.id}"

# 1. Load only the Sub-Topic Summary Directory + Saved Multi-Hop Paths
index = requests.get(f"{ENGRAM_URL}/api/v1/index", params={"agentId": AGENT_ID}).json()

# 2. Checkout full nodes for a specific sub-topic only when needed
sub = requests.post(f"{ENGRAM_URL}/api/v1/checkout", json={
    "agentId": AGENT_ID,
    "subtopicId": "${sampleSubId}",
    "reason": "Need domain context for current step"
}).json()

# 3. Release back to graph to keep LLM token window minimal
requests.post(f"{ENGRAM_URL}/api/v1/release", json={
    "agentId": AGENT_ID,
    "subtopicId": "${sampleSubId}"
})`,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090C10] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-[#090C10]/95 backdrop-blur">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap"
        >
          EngramGraph
        </a>

        {/* Zone 2: 5 Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveView('home')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'home'
                ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                : 'hover:text-slate-100'
            }`}
          >
            Graph Stage
          </button>
          <button
            type="button"
            onClick={() => setActiveView('workflows')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'workflows'
                ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                : 'hover:text-slate-100'
            }`}
          >
            Workflows ({state.workflows?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('builder')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'builder'
                ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                : 'hover:text-slate-100'
            }`}
          >
            Models & Agents
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sdk')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'sdk'
                ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                : 'hover:text-slate-100'
            }`}
          >
            IDEs & CLI (MCP)
          </button>
          <button
            type="button"
            onClick={() => setActiveView('activity')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'activity'
                ? 'text-white underline decoration-emerald-400 decoration-2 underline-offset-8'
                : 'hover:text-slate-100'
            }`}
          >
            Cypher Log ({state.traceHistory.length})
          </button>
        </nav>

        {/* Zone 3: 2 Tactile Primary Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsIngestModalOpen(true)}
            className="tactile-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium bg-[#141C2B] border border-slate-700/80 text-slate-200 hover:text-white whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            Ingest Docs
          </button>
          <button
            type="button"
            onClick={() => setIsNewSubtopicOpen(true)}
            className="tactile-emerald inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Sub-Topic
          </button>
        </div>
      </header>

      {/* Workspace Body: Left Sidebar + Open Center Stage */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
        {/* Left Sidebar (275px on desktop) */}
        <aside className="w-full lg:w-[275px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-[#0B0F17] p-5 flex flex-col justify-between gap-6">
          <div className="space-y-6">
            {/* Multi-Workspace Project Switcher */}
            <div className="space-y-2 pb-4 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">
                  Corporate Workspace
                </span>
                <button
                  type="button"
                  onClick={() => setIsNewWorkspaceOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  <FolderPlus className="w-3 h-3" />
                  New Project
                </button>
              </div>
              <select
                aria-label="Select Workspace"
                value={state.rootGraphId}
                onChange={(e) => handleSwitchWorkspace(e.target.value)}
                className="w-full bg-[#111724] border border-slate-800 rounded-md px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                {(state.workspaces || []).map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.subtopicCount} topics)
                  </option>
                ))}
              </select>
            </div>

            {/* Platform Views */}
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-slate-500 px-2 pb-1">
                Platform Modules
              </div>
              {[
                { id: 'home', label: 'Home Graph Stage', icon: Compass },
                { id: 'workflows', label: 'Workflow Pipelines', icon: GitBranch },
                { id: 'builder', label: 'Bring Your Own Models', icon: Cpu },
                { id: 'sdk', label: 'Claude Code, Codex & IDEs', icon: Code2 },
                { id: 'activity', label: 'Cypher & Swap Log', icon: Activity },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id as ActiveView)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#162032] text-white border border-slate-700/70'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#111724]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Saved Multi-Agent Workflows */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-medium text-slate-500">
                  Saved Workflows
                </span>
                <button
                  type="button"
                  onClick={() => setActiveView('workflows')}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  + Build
                </button>
              </div>
              <div className="space-y-2">
                {(state.workflows || []).slice(0, 3).map((wf) => {
                  const isRunningThis = runningWorkflowId === wf.id;
                  return (
                    <button
                      key={wf.id}
                      type="button"
                      disabled={Boolean(runningWorkflowId) || isRunningTask}
                      onClick={() => handleRunWorkflow(wf.id)}
                      className="tactile-btn w-full text-left p-2.5 rounded-md bg-[#111724] border border-slate-800 hover:border-slate-600 transition-colors group"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-200 group-hover:text-emerald-300">
                        <span className="truncate">{wf.name}</span>
                        {isRunningThis ? (
                          <Loader2 className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
                        ) : (
                          <Play className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                        {wf.stages.length} stages · 1-click run
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Connected IDE & CLI Sessions (Claude Code, OpenAI Codex, Cursor) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-medium text-slate-500">
                  Connected IDEs & CLIs
                </span>
                <button
                  type="button"
                  onClick={() => setActiveView('sdk')}
                  className="text-[11px] text-emerald-400 hover:underline"
                >
                  + Connect
                </button>
              </div>
              <div className="space-y-1.5">
                {(state.connectedIdeSessions || []).slice(0, 3).map((sess) => (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => {
                      setSimIdeClient(sess.clientType);
                      setActiveView('sdk');
                    }}
                    className="w-full text-left px-3 py-2 rounded-md bg-[#0E131D] border border-slate-800/80 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-slate-200">
                      <span className="truncate">{sess.clientType}</span>
                      <span className="font-mono text-[10px] text-emerald-400">
                        {sess.totalCalls} calls
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 mt-0.5 truncate">
                      {sess.boundAgentName} · {sess.lastToolCalled}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Shared Multi-Hop Graph Paths */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-[11px] font-medium text-slate-500">
                  Shared Graph Paths
                </span>
                {highlightedPathId && (
                  <button
                    type="button"
                    onClick={() => setHighlightedPathId(null)}
                    className="text-[10px] font-mono text-amber-400 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {state.savedPaths.slice(0, 3).map((p) => {
                  const isSelected = highlightedPathId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActiveView('home');
                        setHighlightedPathId(isSelected ? null : p.id);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                          : 'bg-[#0E131D] border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium truncate">
                        <Route className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{p.title}</span>
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 mt-0.5 truncate">
                        {p.authoredByModel} · {p.nodeIds.length} hops
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar Bottom Utility Controls */}
          <div className="space-y-2 pt-4 border-t border-slate-800/80">
            {totalMountedCount > 0 && (
              <button
                type="button"
                onClick={handleReleaseAllLeases}
                className="tactile-rose w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Return All Topics ({totalMountedCount})
              </button>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsFalkorDrawerOpen(true)}
                className="tactile-btn flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-[#111724] border border-slate-800 text-[11px] text-slate-300 hover:text-white"
              >
                <Database className="w-3 h-3 text-emerald-400" />
                FalkorDB
              </button>
              <button
                type="button"
                onClick={handleExportWorkspaceJson}
                className="tactile-btn flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded bg-[#111724] border border-slate-800 text-[11px] text-slate-300 hover:text-white"
              >
                <Download className="w-3 h-3 text-emerald-400" />
                Export JSON
              </button>
            </div>
          </div>
        </aside>

        {/* Open Center Stage */}
        <main className="flex-1 p-5 sm:p-8 space-y-6 overflow-y-auto">
          {/* Subtle Toast Notification */}
          {toastMessage && (
            <div className="border border-emerald-500/40 bg-emerald-950/40 px-4 py-2.5 rounded-md text-xs text-emerald-200 flex items-center justify-between">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-emerald-400 hover:text-white font-mono ml-4"
              >
                Close
              </button>
            </div>
          )}

          {/* Active Agent + Zero-Loss Model Switcher Bar */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border border-slate-800/90 bg-[#0D121C] p-4 rounded-lg">
            {/* Agent Selector Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 mr-1">Agent:</span>
              {state.agents.map((ag) => {
                const isSelected = ag.id === activeAgent.id;
                const count = ag.mountedSubtopicIds.length;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => setSelectedAgentId(ag.id)}
                    className={`tactile-btn px-3.5 py-1.5 rounded-md text-xs font-medium border flex items-center gap-2 ${
                      isSelected
                        ? 'bg-[#182438] border-emerald-400/60 text-white'
                        : 'bg-[#111724] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{ag.name}</span>
                    <span className="font-mono text-[10px] text-emerald-400 tabular-nums">
                      {count > 0 ? `${count} loaded` : 'summary'}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setActiveView('builder')}
                className="px-2.5 py-1.5 rounded-md text-xs text-emerald-400 hover:text-emerald-300 border border-dashed border-slate-700 hover:border-emerald-400/60 transition-colors"
              >
                + Custom Agent
              </button>
            </div>

            {/* Model Hot-Swapper + Minimalist Memory Meter */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-slate-400">Model:</span>
                <select
                  aria-label="Switch Agent Model"
                  value={activeAgent.activeModelId}
                  onChange={(e) => handleSwitchAgentModel(activeAgent.id, e.target.value)}
                  className="bg-[#141D2E] border border-slate-700 rounded-md px-3 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-400 cursor-pointer"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-4 w-px bg-slate-800 hidden sm:block" />

              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Active Memory: <strong className="text-white">{tokenStats.activeTokens}t</strong> /{' '}
                {tokenStats.totalTokens}t ({tokenStats.savedPct}% in graph)
              </div>
            </div>
          </div>

          {/* VIEW 1: OPEN HOME WORKSPACE */}
          {activeView === 'home' && (
            <div className="space-y-6">
              {/* Interactive Prompt Command Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunTask();
                }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 border border-slate-800 bg-[#0D121C] p-2.5 rounded-lg"
              >
                <input
                  type="text"
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder={`Give ${activeAgent.name} (${activeAgent.activeModelLabel}) a task on ${state.rootGraphName}...`}
                  className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Optional Mid-Task Model Switch"
                    value={midRunSwapModelId}
                    onChange={(e) => setMidRunSwapModelId(e.target.value)}
                    className="bg-[#131B2A] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-300 font-mono"
                  >
                    <option value="">Keep {activeAgent.activeModelLabel}</option>
                    {availableModels
                      .filter((m) => m.id !== activeAgent.activeModelId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          Swap mid-run → {m.label}
                        </option>
                      ))}
                  </select>

                  <button
                    type="submit"
                    disabled={isRunningTask || !taskPrompt.trim()}
                    className="tactile-emerald inline-flex items-center gap-2 px-5 py-2 rounded-md text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                  >
                    {isRunningTask ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Run Agent
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Latest Run Compact Summary Banner */}
              {latestRun && (
                <div className="border border-emerald-500/30 bg-[#0E1920] p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-300">
                    <span className="font-semibold">
                      Latest Execution ({latestRun.modelsUsed?.join(' → ')}) ·{' '}
                      {latestRun.steps.length} Graph Steps
                    </span>
                    <button
                      type="button"
                      onClick={() => setLatestRun(null)}
                      className="text-slate-400 hover:text-white font-mono"
                    >
                      Hide
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {latestRun.finalSynthesis}
                  </p>
                </div>
              )}

              {/* Centerpiece Interactive Graph Stage */}
              <HierarchicalGraphCanvas
                state={state}
                selectedAgentId={selectedAgentId}
                selectedSubtopicId={selectedSubtopicId}
                selectedNodeId={selectedNodeId}
                highlightedPathId={highlightedPathId}
                strictAgentScopeView={strictAgentScopeView}
                onToggleStrictScope={() => setStrictAgentScopeView((v) => !v)}
                onSelectSubtopic={(subId) => {
                  setSelectedSubtopicId(subId);
                  setSelectedNodeId(null);
                }}
                onSelectNode={(nodeId, subId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedSubtopicId(subId);
                }}
                onSelectPath={(pathId) => setHighlightedPathId(pathId)}
                onCheckoutSubtopic={handleCheckoutSubtopic}
                onReleaseSubtopic={handleReleaseSubtopic}
                onOpenNewNodeModal={(subId) => setMutateModalSubtopicId(subId)}
              />

              {/* Clean Sub-Topic Switchboard Grid */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">
                    Sub-Topic Context Partitions ({state.subtopics.length})
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoEvictOnFinish}
                      onChange={(e) => setAutoEvictOnFinish(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    Auto-return topics to graph after agent run
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {state.subtopics.map((sub) => {
                    const isMounted = activeAgent.mountedSubtopicIds.includes(sub.id);
                    const subNodes = state.nodes.filter((n) => n.subtopicId === sub.id);

                    return (
                      <div
                        key={sub.id}
                        onClick={() => setSelectedSubtopicId(sub.id)}
                        className={`p-4 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between gap-4 ${
                          isMounted
                            ? 'bg-[#101B2B] border-emerald-500/50'
                            : selectedSubtopicId === sub.id
                            ? 'bg-[#111724] border-slate-600'
                            : 'bg-[#0C1018] border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold text-white">{sub.name}</span>
                            <span className="font-mono text-[11px] tabular-nums">
                              v{sub.version} · {subNodes.length}n
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {sub.summary}
                          </p>

                          {isMounted && (
                            <div className="pt-2 mt-2 border-t border-slate-800/80 space-y-1">
                              {subNodes.map((n) => (
                                <div
                                  key={n.id}
                                  className="text-[11px] text-emerald-300 truncate font-mono"
                                >
                                  • {n.title}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500">
                            {isMounted
                              ? `${sub.fullTokenCount}t loaded`
                              : `${sub.summaryTokenCount}t summary`}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMutateModalSubtopicId(sub.id);
                              }}
                              className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-white bg-[#131B2A] border border-slate-800"
                            >
                              + Node
                            </button>
                            {isMounted ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReleaseSubtopic(activeAgent.id, sub.id);
                                }}
                                className="tactile-rose inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                Send Back
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCheckoutSubtopic(activeAgent.id, sub.id);
                                }}
                                className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#172133] border border-slate-700 text-emerald-300 hover:text-white"
                              >
                                <ArrowDownLeft className="w-3 h-3" />
                                Pull Topic
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: CUSTOM MULTI-AGENT WORKFLOW BUILDER & RUNNER */}
          {activeView === 'workflows' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Saved Workflows List */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Multi-Agent Workflow Pipelines
                  </h2>
                  <p className="text-xs text-slate-400">
                    Chain multiple agents and models over the same shared FalkorDB graph.
                  </p>
                </div>

                <div className="space-y-3">
                  {(state.workflows || []).map((wf) => {
                    const isRunningThis = runningWorkflowId === wf.id;
                    return (
                      <div
                        key={wf.id}
                        className="border border-slate-800 bg-[#0D121C] rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-white">{wf.name}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{wf.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteWorkflow(wf.id)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                            title="Delete Workflow"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1.5 border-t border-slate-800/80 pt-2.5">
                          {wf.stages.map((st, idx) => {
                            const ag = state.agents.find((a) => a.id === st.agentId);
                            const mod = availableModels.find((m) => m.id === st.modelOverrideId);
                            return (
                              <div
                                key={st.id}
                                className="text-xs bg-[#090C10] border border-slate-800/80 rounded p-2.5 space-y-1"
                              >
                                <div className="flex items-center justify-between font-mono text-[11px] text-emerald-400">
                                  <span>
                                    Stage {idx + 1}: {ag?.name || st.agentId}
                                  </span>
                                  <span>{mod?.label || ag?.activeModelLabel}</span>
                                </div>
                                <p className="text-slate-300 text-xs">{st.instruction}</p>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-end pt-1">
                          <button
                            type="button"
                            disabled={Boolean(runningWorkflowId)}
                            onClick={() => handleRunWorkflow(wf.id)}
                            className="tactile-emerald inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold disabled:opacity-50"
                          >
                            {isRunningThis ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Running Pipeline…
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                Run Workflow
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Workflow Builder Form */}
              <div className="lg:col-span-7 border border-slate-800 bg-[#0D121C] rounded-lg p-5 space-y-4 h-fit">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Build New Multi-Stage Agent Workflow
                  </h3>
                  <p className="text-xs text-slate-400">
                    Define sequential agent stages, assign a specific model to each stage, and set automatic graph eviction rules.
                  </p>
                </div>

                <form onSubmit={handleSaveWorkflow} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Workflow Name
                      </label>
                      <input
                        type="text"
                        required
                        value={wfName}
                        onChange={(e) => setWfName(e.target.value)}
                        placeholder="e.g., Security Audit → PR Synthesis"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={wfDescription}
                        onChange={(e) => setWfDescription(e.target.value)}
                        placeholder="e.g., Multi-model handoff over shared graph"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-300">
                        Pipeline Stages ({wfStages.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setWfStages((prev) => [
                            ...prev,
                            {
                              agentId: state.agents[0]?.id || 'agent_atlas',
                              modelOverrideId: availableModels[0]?.id || 'claude-3-7-sonnet',
                              instruction: '',
                              autoReleaseAfterStage: true,
                            },
                          ])
                        }
                        className="text-xs text-emerald-400 hover:underline font-medium"
                      >
                        + Add Stage
                      </button>
                    </div>

                    {wfStages.map((stage, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded bg-[#090C10] border border-slate-800 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-emerald-400">
                            Stage {idx + 1}
                          </span>
                          {wfStages.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setWfStages((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-[11px] text-slate-500 hover:text-rose-400"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Assigned Agent
                            </label>
                            <select
                              value={stage.agentId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWfStages((prev) =>
                                  prev.map((s, i) => (i === idx ? { ...s, agentId: val } : s))
                                );
                              }}
                              className="w-full bg-[#0D121C] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                            >
                              {state.agents.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.role})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Model for This Stage
                            </label>
                            <select
                              value={stage.modelOverrideId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWfStages((prev) =>
                                  prev.map((s, i) =>
                                    i === idx ? { ...s, modelOverrideId: val } : s
                                  )
                                );
                              }}
                              className="w-full bg-[#0D121C] border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-emerald-300"
                            >
                              {availableModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <input
                          type="text"
                          required
                          value={stage.instruction}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWfStages((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, instruction: val } : s))
                            );
                          }}
                          placeholder="Stage instruction (which sub-topics to inspect, update, and verify)..."
                          className="w-full bg-[#0D121C] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="tactile-emerald px-5 py-2 rounded-md text-xs font-semibold"
                    >
                      Save Workflow Pipeline
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* VIEW 3: BRING YOUR OWN MODELS & CUSTOM CORPORATE AGENTS */}
          {activeView === 'builder' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Custom Model Registry */}
              <div className="border border-slate-800 bg-[#0D121C] rounded-lg p-5 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Custom Model Registry
                  </h2>
                  <p className="text-xs text-slate-400">
                    Register internal vLLM, Ollama, DeepSeek, Claude, or OpenAI models. Because state lives in FalkorDB, any registered model can take over an agent mid-workflow.
                  </p>
                </div>

                <form onSubmit={handleRegisterCustomModel} className="space-y-3 border-b border-slate-800 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Model Identifier
                      </label>
                      <input
                        type="text"
                        required
                        value={customModelId}
                        onChange={(e) => setCustomModelId(e.target.value)}
                        placeholder="e.g., deepseek-r1-70b"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Display Label
                      </label>
                      <input
                        type="text"
                        required
                        value={customModelLabel}
                        onChange={(e) => setCustomModelLabel(e.target.value)}
                        placeholder="e.g., DeepSeek R1 70B (Internal)"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Provider Family
                      </label>
                      <select
                        value={customModelProvider}
                        onChange={(e) =>
                          setCustomModelProvider(e.target.value as ModelProvider)
                        }
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                      >
                        <option value="Self-Hosted vLLM / Ollama">Self-Hosted vLLM / Ollama</option>
                        <option value="DeepSeek / OpenWeights">DeepSeek / OpenWeights</option>
                        <option value="Anthropic Claude">Anthropic Claude</option>
                        <option value="OpenAI ChatGPT">OpenAI ChatGPT</option>
                        <option value="Google Gemini">Google Gemini</option>
                        <option value="Meta Llama">Meta Llama</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Active Paging Token Budget
                      </label>
                      <input
                        type="number"
                        value={customModelBudget}
                        onChange={(e) => setCustomModelBudget(Number(e.target.value))}
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Gateway / Proxy Route URI
                    </label>
                    <input
                      type="text"
                      value={customModelRoute}
                      onChange={(e) => setCustomModelRoute(e.target.value)}
                      placeholder="http://localhost:11434/v1 or proxy://litellm-router"
                      className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-300"
                    />
                  </div>

                  <button
                    type="submit"
                    className="tactile-emerald px-4 py-2 rounded-md text-xs font-semibold"
                  >
                    + Register Model in Workspace
                  </button>
                </form>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Registered Models ({availableModels.length})
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {availableModels.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2.5 rounded bg-[#090C10] border border-slate-800/80 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{m.label}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {m.id} · {m.provider}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSwitchAgentModel(activeAgent.id, m.id)}
                          className="tactile-btn px-2.5 py-1 rounded bg-[#141D2E] border border-slate-700 text-[11px] text-emerald-300 hover:text-white"
                        >
                          Use on {activeAgent.name}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom Corporate Agent Builder */}
              <div className="border border-slate-800 bg-[#0D121C] rounded-lg p-5 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Corporate Agent Roster & Builder
                  </h2>
                  <p className="text-xs text-slate-400">
                    Create specialized agents for your team. Every agent holds only the Sub-Topic Summary Index until it pulls a sub-topic.
                  </p>
                </div>

                <form onSubmit={handleCreateCustomAgent} className="space-y-3 border-b border-slate-800 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Agent Name
                      </label>
                      <input
                        type="text"
                        required
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value)}
                        placeholder="e.g., Sentinel"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Corporate Role
                      </label>
                      <input
                        type="text"
                        required
                        value={newAgentRole}
                        onChange={(e) => setNewAgentRole(e.target.value)}
                        placeholder="e.g., FinOps & PCI Auditor"
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Assigned Default Model
                    </label>
                    <select
                      value={newAgentModelId}
                      onChange={(e) => setNewAgentModelId(e.target.value)}
                      className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs font-mono text-emerald-300"
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} ({m.provider})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Domain Specialty
                    </label>
                    <input
                      type="text"
                      value={newAgentSpecialty}
                      onChange={(e) => setNewAgentSpecialty(e.target.value)}
                      placeholder="e.g., Audits payment settlement sub-topics and enforces compliance rules"
                      className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="tactile-emerald px-4 py-2 rounded-md text-xs font-semibold"
                  >
                    + Create Corporate Agent
                  </button>
                </form>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Active Workspace Agents ({state.agents.length})
                  </div>
                  <div className="space-y-2">
                    {state.agents.map((ag) => (
                      <div
                        key={ag.id}
                        className="flex items-center justify-between p-3 rounded bg-[#090C10] border border-slate-800/80 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-white">
                            {ag.name} · <span className="text-slate-400 font-normal">{ag.role}</span>
                          </div>
                          <div className="font-mono text-[11px] text-emerald-400">
                            Model: {ag.activeModelLabel} · {ag.mountedSubtopicIds.length} topics loaded
                          </div>
                        </div>
                        {state.agents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAgent(ag.id)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                            title="Delete Agent"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: CLAUDE CODE, OPENAI CODEX, CURSOR & VS CODE MCP HUB */}
          {activeView === 'sdk' && (
            <div className="space-y-6">
              {/* Top Banner & One-Click Bridge Downloads */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-slate-800 bg-[#0D121C] p-5 rounded-lg">
                <div className="space-y-1 max-w-2xl">
                  <h2 className="text-base font-semibold text-white">
                    Connect Claude Code, OpenAI Codex CLI & Any IDE Workspace
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Attach local coding agents in <strong className="text-slate-200">Claude Code</strong>,{' '}
                    <strong className="text-slate-200">OpenAI Codex CLI</strong>,{' '}
                    <strong className="text-slate-200">Cursor</strong>,{' '}
                    <strong className="text-slate-200">VS Code</strong>, or{' '}
                    <strong className="text-slate-200">Windsurf</strong> to workspace{' '}
                    <code className="font-mono text-emerald-300">{state.rootGraphId}</code> via the live Model Context Protocol (MCP) endpoint.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={`/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}`}
                    download="engram-mcp-bridge.mjs"
                    className="tactile-emerald inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    engram-mcp-bridge.mjs
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDownloadTextFile('CLAUDE.md', claudeMdContent)}
                    className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-[#141D2E] border border-slate-700 text-slate-200 hover:text-white"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    CLAUDE.md
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTextFile('AGENTS.md', codexAgentsMdContent)}
                    className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-[#141D2E] border border-slate-700 text-slate-200 hover:text-white"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                    AGENTS.md (Codex)
                  </button>
                </div>
              </div>

              {/* Setup Snippets by IDE / CLI */}
              <div className="border border-slate-800 bg-[#0D121C] rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5 bg-[#090C10]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'claude_code', label: 'Claude Code CLI' },
                        { id: 'openai_codex', label: 'OpenAI Codex CLI' },
                        { id: 'cursor_vscode', label: 'Cursor / VS Code / Windsurf' },
                        { id: 'typescript', label: 'TypeScript SDK' },
                        { id: 'python', label: 'Python SDK' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSdkTab(tab.id)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          sdkTab === tab.id
                            ? 'bg-[#162235] text-emerald-300 border border-slate-700'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(sdkSnippets[sdkTab]);
                      setCopiedSdk(true);
                      setTimeout(() => setCopiedSdk(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 text-xs text-slate-200 hover:bg-slate-700"
                  >
                    {copiedSdk ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedSdk ? 'Copied' : 'Copy Setup'}
                  </button>
                </div>

                <pre className="p-5 font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed">
                  {sdkSnippets[sdkTab]}
                </pre>
              </div>

              {/* Interactive Live MCP JSON-RPC Terminal & IDE Simulator */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 border border-slate-800 bg-[#0D121C] rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Live MCP Tool Call Simulator
                      </h3>
                      <p className="text-xs text-slate-400">
                        Fire real JSON-RPC 2.0 MCP calls against <code className="font-mono text-emerald-300">POST /api/mcp</code> as any IDE client.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Simulating IDE / CLI Client
                      </label>
                      <select
                        value={simIdeClient}
                        onChange={(e) => setSimIdeClient(e.target.value as IdeClientType)}
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-white"
                      >
                        <option value="Claude Code CLI">Claude Code CLI</option>
                        <option value="OpenAI Codex CLI">OpenAI Codex CLI</option>
                        <option value="Cursor IDE">Cursor IDE</option>
                        <option value="VS Code Copilot">VS Code Copilot</option>
                        <option value="Windsurf IDE">Windsurf IDE</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Target Sub-Topic for IDE Checkout
                      </label>
                      <select
                        value={sampleSubId}
                        onChange={(e) => setSelectedSubtopicId(e.target.value)}
                        className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-2 text-xs text-emerald-300 font-mono"
                      >
                        {state.subtopics.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 4 Core MCP Tool Action Buttons */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() => handleExecuteMcpTool('tools/call', 'engram_get_index')}
                      className="tactile-btn p-2.5 rounded bg-[#131B2A] border border-slate-700 text-left hover:border-emerald-400/60"
                    >
                      <div className="font-mono text-xs font-semibold text-emerald-300">
                        1. engram_get_index
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Read summary directory & paths
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() =>
                        handleExecuteMcpTool('tools/call', 'engram_checkout_subtopic', {
                          subtopicId: sampleSubId,
                          reason: `${simIdeClient} checked out ${sampleSubId} while editing repo`,
                        })
                      }
                      className="tactile-btn p-2.5 rounded bg-[#131B2A] border border-slate-700 text-left hover:border-emerald-400/60"
                    >
                      <div className="font-mono text-xs font-semibold text-emerald-300">
                        2. engram_checkout_subtopic
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Page in [{sampleSubId}] nodes
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() =>
                        handleExecuteMcpTool('tools/call', 'engram_commit_memory', {
                          subtopicId: sampleSubId,
                          title: mcpCommitTitle,
                          content: mcpCommitContent,
                          kind: 'Decision',
                        })
                      }
                      className="tactile-btn p-2.5 rounded bg-[#131B2A] border border-slate-700 text-left hover:border-emerald-400/60"
                    >
                      <div className="font-mono text-xs font-semibold text-emerald-300">
                        3. engram_commit_memory
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Commit IDE decision to graph
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() =>
                        handleExecuteMcpTool('tools/call', 'engram_release_subtopic', {
                          subtopicId: sampleSubId,
                          reason: `${simIdeClient} finished coding task; returning context to FalkorDB`,
                        })
                      }
                      className="tactile-rose p-2.5 rounded text-left"
                    >
                      <div className="font-mono text-xs font-semibold text-rose-200">
                        4. engram_release_subtopic
                      </div>
                      <div className="text-[11px] text-rose-300/80">
                        Send [{sampleSubId}] back to graph
                      </div>
                    </button>
                  </div>

                  {/* Quick Custom Commit Payload from IDE */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] text-slate-400">
                      IDE Memory Node Payload (Used by <code className="font-mono text-emerald-300">engram_commit_memory</code>):
                    </div>
                    <input
                      type="text"
                      value={mcpCommitTitle}
                      onChange={(e) => setMcpCommitTitle(e.target.value)}
                      placeholder="Memory title committed from IDE..."
                      className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={mcpCommitContent}
                      onChange={(e) => setMcpCommitContent(e.target.value)}
                      placeholder="Detailed architectural note or code change summary..."
                      className="w-full bg-[#090C10] border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300"
                    />
                  </div>
                </div>

                {/* Live JSON-RPC 2.0 Response Inspector */}
                <div className="lg:col-span-6 border border-slate-800 bg-[#0D121C] rounded-lg p-5 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-emerald-400">
                      MCP JSON-RPC 2.0 Response ({simIdeClient} → /api/mcp)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleExecuteMcpTool('tools/list')}
                      className="text-xs font-mono text-slate-400 hover:text-white underline"
                    >
                      Inspect tools/list
                    </button>
                  </div>

                  <pre className="flex-1 bg-[#090C10] border border-slate-800 p-3.5 rounded font-mono text-[11px] text-emerald-300 max-h-80 overflow-y-auto leading-relaxed">
                    {liveApiResponse ||
                      `// Click any of the 4 MCP tools on the left to execute a real JSON-RPC 2.0 call as ${simIdeClient}.\n// The graph state, active token meter, and Cypher log will update immediately.`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: CLEAN ACTIVITY & CYPHER LOG */}
          {activeView === 'activity' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Context Paging, Model Switches & Cypher Log
                </h2>
                <p className="text-xs text-slate-400">
                  Click any event to inspect the exact FalkorDB Cypher query executed.
                </p>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 bg-[#0D121C] rounded-lg">
                {[...state.traceHistory].reverse().map((step) => {
                  const isExpanded = expandedStepId === step.id;
                  return (
                    <div key={step.id} className="p-4">
                      <div
                        onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                        className="flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="font-semibold text-white">{step.agentName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-emerald-400">{step.activeModel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">{step.phase}</span>
                          </div>
                          <p className="text-xs text-slate-200">{step.summary}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs tabular-nums text-slate-400">
                            {step.activeTokensBefore}t → {step.activeTokensAfter}t
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                          <p className="text-xs text-slate-400">{step.detail}</p>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                            <Terminal className="w-3 h-3" />
                            <span>FalkorDB Cypher Query</span>
                          </div>
                          <pre className="bg-[#090C10] border border-slate-800 p-3 rounded font-mono text-[11px] text-emerald-300 overflow-x-auto">
                            {step.cypherQuery}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      <NewSubtopicModal
        isOpen={isNewSubtopicOpen}
        onClose={() => setIsNewSubtopicOpen(false)}
        agents={state.agents}
        onCreateSubtopic={handleCreateSubtopic}
      />

      <MutateSubtopicModal
        isOpen={Boolean(mutateModalSubtopicId)}
        subtopicId={mutateModalSubtopicId}
        state={state}
        selectedAgentId={selectedAgentId}
        onClose={() => setMutateModalSubtopicId(null)}
        onMutateSubtopic={handleMutateSubtopic}
      />

      <FalkorConfigDrawer
        isOpen={isFalkorDrawerOpen}
        state={state}
        onClose={() => setIsFalkorDrawerOpen(false)}
        onConnectFalkor={handleConnectFalkor}
        onResetGraph={handleResetGraph}
      />

      <IngestDocumentModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        agents={state.agents}
        onIngestDocument={handleIngestDocument}
      />

      <NewWorkspaceModal
        isOpen={isNewWorkspaceOpen}
        onClose={() => setIsNewWorkspaceOpen(false)}
        onCreateWorkspace={handleCreateWorkspace}
      />
    </div>
  );
}
