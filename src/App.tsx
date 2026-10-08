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
  BookOpen,
  Sun,
  Moon,
} from 'lucide-react';

type ActiveView = 'home' | 'readme' | 'workflows' | 'builder' | 'sdk' | 'activity';

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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('engram_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('engram_theme', theme);
  }, [theme]);

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
  const [autoEvictOnFinish] = useState<boolean>(true);
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
    }, 3500);
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
      triggerToast(`Switched to [${data.state.rootGraphName}].`);
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
    triggerToast(`Created project [${data.state.rootGraphName}].`);
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
      `Split "${payload.documentTitle}" into ${data.createdSubtopics.length} sub-topic bubbles.`
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
      triggerToast(`Switched to ${data.newModel} — 0 context lost.`);
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
      triggerToast(`Pulled [${data.subtopic?.name || subtopicId}] into ${activeAgent?.name}.`);
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
        `Completed (${data.run.steps.length} steps across ${data.run.modelsUsed?.join(' → ')}).`
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
      triggerToast(`Added model [${data.model.label}].`);
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
      triggerToast(`Created agent [${data.agent.name}].`);
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
      triggerToast('Agent removed.');
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
        `Workflow finished (${data.run.steps.length} steps across ${data.run.modelsUsed.join(' → ')}).`
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
        triggerToast('Workflow removed.');
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
    triggerToast('Exported workspace JSON.');
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
      triggerToast(`[${simIdeClient}] ran ${toolName || method}.`);
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
    triggerToast(`Downloaded ${filename}.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen theme-app flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-3 rounded-3xl theme-surface p-6">
          <div className="h-4 w-36 bg-emerald-500/20 animate-pulse rounded-full" />
          <div className="h-3 w-full bg-slate-500/15 animate-pulse rounded-full" />
        </div>
      </div>
    );
  }

  if (error || !state || !activeAgent) {
    return (
      <div className="min-h-screen theme-app flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl theme-surface p-6 space-y-4">
          <h1 className="text-base font-bold">Graph Engine Offline</h1>
          <p className="text-xs theme-text-secondary">{error}</p>
          <button
            type="button"
            onClick={fetchGraphState}
            className="bubble-emerald px-5 py-2 text-xs font-semibold"
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
    claude_code: `# 1. Download the zero-dependency MCP Bridge into your repo
curl -sL "${originUrl}/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}" -o engram-mcp-bridge.mjs

# 2. Connect Claude Code CLI in 1 command
claude mcp add engram-memory -e ENGRAM_URL="${originUrl}" -e ENGRAM_CLIENT="Claude Code CLI" -- node ./engram-mcp-bridge.mjs`,
    openai_codex: `# 1. Download the MCP Bridge & AGENTS.md into your repo
curl -sL "${originUrl}/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}" -o engram-mcp-bridge.mjs

# 2. Add to ~/.codex/config.json
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
}`,
    cursor_vscode: `// Save as .cursor/mcp.json (Cursor) or .vscode/mcp.json (VS Code)
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
    typescript: `const ENGRAM_URL = "${originUrl}";
const AGENT_ID = "${activeAgent.id}";

// 1. Read lightweight Sub-Topic Summaries
const index = await fetch(\`\${ENGRAM_URL}/api/v1/index?agentId=\${AGENT_ID}\`).then(r => r.json());

// 2. Pull a Sub-Topic on demand
const mounted = await fetch(\`\${ENGRAM_URL}/api/v1/checkout\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agentId: AGENT_ID, subtopicId: "${sampleSubId}" })
}).then(r => r.json());

// 3. Send Sub-Topic back to graph when finished
await fetch(\`\${ENGRAM_URL}/api/v1/release\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ agentId: AGENT_ID, subtopicId: "${sampleSubId}" })
});`,
    python: `import requests

ENGRAM_URL = "${originUrl}"
AGENT_ID = "${activeAgent.id}"

# 1. Read Sub-Topic Summaries
index = requests.get(f"{ENGRAM_URL}/api/v1/index", params={"agentId": AGENT_ID}).json()

# 2. Pull Sub-Topic on demand
sub = requests.post(f"{ENGRAM_URL}/api/v1/checkout", json={"agentId": AGENT_ID, "subtopicId": "${sampleSubId}"}).json()

# 3. Release back to FalkorDB
requests.post(f"{ENGRAM_URL}/api/v1/release", json={"agentId": AGENT_ID, "subtopicId": "${sampleSubId}"})`,
  };

  return (
    <div className="min-h-screen flex flex-col theme-app">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 border-b border-slate-500/15 theme-surface backdrop-blur">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="font-display text-lg font-bold tracking-tight whitespace-nowrap"
        >
          EngramGraph
        </a>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold theme-text-secondary">
          <button
            type="button"
            onClick={() => setActiveView('home')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'home'
                ? 'text-emerald-500 underline decoration-emerald-500 decoration-2 underline-offset-8'
                : 'hover:opacity-80'
            }`}
          >
            Graph Home
          </button>
          <button
            type="button"
            onClick={() => setActiveView('readme')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'readme'
                ? 'text-emerald-500 underline decoration-emerald-500 decoration-2 underline-offset-8'
                : 'hover:opacity-80'
            }`}
          >
            README Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveView('workflows')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'workflows'
                ? 'text-emerald-500 underline decoration-emerald-500 decoration-2 underline-offset-8'
                : 'hover:opacity-80'
            }`}
          >
            Workflows
          </button>
          <button
            type="button"
            onClick={() => setActiveView('builder')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'builder'
                ? 'text-emerald-500 underline decoration-emerald-500 decoration-2 underline-offset-8'
                : 'hover:opacity-80'
            }`}
          >
            Models & Agents
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sdk')}
            className={`py-1 transition-colors whitespace-nowrap ${
              activeView === 'sdk'
                ? 'text-emerald-500 underline decoration-emerald-500 decoration-2 underline-offset-8'
                : 'hover:opacity-80'
            }`}
          >
            Connect IDE
          </button>
        </nav>

        {/* Zone 3: Theme Toggle + New Sub-Topic Action */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="bubble-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
            title="Toggle White / Dark Theme"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-600" />
                <span>Dark</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsNewSubtopicOpen(true)}
            className="bubble-emerald inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Sub-Topic
          </button>
        </div>
      </header>

      {/* Open Workspace Body: Clean Left Sidebar + Spacious Center Stage */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto gap-6 p-4 sm:p-6">
        {/* Clean, Bubbly Left Sidebar */}
        <aside className="w-full lg:w-[255px] shrink-0 rounded-3xl theme-surface p-5 flex flex-col justify-between gap-6 h-fit">
          <div className="space-y-6">
            {/* Project Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold theme-text-muted">Project</span>
                <button
                  type="button"
                  onClick={() => setIsNewWorkspaceOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:underline"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New
                </button>
              </div>
              <select
                aria-label="Select Project Workspace"
                value={state.rootGraphId}
                onChange={(e) => handleSwitchWorkspace(e.target.value)}
                className="w-full rounded-2xl theme-elevated px-3.5 py-2.5 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                {(state.workspaces || []).map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Navigation Bubbles */}
            <div className="space-y-1.5">
              {[
                { id: 'home', label: 'Graph Home', icon: Compass },
                { id: 'readme', label: 'README & Guide', icon: BookOpen },
                { id: 'workflows', label: 'Workflows', icon: GitBranch },
                { id: 'builder', label: 'Models & Agents', icon: Cpu },
                { id: 'sdk', label: 'Claude Code & Codex', icon: Code2 },
                { id: 'activity', label: 'Cypher Log', icon: Activity },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveView(item.id as ActiveView)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                      active
                        ? 'bg-emerald-500 text-slate-950 shadow-xs'
                        : 'theme-text-secondary hover:opacity-85'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 1-Click Quick Demos */}
            <div className="space-y-2 pt-2 border-t border-slate-500/15">
              <div className="text-xs font-semibold theme-text-muted px-1">
                1-Click Examples
              </div>
              <div className="space-y-2">
                {QUICK_EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={isRunningTask}
                    onClick={() => {
                      setActiveView('home');
                      setTaskPrompt(ex.prompt);
                      if (ex.agents[0]) setSelectedAgentId(ex.agents[0]);
                      handleRunTask(ex.prompt, ex.agents, ex.swapTo);
                    }}
                    className="w-full text-left p-3 rounded-2xl theme-elevated hover:border-emerald-500/60 transition-all group"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{ex.title}</span>
                      <Play className="w-3 h-3 text-emerald-500 shrink-0" />
                    </div>
                    <p className="text-[11px] theme-text-secondary mt-0.5">{ex.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Shared Graph Paths */}
            {state.savedPaths.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-500/15">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold theme-text-muted">
                    Saved Paths
                  </span>
                  {highlightedPathId && (
                    <button
                      type="button"
                      onClick={() => setHighlightedPathId(null)}
                      className="text-[11px] text-amber-500 font-semibold hover:underline"
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
                        className={`w-full text-left px-3 py-2 rounded-2xl text-xs border transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500/10 font-semibold'
                            : 'theme-elevated'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Route className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">{p.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Bottom Actions */}
          <div className="space-y-2 pt-4 border-t border-slate-500/15">
            {totalMountedCount > 0 && (
              <button
                type="button"
                onClick={handleReleaseAllLeases}
                className="bubble-rose w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Return All ({totalMountedCount})
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsIngestModalOpen(true)}
                className="bubble-btn flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                Ingest Docs
              </button>
              <button
                type="button"
                onClick={() => setIsFalkorDrawerOpen(true)}
                className="bubble-btn flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold"
              >
                <Database className="w-3.5 h-3.5 text-emerald-500" />
                FalkorDB
              </button>
            </div>
          </div>
        </aside>

        {/* Spacious Center Stage */}
        <main className="flex-1 space-y-6 min-w-0">
          {/* Friendly Bubble Toast */}
          {toastMessage && (
            <div className="rounded-full theme-surface border-emerald-500/40 px-5 py-2.5 text-xs font-medium flex items-center justify-between">
              <span>{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-emerald-500 font-semibold ml-4 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Top Agent & Model Switcher Bubble Bar */}
          <div className="rounded-3xl theme-surface p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Agent Bubbles */}
            <div className="flex flex-wrap items-center gap-2">
              {state.agents.map((ag) => {
                const isSelected = ag.id === activeAgent.id;
                const count = ag.mountedSubtopicIds.length;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => setSelectedAgentId(ag.id)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bubble-emerald'
                        : 'bubble-btn'
                    }`}
                  >
                    <span>{ag.name}</span>
                    {count > 0 && (
                      <span className="font-mono text-[10px] opacity-90">
                        ({count} loaded)
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Model Switcher + Memory Saved Indicator */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full theme-elevated px-3.5 py-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-emerald-500" />
                <select
                  aria-label="Switch Agent Model"
                  value={activeAgent.activeModelId}
                  onChange={(e) => handleSwitchAgentModel(activeAgent.id, e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs font-mono theme-text-secondary px-2">
                <strong>{tokenStats.savedPct}%</strong> memory saved in graph
              </div>
            </div>
          </div>

          {/* VIEW 1: OPEN BUBBLY HOME STAGE */}
          {activeView === 'home' && (
            <div className="space-y-6">
              {/* Bubbly Pill Prompt Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunTask();
                }}
                className="rounded-3xl theme-surface p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
              >
                <input
                  type="text"
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder={`Ask ${activeAgent.name} (${activeAgent.activeModelLabel}) to inspect or update the graph...`}
                  className="flex-1 bg-transparent px-4 py-2 text-xs sm:text-sm focus:outline-none"
                />

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Optional Mid-Task Model Switch"
                    value={midRunSwapModelId}
                    onChange={(e) => setMidRunSwapModelId(e.target.value)}
                    className="rounded-full theme-elevated px-3.5 py-2 text-xs font-medium focus:outline-none"
                  >
                    <option value="">Keep {activeAgent.activeModelLabel}</option>
                    {availableModels
                      .filter((m) => m.id !== activeAgent.activeModelId)
                      .map((m) => (
                        <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                          Swap mid-run → {m.label}
                        </option>
                      ))}
                  </select>

                  <button
                    type="submit"
                    disabled={isRunningTask || !taskPrompt.trim()}
                    className="bubble-emerald inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
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

              {/* Latest Run Output Bubble */}
              {latestRun && (
                <div className="rounded-3xl theme-surface p-5 space-y-2 border-emerald-500/40">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-500">
                    <span>
                      Completed across {latestRun.modelsUsed?.join(' → ')} ({latestRun.steps.length} steps)
                    </span>
                    <button
                      type="button"
                      onClick={() => setLatestRun(null)}
                      className="theme-text-muted hover:underline"
                    >
                      Close
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm theme-text-secondary leading-relaxed whitespace-pre-wrap">
                    {latestRun.finalSynthesis}
                  </p>
                </div>
              )}

              {/* Open Interactive Bubble Graph + Single Selected Bubble Card */}
              <HierarchicalGraphCanvas
                state={state}
                theme={theme}
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
            </div>
          )}

          {/* VIEW 2: DEDICATED IN-APP README & VISUAL GUIDE */}
          {activeView === 'readme' && (
            <div className="space-y-6">
              {/* Hero Welcome Bubble */}
              <div className="rounded-3xl theme-surface p-7 space-y-3">
                <div className="text-xs font-semibold text-emerald-500">
                  README & Interactive Guide
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold">
                  How EngramGraph Works & How to Use It
                </h1>
                <p className="text-sm theme-text-secondary max-w-2xl leading-relaxed">
                  EngramGraph gives all your AI agents and IDEs (Claude Code, OpenAI Codex, Cursor, ChatGPT, and Gemini) a single shared FalkorDB memory graph—so agents only load the exact sub-topic bubble they need and never lose context when you switch models.
                </p>
              </div>

              {/* The 5 Core Rules in Clean Bubbly Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  {
                    step: '01. Main Graph & Sub-Topics',
                    title: 'Context Split into Bubbles',
                    body: 'Instead of one giant prompt, your project is split into distinct Sub-Topic bubbles (like Architecture, Security, or SRE).',
                  },
                  {
                    step: '02. Summary-Only Default',
                    title: '85%+ Token Savings',
                    body: 'Agents never hold the whole graph at once. By default, every agent holds only a 2-sentence summary of each Sub-Topic.',
                  },
                  {
                    step: '03. Pull, Update & Send Back',
                    title: 'On-Demand Memory Paging',
                    body: 'Agents pull a Sub-Topic bubble only when needed, commit new memories + updated summaries, and send it back to the graph when done.',
                  },
                ].map((card, idx) => (
                  <div key={idx} className="rounded-3xl theme-surface p-6 space-y-2">
                    <div className="text-xs font-semibold text-emerald-500">{card.step}</div>
                    <h3 className="text-base font-bold">{card.title}</h3>
                    <p className="text-xs sm:text-sm theme-text-secondary leading-relaxed">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>

              {/* How to Use the App (4 Interactive Action Cards) */}
              <div className="rounded-3xl theme-surface p-7 space-y-5">
                <h2 className="text-lg font-bold">Quick Start — 4 Ways to Use EngramGraph</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl theme-elevated p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold">
                        1. Pull & Send Back Sub-Topics on the Graph
                      </h3>
                      <p className="text-xs theme-text-secondary leading-relaxed">
                        Click any bubble on the Graph Home canvas, then click <strong>Pull into Agent</strong> to mount its memories, or <strong>Send Back to Graph</strong> to free memory.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('home')}
                      className="bubble-emerald w-fit px-4 py-2 text-xs font-semibold"
                    >
                      Open Graph Home
                    </button>
                  </div>

                  <div className="rounded-2xl theme-elevated p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold">
                        2. Ingest Your Own Docs or Create a Project
                      </h3>
                      <p className="text-xs theme-text-secondary leading-relaxed">
                        Paste any PRD, architecture doc, or README and let EngramGraph automatically split it into Sub-Topic bubbles and Memory Nodes.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsIngestModalOpen(true)}
                      className="bubble-btn w-fit px-4 py-2 text-xs font-semibold"
                    >
                      Ingest Document Now
                    </button>
                  </div>

                  <div className="rounded-2xl theme-elevated p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold">
                        3. Switch Models & Build Multi-Agent Workflows
                      </h3>
                      <p className="text-xs theme-text-secondary leading-relaxed">
                        Hot-swap any agent between Claude, ChatGPT, Gemini, or your own custom vLLM/Ollama models with zero context loss, or chain them in a Workflow.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveView('workflows')}
                        className="bubble-btn px-4 py-2 text-xs font-semibold"
                      >
                        Open Workflows
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveView('builder')}
                        className="bubble-btn px-4 py-2 text-xs font-semibold"
                      >
                        Models & Agents
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl theme-elevated p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-bold">
                        4. Connect Claude Code, OpenAI Codex & Cursor
                      </h3>
                      <p className="text-xs theme-text-secondary leading-relaxed">
                        Download <code className="font-mono text-emerald-500">engram-mcp-bridge.mjs</code>, <code className="font-mono text-emerald-500">CLAUDE.md</code>, or <code className="font-mono text-emerald-500">AGENTS.md</code> to connect your local IDE directly to this graph.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveView('sdk')}
                      className="bubble-emerald w-fit px-4 py-2 text-xs font-semibold"
                    >
                      Connect IDE / CLI
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: CUSTOM MULTI-AGENT WORKFLOW BUILDER & RUNNER */}
          {activeView === 'workflows' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-3xl theme-surface p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-bold">Saved Workflow Pipelines</h2>
                    <p className="text-xs theme-text-secondary">
                      Chain multiple agents and models over the shared graph.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {(state.workflows || []).map((wf) => {
                      const isRunningThis = runningWorkflowId === wf.id;
                      return (
                        <div
                          key={wf.id}
                          className="rounded-2xl theme-elevated p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold">{wf.name}</h3>
                              <p className="text-xs theme-text-secondary mt-0.5">
                                {wf.description}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteWorkflow(wf.id)}
                              className="theme-text-muted hover:text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between pt-2">
                            <span className="text-xs font-mono theme-text-muted">
                              {wf.stages.length} stages
                            </span>
                            <button
                              type="button"
                              disabled={Boolean(runningWorkflowId)}
                              onClick={() => handleRunWorkflow(wf.id)}
                              className="bubble-emerald inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                            >
                              {isRunningThis ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Running…
                                </>
                              ) : (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Run Pipeline
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 rounded-3xl theme-surface p-6 space-y-4 h-fit">
                <div>
                  <h3 className="text-base font-bold">Build New Multi-Stage Workflow</h3>
                  <p className="text-xs theme-text-secondary">
                    Assign an agent and model to each stage.
                  </p>
                </div>

                <form onSubmit={handleSaveWorkflow} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      placeholder="Workflow Name"
                      className="rounded-2xl theme-elevated px-4 py-2.5 text-xs focus:outline-none"
                    />
                    <input
                      type="text"
                      value={wfDescription}
                      onChange={(e) => setWfDescription(e.target.value)}
                      placeholder="Short description"
                      className="rounded-2xl theme-elevated px-4 py-2.5 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">
                        Stages ({wfStages.length})
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
                        className="text-xs text-emerald-500 font-semibold hover:underline"
                      >
                        + Add Stage
                      </button>
                    </div>

                    {wfStages.map((stage, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl theme-elevated space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-emerald-500">
                            Stage {idx + 1}
                          </span>
                          {wfStages.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setWfStages((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-[11px] theme-text-muted hover:text-rose-500"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <select
                            value={stage.agentId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setWfStages((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, agentId: val } : s))
                              );
                            }}
                            className="rounded-xl theme-surface px-3 py-2 text-xs"
                          >
                            {state.agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.role})
                              </option>
                            ))}
                          </select>

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
                            className="rounded-xl theme-surface px-3 py-2 text-xs font-mono"
                          >
                            {availableModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
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
                          placeholder="What should this stage inspect and commit?"
                          className="w-full rounded-xl theme-surface px-3.5 py-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bubble-emerald px-5 py-2.5 text-xs font-semibold"
                    >
                      Save Workflow
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* VIEW 4: BRING YOUR OWN MODELS & AGENTS */}
          {activeView === 'builder' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-3xl theme-surface p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold">Custom Model Registry</h2>
                  <p className="text-xs theme-text-secondary">
                    Add your own Ollama, vLLM, DeepSeek, Claude, or OpenAI models.
                  </p>
                </div>

                <form onSubmit={handleRegisterCustomModel} className="space-y-3 border-b border-slate-500/15 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={customModelId}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="Model ID (e.g. deepseek-r1)"
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={customModelLabel}
                      onChange={(e) => setCustomModelLabel(e.target.value)}
                      placeholder="Display Label"
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={customModelProvider}
                      onChange={(e) =>
                        setCustomModelProvider(e.target.value as ModelProvider)
                      }
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs"
                    >
                      <option value="Self-Hosted vLLM / Ollama">Self-Hosted vLLM / Ollama</option>
                      <option value="DeepSeek / OpenWeights">DeepSeek / OpenWeights</option>
                      <option value="Anthropic Claude">Anthropic Claude</option>
                      <option value="OpenAI ChatGPT">OpenAI ChatGPT</option>
                      <option value="Google Gemini">Google Gemini</option>
                    </select>
                    <input
                      type="text"
                      value={customModelRoute}
                      onChange={(e) => setCustomModelRoute(e.target.value)}
                      placeholder="Endpoint route"
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs font-mono"
                    />
                  </div>

                  <button
                    type="submit"
                    className="bubble-emerald px-5 py-2 text-xs font-semibold"
                  >
                    + Register Model
                  </button>
                </form>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableModels.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-3 rounded-2xl theme-elevated text-xs"
                    >
                      <div>
                        <div className="font-bold">{m.label}</div>
                        <div className="font-mono text-[11px] theme-text-muted">
                          {m.id} · {m.provider}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSwitchAgentModel(activeAgent.id, m.id)}
                        className="bubble-btn px-3 py-1.5 text-[11px] font-semibold"
                      >
                        Use on {activeAgent.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl theme-surface p-6 space-y-5">
                <div>
                  <h2 className="text-base font-bold">Create Custom Agent</h2>
                  <p className="text-xs theme-text-secondary">
                    Add specialized agents that share this workspace graph.
                  </p>
                </div>

                <form onSubmit={handleCreateCustomAgent} className="space-y-3 border-b border-slate-500/15 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                      placeholder="Agent Name (e.g. Sentinel)"
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs"
                    />
                    <input
                      type="text"
                      required
                      value={newAgentRole}
                      onChange={(e) => setNewAgentRole(e.target.value)}
                      placeholder="Role (e.g. FinOps Auditor)"
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs"
                    />
                  </div>

                  <select
                    value={newAgentModelId}
                    onChange={(e) => setNewAgentModelId(e.target.value)}
                    className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs font-mono"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.provider})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={newAgentSpecialty}
                    onChange={(e) => setNewAgentSpecialty(e.target.value)}
                    placeholder="Specialty description"
                    className="w-full rounded-2xl theme-elevated px-3.5 py-2 text-xs"
                  />

                  <button
                    type="submit"
                    className="bubble-emerald px-5 py-2 text-xs font-semibold"
                  >
                    + Create Agent
                  </button>
                </form>

                <div className="space-y-2">
                  {state.agents.map((ag) => (
                    <div
                      key={ag.id}
                      className="flex items-center justify-between p-3 rounded-2xl theme-elevated text-xs"
                    >
                      <div>
                        <div className="font-bold">
                          {ag.name} · <span className="font-normal theme-text-secondary">{ag.role}</span>
                        </div>
                        <div className="font-mono text-[11px] text-emerald-500">
                          {ag.activeModelLabel}
                        </div>
                      </div>
                      {state.agents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(ag.id)}
                          className="theme-text-muted hover:text-rose-500 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: CLAUDE CODE, OPENAI CODEX, CURSOR & VS CODE MCP HUB */}
          {activeView === 'sdk' && (
            <div className="space-y-6">
              <div className="rounded-3xl theme-surface p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <h2 className="text-base font-bold">
                    Connect Claude Code, OpenAI Codex CLI & Cursor
                  </h2>
                  <p className="text-xs theme-text-secondary leading-relaxed">
                    Download the zero-dependency MCP bridge and instruction files to connect any local IDE or CLI agent directly to project <code className="font-mono text-emerald-500">{state.rootGraphId}</code>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={`/api/ide/engram-mcp-bridge.mjs?origin=${encodeURIComponent(originUrl)}&agentId=${activeAgent.id}`}
                    download="engram-mcp-bridge.mjs"
                    className="bubble-emerald inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    engram-mcp-bridge.mjs
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDownloadTextFile('CLAUDE.md', claudeMdContent)}
                    className="bubble-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    CLAUDE.md
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTextFile('AGENTS.md', codexAgentsMdContent)}
                    className="bubble-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    AGENTS.md (Codex)
                  </button>
                </div>
              </div>

              <div className="rounded-3xl theme-surface overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-500/15 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'claude_code', label: 'Claude Code CLI' },
                        { id: 'openai_codex', label: 'OpenAI Codex CLI' },
                        { id: 'cursor_vscode', label: 'Cursor / VS Code' },
                        { id: 'typescript', label: 'TypeScript' },
                        { id: 'python', label: 'Python' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSdkTab(tab.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                          sdkTab === tab.id
                            ? 'bg-emerald-500 text-slate-950'
                            : 'theme-text-secondary hover:opacity-80'
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
                    className="bubble-btn inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
                  >
                    {copiedSdk ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedSdk ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <pre className="p-5 font-mono text-xs overflow-x-auto leading-relaxed">
                  {sdkSnippets[sdkTab]}
                </pre>
              </div>

              {/* Live MCP Tool Simulator */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 rounded-3xl theme-surface p-6 space-y-4">
                  <h3 className="text-sm font-bold">Test Live IDE MCP Calls</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={simIdeClient}
                      onChange={(e) => setSimIdeClient(e.target.value as IdeClientType)}
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs font-semibold"
                    >
                      <option value="Claude Code CLI">Claude Code CLI</option>
                      <option value="OpenAI Codex CLI">OpenAI Codex CLI</option>
                      <option value="Cursor IDE">Cursor IDE</option>
                      <option value="VS Code Copilot">VS Code Copilot</option>
                    </select>

                    <select
                      value={sampleSubId}
                      onChange={(e) => setSelectedSubtopicId(e.target.value)}
                      className="rounded-2xl theme-elevated px-3.5 py-2 text-xs font-mono"
                    >
                      {state.subtopics.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() => handleExecuteMcpTool('tools/call', 'engram_get_index')}
                      className="bubble-btn p-3 text-left"
                    >
                      <div className="font-mono text-xs font-bold text-emerald-500">
                        1. Get Summary Index
                      </div>
                      <div className="text-[11px] theme-text-secondary">
                        engram_get_index
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() =>
                        handleExecuteMcpTool('tools/call', 'engram_checkout_subtopic', {
                          subtopicId: sampleSubId,
                        })
                      }
                      className="bubble-btn p-3 text-left"
                    >
                      <div className="font-mono text-xs font-bold text-emerald-500">
                        2. Pull Sub-Topic
                      </div>
                      <div className="text-[11px] theme-text-secondary">
                        engram_checkout_subtopic
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
                      className="bubble-btn p-3 text-left"
                    >
                      <div className="font-mono text-xs font-bold text-emerald-500">
                        3. Commit Memory
                      </div>
                      <div className="text-[11px] theme-text-secondary">
                        engram_commit_memory
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isCallingMcp}
                      onClick={() =>
                        handleExecuteMcpTool('tools/call', 'engram_release_subtopic', {
                          subtopicId: sampleSubId,
                        })
                      }
                      className="bubble-rose p-3 text-left"
                    >
                      <div className="font-mono text-xs font-bold">
                        4. Send Back
                      </div>
                      <div className="text-[11px] opacity-80">
                        engram_release_subtopic
                      </div>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-3xl theme-surface p-6 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-emerald-500 font-semibold">
                      Live MCP Response ({simIdeClient})
                    </span>
                    <button
                      type="button"
                      onClick={handleExportWorkspaceJson}
                      className="text-xs font-semibold theme-text-secondary hover:underline"
                    >
                      Export Workspace JSON
                    </button>
                  </div>
                  <pre className="flex-1 rounded-2xl theme-elevated p-4 font-mono text-[11px] max-h-60 overflow-y-auto leading-relaxed">
                    {liveApiResponse ||
                      `// Click any of the 4 buttons on the left to test a live MCP call from ${simIdeClient}.`}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 6: CLEAN ACTIVITY & CYPHER LOG */}
          {activeView === 'activity' && (
            <div className="rounded-3xl theme-surface p-6 space-y-4">
              <div>
                <h2 className="text-base font-bold">Cypher & Model Switch Log</h2>
                <p className="text-xs theme-text-secondary">
                  Click any row to view the exact FalkorDB Cypher query executed.
                </p>
              </div>

              <div className="space-y-2.5">
                {[...state.traceHistory].reverse().map((step) => {
                  const isExpanded = expandedStepId === step.id;
                  return (
                    <div key={step.id} className="rounded-2xl theme-elevated p-4">
                      <div
                        onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                        className="flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs theme-text-secondary">
                            <span className="font-bold">{step.agentName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-emerald-500">{step.activeModel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px]">{step.phase}</span>
                          </div>
                          <p className="text-xs sm:text-sm">{step.summary}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs tabular-nums theme-text-muted">
                            {step.activeTokensBefore}t → {step.activeTokensAfter}t
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 theme-text-muted" />
                          ) : (
                            <ChevronRight className="w-4 h-4 theme-text-muted" />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-500/15 space-y-2">
                          <p className="text-xs theme-text-secondary">{step.detail}</p>
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-500">
                            <Terminal className="w-3 h-3" />
                            <span>FalkorDB Cypher Query</span>
                          </div>
                          <pre className="rounded-2xl theme-surface p-3.5 font-mono text-[11px] overflow-x-auto">
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
