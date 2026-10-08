import React, { useMemo, useState } from 'react';
import {
  GraphMemoryState,
  SubTopic,
  SUPPORTED_AGENT_MODELS,
} from '../types/memory.ts';
import {
  Unlock,
  Lock,
  Plus,
  RotateCcw,
  RefreshCw,
  Route,
  Copy,
  Check,
} from 'lucide-react';

interface AgentWorkingMemoryInspectorProps {
  state: GraphMemoryState;
  selectedAgentId: string;
  highlightedPathId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSwitchAgentModel: (agentId: string, modelId: string) => Promise<void>;
  onCheckoutSubtopic: (agentId: string, subtopicId: string) => void;
  onReleaseSubtopic: (agentId: string, subtopicId: string) => void;
  onReleaseAllLeases: () => void;
  onOpenMutateModal: (subtopicId: string) => void;
  onSelectSubtopicInGraph: (subtopicId: string) => void;
  onSelectPathInGraph: (pathId: string | null) => void;
}

export const AgentWorkingMemoryInspector: React.FC<AgentWorkingMemoryInspectorProps> = ({
  state,
  selectedAgentId,
  highlightedPathId,
  onSelectAgent,
  onSwitchAgentModel,
  onCheckoutSubtopic,
  onReleaseSubtopic,
  onReleaseAllLeases,
  onOpenMutateModal,
  onSelectSubtopicInGraph,
  onSelectPathInGraph,
}) => {
  const [switchingModel, setSwitchingModel] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  const activeAgent = useMemo(
    () => state.agents.find((a) => a.id === selectedAgentId) || state.agents[0],
    [state.agents, selectedAgentId]
  );

  const tokenMetrics = useMemo(() => {
    const summaryIndexTokens = state.subtopics.reduce((acc, s) => acc + s.summaryTokenCount, 0);
    const totalFullGraphTokens = state.subtopics.reduce((acc, s) => acc + s.fullTokenCount, 0);

    let mountedSubtopicTokens = 0;
    for (const subId of activeAgent.mountedSubtopicIds) {
      const sub = state.subtopics.find((s) => s.id === subId);
      if (sub) {
        mountedSubtopicTokens += Math.max(0, sub.fullTokenCount - sub.summaryTokenCount);
      }
    }

    const totalActiveTokens = summaryIndexTokens + mountedSubtopicTokens;
    const pagedOutTokens = Math.max(0, totalFullGraphTokens - totalActiveTokens);
    const compressionSavingsPct =
      totalFullGraphTokens > 0
        ? Math.round((pagedOutTokens / totalFullGraphTokens) * 100)
        : 0;

    return {
      summaryIndexTokens,
      mountedSubtopicTokens,
      totalActiveTokens,
      totalFullGraphTokens,
      pagedOutTokens,
      compressionSavingsPct,
    };
  }, [state.subtopics, activeAgent]);

  const mountedSubtopics = useMemo(
    () => state.subtopics.filter((s) => activeAgent.mountedSubtopicIds.includes(s.id)),
    [state.subtopics, activeAgent.mountedSubtopicIds]
  );

  const totalActiveLeasesAcrossAllAgents = useMemo(
    () => state.agents.reduce((acc, a) => acc + a.mountedSubtopicIds.length, 0),
    [state.agents]
  );

  const handleModelChange = async (newModelId: string) => {
    if (newModelId === activeAgent.activeModelId || switchingModel) return;
    setSwitchingModel(true);
    try {
      await onSwitchAgentModel(activeAgent.id, newModelId);
    } finally {
      setSwitchingModel(false);
    }
  };

  const handleCopyPortableContextBundle = () => {
    const payload = {
      protocol: 'EngramGraph-Model-Agnostic-Memory-v1',
      agentId: activeAgent.id,
      agentName: activeAgent.name,
      currentModel: activeAgent.activeModelLabel,
      rootGraphId: state.rootGraphId,
      alwaysResidentSubtopicSummaries: state.subtopics.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        version: s.version,
        summary: s.summary,
      })),
      currentlyMountedSubtopics: mountedSubtopics.map((s) => ({
        id: s.id,
        name: s.name,
        nodes: state.nodes.filter((n) => n.subtopicId === s.id),
      })),
      sharedGraphPaths: state.savedPaths,
      endpoints: {
        checkoutSubtopic: 'POST /api/graph/checkout { agentId, subtopicId, reason }',
        mutateSubtopic: 'POST /api/graph/mutate { agentId, subtopicId, newNodes, updatedSummary, commitMessage }',
        releaseSubtopic: 'POST /api/graph/release { agentId, subtopicId, reason }',
      },
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedBundle(true);
    setTimeout(() => setCopiedBundle(false), 2500);
  };

  return (
    <div className="flex flex-col border border-slate-800 bg-[#0F1522]">
      {/* Agent Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">
            Model-Agnostic Working Memory & Paging Buffer
          </h2>
          <p className="text-xs text-slate-400">
            Switch models (Claude ↔ ChatGPT ↔ Gemini) at any time—all sub-topic summaries, mounted leases, and graph paths persist.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyPortableContextBundle}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-slate-200 border border-slate-700 hover:border-slate-500 transition-colors whitespace-nowrap"
            title="Copy portable JSON context pack for Claude / ChatGPT / MCP"
          >
            {copiedBundle ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-emerald-400" />
            )}
            {copiedBundle ? 'Copied Context Pack' : 'Copy Claude/ChatGPT Pack'}
          </button>

          {totalActiveLeasesAcrossAllAgents > 0 && (
            <button
              type="button"
              onClick={onReleaseAllLeases}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Evict All ({totalActiveLeasesAcrossAllAgents})
            </button>
          )}
        </div>
      </div>

      {/* Segmented Agent Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-800 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 bg-[#0B0F17]">
        {state.agents.map((agent) => {
          const isSelected = agent.id === activeAgent.id;
          const leaseCount = agent.mountedSubtopicIds.length;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={`flex flex-col items-start p-3 text-left transition-colors ${
                isSelected
                  ? 'bg-[#131C2E] text-white'
                  : 'text-slate-400 hover:bg-[#0F1522] hover:text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-semibold text-white">{agent.name}</span>
                <span className="font-mono text-[10px] tabular-nums text-emerald-400">
                  {leaseCount > 0 ? `${leaseCount} Mounted` : 'Index Only'}
                </span>
              </div>
              <span className="text-[11px] text-slate-300 truncate max-w-full mt-0.5 font-mono">
                {agent.activeModelLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hot-Swap Active Model Bar (Zero Context Loss Guarantee) */}
      <div className="border-b border-slate-800 bg-[#0B0F17]/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${switchingModel ? 'animate-spin' : ''}`} />
            <span className="font-semibold text-white">
              Hot-Swap {activeAgent.name}&apos;s Model:
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              ({activeAgent.modelSwitchCount} switches · 0 context lost)
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Switching between Claude, ChatGPT, and Gemini keeps all mounted sub-topics and graph paths intact.
          </p>
        </div>

        <select
          aria-label="Hot-swap agent LLM model"
          value={activeAgent.activeModelId}
          disabled={switchingModel}
          onChange={(e) => handleModelChange(e.target.value)}
          className="bg-[#0F1522] border border-emerald-500/50 px-3 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-400 shrink-0"
        >
          {SUPPORTED_AGENT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.provider}: {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Active Context RAM vs Paged-Out Graph Storage Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border-b border-slate-800 bg-[#0B0F17]/60">
        <div className="p-3">
          <div className="text-[11px] text-slate-400">Summary Index</div>
          <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-100">
            {tokenMetrics.summaryIndexTokens} <span className="text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="text-[10px] text-slate-500">Always in graph handle</div>
        </div>

        <div className="p-3">
          <div className="text-[11px] text-slate-400">Paged-In Full Nodes</div>
          <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-400">
            +{tokenMetrics.mountedSubtopicTokens} <span className="text-xs font-normal text-slate-400">tokens</span>
          </div>
          <div className="text-[10px] text-slate-500">
            {activeAgent.mountedSubtopicIds.length} sub-topic(s) mounted
          </div>
        </div>

        <div className="p-3">
          <div className="text-[11px] text-slate-400">Active Prompt Window</div>
          <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
            {tokenMetrics.totalActiveTokens} <span className="text-xs font-normal text-slate-400">/ {tokenMetrics.totalFullGraphTokens}t</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">{activeAgent.activeModelLabel}</div>
        </div>

        <div className="p-3">
          <div className="text-[11px] text-slate-400">Saved in FalkorDB</div>
          <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-sky-400">
            {tokenMetrics.compressionSavingsPct}% <span className="text-xs font-normal text-slate-400">saved</span>
          </div>
          <div className="text-[10px] text-slate-500 tabular-nums">
            {tokenMetrics.pagedOutTokens}t kept in graph
          </div>
        </div>
      </div>

      {/* Section 1: Currently Mounted (Paged-In) Full Sub-Topics */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h3 className="text-xs font-semibold text-white">
              01. Mounted Sub-Topics in {activeAgent.name} ({activeAgent.activeModelLabel})
            </h3>
            <p className="text-[11px] text-slate-400">
              Preserved across model switches until explicitly released back into FalkorDB.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {mountedSubtopics.length} mounted
          </span>
        </div>

        {mountedSubtopics.length === 0 ? (
          <div className="border border-dashed border-slate-800 bg-[#0B0F17]/70 p-3.5 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-medium text-slate-200">
                Zero full sub-topics loaded in working memory.
              </span>{' '}
              {activeAgent.name} ({activeAgent.activeModelLabel}) holds only the Sub-Topic Summary Index & Shared Paths ({tokenMetrics.summaryIndexTokens} tokens).
            </div>
            <button
              type="button"
              onClick={() => state.subtopics[0] && onCheckoutSubtopic(activeAgent.id, state.subtopics[0].id)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              Checkout Sub-Topic
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-slate-800 bg-[#0B0F17]">
            {mountedSubtopics.map((sub: SubTopic) => {
              const subNodes = state.nodes.filter((n) => n.subtopicId === sub.id);
              return (
                <div key={sub.id} className="p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-emerald-400">{sub.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">v{sub.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-emerald-300">
                          {sub.fullTokenCount} tokens loaded
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-white mt-0.5">{sub.name}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenMutateModal(sub.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Update Graph
                      </button>
                      <button
                        type="button"
                        onClick={() => onReleaseSubtopic(activeAgent.id, sub.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-rose-500/15 text-rose-200 border border-rose-500/40 hover:bg-rose-500/25 transition-colors whitespace-nowrap"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Send Back to Graph
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/80 border-t border-slate-800 pt-2">
                    {subNodes.map((node) => (
                      <div key={node.id} className="py-1.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-mono text-slate-400">{node.id}</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="text-emerald-400 font-medium">{node.kind}</span>
                            <span aria-hidden="true" className="text-slate-600">·</span>
                            <span className="font-semibold text-slate-200">{node.title}</span>
                            {node.authoredByModel && (
                              <>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  via {node.authoredByModel}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed">{node.content}</p>
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">
                          {node.tokenCount}t
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Lightweight Sub-Topic Summary Directory (Always Held by Agent) */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <div>
            <h3 className="text-xs font-semibold text-white">
              02. Sub-Topic Summary Directory (Shared Across All Models)
            </h3>
            <p className="text-[11px] text-slate-400">
              Whether {activeAgent.name} runs on Claude, ChatGPT, or Gemini, it always receives these summaries first.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {state.subtopics.length} sub-topics
          </span>
        </div>

        <div className="divide-y divide-slate-800 border border-slate-800 bg-[#0B0F17] max-h-[260px] overflow-y-auto">
          {state.subtopics.map((sub) => {
            const isMounted = activeAgent.mountedSubtopicIds.includes(sub.id);
            const nodeCount = state.nodes.filter((n) => n.subtopicId === sub.id).length;

            return (
              <div
                key={sub.id}
                className="p-3 hover:bg-[#111827] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div
                  className="space-y-1 cursor-pointer flex-1"
                  onClick={() => onSelectSubtopicInGraph(sub.id)}
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span className="font-semibold text-slate-100">{sub.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-400">{sub.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">v{sub.version}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {sub.summaryTokenCount}t summary / {sub.fullTokenCount}t full ({nodeCount}n)
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {sub.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isMounted ? (
                    <button
                      type="button"
                      onClick={() => onReleaseSubtopic(activeAgent.id, sub.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-rose-500/15 text-rose-200 border border-rose-500/40 hover:bg-rose-500/25 transition-colors whitespace-nowrap"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Send Back
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCheckoutSubtopic(activeAgent.id, sub.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-800 text-emerald-300 border border-slate-700 hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      Page In
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Persistent Multi-Hop Paths (Preserved Across Model Switches) */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Route className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-white">
              03. Persistent Multi-Hop Paths (Accessible to All Models)
            </h3>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {state.savedPaths.length} paths
          </span>
        </div>

        <div className="divide-y divide-slate-800 border border-slate-800 bg-[#0B0F17] max-h-[190px] overflow-y-auto">
          {state.savedPaths.map((p) => {
            const isHighlighted = highlightedPathId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => onSelectPathInGraph(isHighlighted ? null : p.id)}
                className={`p-3 cursor-pointer transition-colors ${
                  isHighlighted ? 'bg-amber-500/10' : 'hover:bg-[#111827]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-amber-300">{p.title}</span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    via {p.authoredByModel}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-400">
                  Sub-Topics: {p.subtopicIds.join(' → ')} · Nodes: {p.nodeIds.join(' → ')}
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-snug">{p.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
