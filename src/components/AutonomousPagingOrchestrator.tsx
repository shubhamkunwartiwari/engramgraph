import React, { useState } from 'react';
import {
  AgentRunResult,
  GraphMemoryState,
  PagingTraceStep,
  SUPPORTED_AGENT_MODELS,
} from '../types/memory.ts';
import {
  Play,
  Loader2,
  Terminal,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface AutonomousPagingOrchestratorProps {
  state: GraphMemoryState;
  isRunningTask: boolean;
  latestRun: AgentRunResult | null;
  onRunAgentTask: (params: {
    taskPrompt: string;
    agentIds: string[];
    autoEvictOnFinish: boolean;
    simulateMidRunModelSwitch?: { targetModelId: string };
  }) => Promise<void>;
  onSelectSubtopic: (subtopicId: string) => void;
}

const PRESET_SCENARIOS = [
  {
    label: 'Cross-Model Relay: Claude → ChatGPT → Gemini',
    agents: ['agent_atlas', 'agent_cipher', 'agent_nova'],
    prompt:
      'Audit our cross-region Envoy circuit breaker and Ed25519 lease rules, verify they preserve INC-409 mitigation paths across model switches, and commit a unified policy update.',
  },
  {
    label: 'Incident + Security Handoff (Nova → Cipher)',
    agents: ['agent_nova', 'agent_cipher'],
    prompt:
      'Investigate whether retry storms from regional Envoy gateways could bypass Ed25519 lease expiry during a connection pool spike, and record a joint mitigation rule in the graph.',
  },
  {
    label: 'EU Residency & Paging Budget Audit (Vanguard → Atlas)',
    agents: ['agent_vanguard', 'agent_atlas'],
    prompt:
      'Verify how EU healthcare tenant multigraph namespaces enforce the $0.004/turn token budget when cross-region read replicas are enabled, and update the architecture & product sub-topics.',
  },
  {
    label: 'Spawn New FinOps Telemetry Sub-Topic (Vanguard)',
    agents: ['agent_vanguard'],
    prompt:
      'Create a new distinct Sub-Topic branch in the main graph for "FinOps & Cross-Model Cost Telemetry" with initial memory nodes tracking per-model checkout savings.',
  },
];

export const AutonomousPagingOrchestrator: React.FC<AutonomousPagingOrchestratorProps> = ({
  state,
  isRunningTask,
  latestRun,
  onRunAgentTask,
  onSelectSubtopic,
}) => {
  const [taskPrompt, setTaskPrompt] = useState<string>(PRESET_SCENARIOS[0].prompt);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(['agent_atlas', 'agent_cipher']);
  const [autoEvictOnFinish, setAutoEvictOnFinish] = useState<boolean>(true);
  const [enableMidRunSwap, setEnableMidRunSwap] = useState<boolean>(true);
  const [midRunTargetModelId, setMidRunTargetModelId] = useState<string>('gpt-4o');
  const [expandedStepId, setExpandedStepId] = useState<string | null>(
    state.traceHistory[state.traceHistory.length - 1]?.id || null
  );
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');

  const toggleAgentInChain = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(agentId)) {
        if (prev.length === 1) return prev;
        return prev.filter((id) => id !== agentId);
      }
      return [...prev, agentId];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskPrompt.trim() || isRunningTask) return;
    await onRunAgentTask({
      taskPrompt: taskPrompt.trim(),
      agentIds: selectedAgentIds,
      autoEvictOnFinish,
      simulateMidRunModelSwitch: enableMidRunSwap
        ? { targetModelId: midRunTargetModelId }
        : undefined,
    });
  };

  const filteredTrace = [...state.traceHistory]
    .reverse()
    .filter((step) => (phaseFilter === 'ALL' ? true : step.phase === phaseFilter));

  const formatPhaseLabel = (phase: PagingTraceStep['phase']) => {
    switch (phase) {
      case 'INDEX_SCAN':
        return '1. Summary Index Scan';
      case 'PAGE_IN_CHECKOUT':
        return '2. Page-In Checkout';
      case 'MODEL_HOT_SWAP':
        return 'Model Hot-Swap (0 Loss)';
      case 'GRAPH_COMMIT':
        return '3. Graph & Summary Commit';
      case 'PAGE_OUT_RELEASE':
        return '4. Page-Out Eviction';
      case 'SUBTOPIC_SPLIT':
        return 'Sub-Topic Created';
      default:
        return phase;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Multi-Agent & Cross-Model Task Dispatcher */}
      <div className="lg:col-span-5 flex flex-col border border-slate-800 bg-[#0F1522]">
        <div className="border-b border-slate-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">
            Model-Agnostic Agent Paging Runner
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Agents run across Claude, ChatGPT, and Gemini. Switching models mid-task preserves all sub-topic leases, nodes, and graph paths.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 flex flex-col">
          {/* Preset Scenarios */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Cross-Model & Paging Scenario Templates
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_SCENARIOS.map((scen, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTaskPrompt(scen.prompt);
                    setSelectedAgentIds(scen.agents);
                  }}
                  className="text-left px-3 py-2 text-xs bg-[#0B0F17] border border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white transition-colors truncate"
                >
                  <span className="font-medium text-emerald-400">{scen.label}: </span>
                  {scen.prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Execution Chain Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-300">
                Agent & Active Model Chain (Click to toggle order)
              </label>
              <span className="font-mono text-[11px] text-slate-400">
                {selectedAgentIds.length > 1 ? 'Multi-Agent / Multi-Model' : 'Single Agent'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {state.agents.map((ag) => {
                const orderIdx = selectedAgentIds.indexOf(ag.id);
                const isSelected = orderIdx !== -1;
                return (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => toggleAgentInChain(ag.id)}
                    className={`flex items-center justify-between px-3 py-2 text-xs border text-left transition-colors ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="truncate">
                      <span className="font-semibold">{ag.name}</span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        {' '}· {ag.activeModelLabel}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="font-mono text-[11px] text-emerald-400 shrink-0 ml-1.5">
                        #{orderIdx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mid-Run Model Hot-Swap Option */}
          <div className="border border-slate-800 bg-[#0B0F17] p-3 space-y-2">
            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white">
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                Hot-swap model mid-task (after sub-topic checkout)
              </span>
              <input
                type="checkbox"
                checked={enableMidRunSwap}
                onChange={(e) => setEnableMidRunSwap(e.target.checked)}
                className="accent-emerald-500"
              />
            </label>
            {enableMidRunSwap && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-400">
                  Switch first agent mid-run to:
                </span>
                <select
                  value={midRunTargetModelId}
                  onChange={(e) => setMidRunTargetModelId(e.target.value)}
                  className="bg-[#0F1522] border border-slate-700 px-2.5 py-1 text-xs font-mono text-amber-300"
                >
                  {SUPPORTED_AGENT_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.provider})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Task Prompt Input */}
          <div className="flex-1 flex flex-col">
            <label htmlFor="agent-task-input" className="block text-xs font-medium text-slate-300 mb-1.5">
              Task / Reasoning Objective
            </label>
            <textarea
              id="agent-task-input"
              rows={3}
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              placeholder="Describe an engineering, security, incident, or product task for the agent(s)..."
              className="w-full flex-1 bg-[#0B0F17] border border-slate-800 p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          {/* Auto-Evict Context Option */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={autoEvictOnFinish}
              onChange={(e) => setAutoEvictOnFinish(e.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />
            <span className="text-xs text-slate-300 leading-snug">
              <strong className="text-white">Send context back to graph after completion:</strong> Automatically evict checked-out sub-topics (<code className="font-mono text-slate-400">release_subtopic</code>) once the agent finishes updating the graph.
            </span>
          </label>

          <button
            type="submit"
            disabled={isRunningTask || !taskPrompt.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {isRunningTask ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing Cross-Model Graph Paging…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Execute Paging Lifecycle ({selectedAgentIds.length} Agent{selectedAgentIds.length > 1 ? 's' : ''})
              </>
            )}
          </button>
        </form>

        {/* Latest Run Synthesis Output */}
        {latestRun && (
          <div className="border-t border-slate-800 bg-[#0B0F17] p-5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Cycle Complete ({latestRun.steps.length} Ops · Models: {latestRun.modelsUsed?.join(' → ') || 'Multi-Model'})
              </span>
              <span className="font-mono tabular-nums">
                Peak RAM: {latestRun.peakActiveTokens}t · Saved: {latestRun.fullGraphTokensAvoided}t
              </span>
            </div>
            <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto pr-1">
              {latestRun.finalSynthesis}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Live Paging Trace & Cypher Execution Ledger */}
      <div className="lg:col-span-7 flex flex-col border border-slate-800 bg-[#0F1522]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Live Context Paging, Model Hot-Swap & Cypher Ledger
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Every index scan, sub-topic checkout, model switch (Claude ↔ ChatGPT ↔ Gemini), graph commit, and context eviction.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-[#0B0F17] p-1 border border-slate-800 overflow-x-auto">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'PAGE_IN_CHECKOUT', label: 'Page-In' },
              { id: 'MODEL_HOT_SWAP', label: 'Model Swaps' },
              { id: 'GRAPH_COMMIT', label: 'Commits' },
              { id: 'PAGE_OUT_RELEASE', label: 'Page-Out' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPhaseFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  phaseFilter === tab.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-800 max-h-[640px] overflow-y-auto">
          {filteredTrace.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No trace events match the selected filter.
            </div>
          ) : (
            filteredTrace.map((step) => {
              const isExpanded = expandedStepId === step.id;
              const tokenDelta = step.activeTokensAfter - step.activeTokensBefore;

              return (
                <div key={step.id} className="p-4 hover:bg-[#121A2B] transition-colors">
                  <div
                    className="flex items-start justify-between gap-3 cursor-pointer"
                    onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-slate-500">#{step.stepNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-200">Agent {step.agentName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-300">{step.activeModel}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            step.phase === 'PAGE_IN_CHECKOUT'
                              ? 'text-emerald-400 font-medium'
                              : step.phase === 'MODEL_HOT_SWAP'
                              ? 'text-purple-400 font-medium'
                              : step.phase === 'GRAPH_COMMIT'
                              ? 'text-amber-400 font-medium'
                              : step.phase === 'PAGE_OUT_RELEASE'
                              ? 'text-rose-400 font-medium'
                              : 'text-sky-400 font-medium'
                          }
                        >
                          {formatPhaseLabel(step.phase)}
                        </span>
                        {step.subtopicName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (step.subtopicId) onSelectSubtopic(step.subtopicId);
                              }}
                              className="underline decoration-slate-600 underline-offset-2 hover:text-white"
                            >
                              {step.subtopicName}
                            </button>
                          </>
                        )}
                      </div>

                      <p className="text-xs font-medium text-slate-100">{step.summary}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{step.detail}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-xs tabular-nums text-slate-300">
                        {step.activeTokensBefore}t → {step.activeTokensAfter}t
                        {tokenDelta !== 0 && (
                          <span
                            className={`ml-1 ${
                              tokenDelta > 0 ? 'text-emerald-400' : 'text-sky-400'
                            }`}
                          >
                            ({tokenDelta > 0 ? `+${tokenDelta}` : tokenDelta}t)
                          </span>
                        )}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-800/80">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                        <span className="inline-flex items-center gap-1.5 font-mono">
                          <Terminal className="w-3 h-3 text-emerald-400" />
                          FalkorDB Cypher Query Executed
                        </span>
                        <span className="font-mono tabular-nums">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <pre className="bg-[#0B0F17] border border-slate-800 p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto leading-relaxed">
                        {step.cypherQuery}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
