import React, { useMemo, useState } from 'react';
import {
  GraphMemoryState,
  MemoryNode,
  SubTopic,
} from '../types/memory.ts';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
} from 'lucide-react';

interface HierarchicalGraphCanvasProps {
  state: GraphMemoryState;
  theme?: 'light' | 'dark';
  selectedAgentId: string;
  selectedSubtopicId: string | null;
  selectedNodeId: string | null;
  highlightedPathId: string | null;
  strictAgentScopeView: boolean;
  onToggleStrictScope: () => void;
  onSelectSubtopic: (subtopicId: string) => void;
  onSelectNode: (nodeId: string, subtopicId: string) => void;
  onSelectPath: (pathId: string | null) => void;
  onCheckoutSubtopic: (agentId: string, subtopicId: string) => void;
  onReleaseSubtopic: (agentId: string, subtopicId: string) => void;
  onOpenNewNodeModal: (subtopicId: string) => void;
}

export const HierarchicalGraphCanvas: React.FC<HierarchicalGraphCanvasProps> = ({
  state,
  theme = 'light',
  selectedAgentId,
  selectedSubtopicId,
  selectedNodeId,
  highlightedPathId,
  strictAgentScopeView,
  onToggleStrictScope,
  onSelectSubtopic,
  onSelectNode,
  onCheckoutSubtopic,
  onReleaseSubtopic,
  onOpenNewNodeModal,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const isLight = theme === 'light';

  const activeAgent = useMemo(
    () => state.agents.find((a) => a.id === selectedAgentId) || state.agents[0],
    [state.agents, selectedAgentId]
  );

  const activeHighlightedPath = useMemo(
    () => state.savedPaths.find((p) => p.id === highlightedPathId) || null,
    [state.savedPaths, highlightedPathId]
  );

  const isSubtopicMountedBySelectedAgent = (subId: string) =>
    activeAgent?.mountedSubtopicIds.includes(subId) ?? false;

  const layout = useMemo(() => {
    const cx = 500;
    const cy = 285;
    const subRadius = 165;

    const subtopicCoords = new Map<
      string,
      { x: number; y: number; angle: number; subtopic: SubTopic }
    >();
    const nodeCoords = new Map<
      string,
      { x: number; y: number; node: MemoryNode; subtopic: SubTopic }
    >();

    const count = Math.max(1, state.subtopics.length);
    state.subtopics.forEach((sub, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / count;
      const sx = cx + Math.cos(angle) * subRadius;
      const sy = cy + Math.sin(angle) * subRadius;
      subtopicCoords.set(sub.id, { x: sx, y: sy, angle, subtopic: sub });

      const subNodes = state.nodes.filter((n) => n.subtopicId === sub.id);
      const isExpanded =
        activeAgent?.mountedSubtopicIds.includes(sub.id) ||
        selectedSubtopicId === sub.id ||
        activeHighlightedPath?.subtopicIds.includes(sub.id);

      const nodeOuterRadius = isExpanded ? 265 : 222;
      const arcSpan = Math.min(Math.PI / 2.6, (2 * Math.PI) / count - 0.2);

      subNodes.forEach((node, nIdx) => {
        const offset =
          subNodes.length === 1
            ? 0
            : -arcSpan / 2 + (nIdx * arcSpan) / (subNodes.length - 1);
        const nAngle = angle + offset;
        const nx = cx + Math.cos(nAngle) * nodeOuterRadius;
        const ny = cy + Math.sin(nAngle) * nodeOuterRadius;
        nodeCoords.set(node.id, { x: nx, y: ny, node, subtopic: sub });
      });
    });

    const agentAnchor = { x: 110, y: 95 };

    return { cx, cy, subtopicCoords, nodeCoords, agentAnchor };
  }, [
    state.subtopics,
    state.nodes,
    activeAgent,
    selectedSubtopicId,
    activeHighlightedPath,
  ]);

  const selectedSubtopic = useMemo(
    () => state.subtopics.find((s) => s.id === selectedSubtopicId) || state.subtopics[0] || null,
    [state.subtopics, selectedSubtopicId]
  );

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === selectedNodeId) || null,
    [state.nodes, selectedNodeId]
  );

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-interactive="true"]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const canvasStrokeColor = isLight ? '#CBD5E1' : '#263248';
  const bubbleFillDefault = isLight ? '#FFFFFF' : '#121A2A';
  const bubbleFillActive = isLight ? '#ECFDF5' : '#102624';
  const textPrimaryFill = isLight ? '#0F172A' : '#F8FAFC';
  const textSecondaryFill = isLight ? '#64748B' : '#94A3B8';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
      {/* Left 8 Columns: Open Bubbly Graph Stage */}
      <div className="xl:col-span-8 relative rounded-3xl theme-canvas overflow-hidden flex flex-col min-h-[490px]">
        {/* Minimalist Floating Controls */}
        <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 theme-surface px-3.5 py-2 rounded-full">
            <button
              type="button"
              onClick={onToggleStrictScope}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                strictAgentScopeView
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'theme-text-secondary hover:opacity-80'
              }`}
            >
              {strictAgentScopeView ? 'Strict Agent View: ON' : 'Full Graph View'}
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5 theme-surface px-2.5 py-1.5 rounded-full">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.12).toFixed(2))))}
              className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.12).toFixed(2))))}
              className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-1.5 rounded-full theme-text-secondary hover:opacity-75"
              title="Center Graph"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive SVG Bubble Graph */}
        <svg
          viewBox="0 0 960 570"
          className={`w-full flex-1 select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <pattern id="bubbleGrid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle
                cx="2"
                cy="2"
                r="1.2"
                fill={isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)'}
              />
            </pattern>
          </defs>

          <rect width="960" height="570" fill="url(#bubbleGrid)" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Spokes from Center Root Bubble to Sub-Topic Bubbles */}
            {Array.from(layout.subtopicCoords.values()).map(({ x, y, subtopic }) => {
              const isMounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              return (
                <line
                  key={`root_spoke_${subtopic.id}`}
                  x1={layout.cx}
                  y1={layout.cy}
                  x2={x}
                  y2={y}
                  stroke={isMounted ? subtopic.color : canvasStrokeColor}
                  strokeWidth={isMounted ? 3 : 2}
                  strokeDasharray={isMounted ? undefined : '6 6'}
                />
              );
            })}

            {/* 2. Active Agent Lease Beam (HOLDING_CONTEXT) */}
            {activeAgent &&
              activeAgent.mountedSubtopicIds.map((subId) => {
                const target = layout.subtopicCoords.get(subId);
                if (!target) return null;
                const midX = (layout.agentAnchor.x + target.x) / 2;
                const midY = Math.min(layout.agentAnchor.y, target.y) - 42;
                return (
                  <g key={`lease_beam_${subId}`}>
                    <path
                      d={`M ${layout.agentAnchor.x} ${layout.agentAnchor.y} Q ${midX} ${midY} ${target.x} ${target.y}`}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth={3.5}
                      strokeDasharray="8 5"
                    />
                  </g>
                );
              })}

            {/* 3. Cross-Topic & Highlighted Path Curves */}
            {state.edges.map((edge) => {
              const src = layout.nodeCoords.get(edge.sourceId);
              const dst = layout.nodeCoords.get(edge.targetId);
              if (!src || !dst) return null;

              const isPathEdge =
                activeHighlightedPath &&
                activeHighlightedPath.nodeIds.includes(edge.sourceId) &&
                activeHighlightedPath.nodeIds.includes(edge.targetId);

              if (
                strictAgentScopeView &&
                !isPathEdge &&
                !isSubtopicMountedBySelectedAgent(src.subtopic.id) &&
                !isSubtopicMountedBySelectedAgent(dst.subtopic.id)
              ) {
                return null;
              }

              const isCrossTopic = src.subtopic.id !== dst.subtopic.id;
              return (
                <path
                  key={edge.id}
                  d={`M ${src.x} ${src.y} Q ${(src.x + dst.x) / 2} ${
                    (src.y + dst.y) / 2 - (isCrossTopic ? 26 : 10)
                  } ${dst.x} ${dst.y}`}
                  fill="none"
                  stroke={
                    isPathEdge
                      ? '#F59E0B'
                      : isCrossTopic
                      ? '#10B981'
                      : isLight
                      ? 'rgba(100,116,139,0.28)'
                      : 'rgba(148,163,184,0.25)'
                  }
                  strokeWidth={isPathEdge ? 3.5 : isCrossTopic ? 2 : 1.3}
                />
              );
            })}

            {/* 4. Satellite Memory Node Bubbles */}
            {Array.from(layout.nodeCoords.values()).map(({ x, y, node, subtopic }) => {
              const subMounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSelectedSub = selectedSubtopicId === subtopic.id;
              const isInHighlightedPath =
                activeHighlightedPath?.nodeIds.includes(node.id) ?? false;

              if (strictAgentScopeView && !subMounted && !isInHighlightedPath) {
                return null;
              }

              const subPos = layout.subtopicCoords.get(subtopic.id);
              const isSelectedNode = selectedNodeId === node.id;
              const isExpanded = subMounted || isSelectedSub || isInHighlightedPath;

              return (
                <g
                  key={node.id}
                  data-interactive="true"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectNode(node.id, subtopic.id);
                  }}
                >
                  {subPos && (
                    <line
                      x1={subPos.x}
                      y1={subPos.y}
                      x2={x}
                      y2={y}
                      stroke={subtopic.color}
                      strokeOpacity={isExpanded ? 0.55 : 0.22}
                      strokeWidth={isExpanded ? 2 : 1.2}
                    />
                  )}

                  <circle
                    cx={x}
                    cy={y}
                    r={isSelectedNode || isInHighlightedPath ? 15 : isExpanded ? 12 : 8}
                    fill={
                      isInHighlightedPath
                        ? '#F59E0B'
                        : subMounted
                        ? subtopic.color
                        : bubbleFillDefault
                    }
                    stroke={isInHighlightedPath ? '#FBBF24' : subtopic.color}
                    strokeWidth={2.5}
                    opacity={isExpanded ? 1 : 0.55}
                  />

                  {isExpanded && (
                    <text
                      x={x}
                      y={y + 26}
                      textAnchor="middle"
                      fill={textPrimaryFill}
                      fontSize="10.5"
                      fontWeight="500"
                    >
                      {node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 5. Sub-Topic Cluster Bubbles */}
            {Array.from(layout.subtopicCoords.values()).map(({ x, y, subtopic }) => {
              const isMounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSelected = selectedSubtopicId === subtopic.id;

              return (
                <g
                  key={subtopic.id}
                  data-interactive="true"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSubtopic(subtopic.id);
                  }}
                >
                  {/* Soft Outer Halo when Loaded or Selected */}
                  {(isMounted || isSelected) && (
                    <circle
                      cx={x}
                      cy={y}
                      r={49}
                      fill={subtopic.color}
                      fillOpacity={isLight ? 0.14 : 0.18}
                    />
                  )}

                  <circle
                    cx={x}
                    cy={y}
                    r={40}
                    fill={isMounted ? bubbleFillActive : bubbleFillDefault}
                    stroke={subtopic.color}
                    strokeWidth={isMounted || isSelected ? 3.5 : 2.2}
                  />

                  <text
                    x={x}
                    y={y - 3}
                    textAnchor="middle"
                    fill={textPrimaryFill}
                    fontSize="11"
                    fontWeight="700"
                  >
                    {subtopic.name.split(' ')[0]}
                  </text>

                  <text
                    x={x}
                    y={y + 13}
                    textAnchor="middle"
                    fill={isMounted ? '#10B981' : textSecondaryFill}
                    fontSize="9.5"
                    fontWeight="600"
                  >
                    {isMounted ? '● Loaded' : 'Summary'}
                  </text>
                </g>
              );
            })}

            {/* 6. Central Main Graph Bubble */}
            <g>
              <circle
                cx={layout.cx}
                cy={layout.cy}
                r={54}
                fill={isLight ? '#10B981' : '#064E3B'}
                fillOpacity={0.14}
              />
              <circle
                cx={layout.cx}
                cy={layout.cy}
                r={44}
                fill={bubbleFillDefault}
                stroke="#10B981"
                strokeWidth={3}
              />
              <text
                x={layout.cx}
                y={layout.cy - 4}
                textAnchor="middle"
                fill={textPrimaryFill}
                fontSize="11.5"
                fontWeight="700"
              >
                Main Graph
              </text>
              <text
                x={layout.cx}
                y={layout.cy + 12}
                textAnchor="middle"
                fill="#10B981"
                fontSize="9.5"
                fontWeight="600"
              >
                {state.subtopics.length} Topics
              </text>
            </g>

            {/* 7. Floating Active Agent Bubble (Top-Left) */}
            {activeAgent && (
              <g transform={`translate(${layout.agentAnchor.x}, ${layout.agentAnchor.y})`}>
                <rect
                  x={-88}
                  y={-30}
                  width={176}
                  height={60}
                  rx={30}
                  fill={bubbleFillDefault}
                  stroke={activeAgent.accentColor}
                  strokeWidth={2.5}
                />
                <text
                  x={0}
                  y={-5}
                  textAnchor="middle"
                  fill={textPrimaryFill}
                  fontSize="12"
                  fontWeight="700"
                >
                  {activeAgent.name}
                </text>
                <text
                  x={0}
                  y={12}
                  textAnchor="middle"
                  fill="#10B981"
                  fontSize="10"
                  fontWeight="600"
                >
                  {activeAgent.activeModelLabel}
                </text>
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Right 4 Columns: Clean, Airy Sub-Topic Bubble Card */}
      <div className="xl:col-span-4 rounded-3xl theme-surface p-6 flex flex-col justify-between gap-5">
        {selectedSubtopic ? (
          <>
            <div className="space-y-4">
              {/* Sub-Topic Header */}
              <div className="space-y-1">
                <div className="text-xs font-medium theme-text-muted">
                  {selectedSubtopic.domain} · Version {selectedSubtopic.version}
                </div>
                <h3 className="text-lg font-bold">{selectedSubtopic.name}</h3>
              </div>

              {/* Primary Pull / Send Back Bubble Actions */}
              <div className="flex flex-wrap items-center gap-2.5">
                {isSubtopicMountedBySelectedAgent(selectedSubtopic.id) ? (
                  <button
                    type="button"
                    onClick={() => onReleaseSubtopic(activeAgent.id, selectedSubtopic.id)}
                    className="bubble-rose flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Send Back to Graph
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onCheckoutSubtopic(activeAgent.id, selectedSubtopic.id)}
                    className="bubble-emerald flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold"
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    Pull into {activeAgent.name}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onOpenNewNodeModal(selectedSubtopic.id)}
                  className="bubble-btn inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-500" />
                  Add Memory
                </button>
              </div>

              {/* Clean Executive Summary Box */}
              <div className="rounded-2xl theme-elevated p-4 space-y-1.5">
                <div className="text-xs font-semibold text-emerald-500">
                  Sub-Topic Summary (Always in Agent Index)
                </div>
                <p className="text-xs sm:text-sm theme-text-secondary leading-relaxed">
                  {selectedSubtopic.summary}
                </p>
              </div>

              {/* Internal Memory Nodes */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Internal Memories</span>
                  <span className="font-mono text-[11px] theme-text-muted">
                    {isSubtopicMountedBySelectedAgent(selectedSubtopic.id)
                      ? 'Loaded in Agent'
                      : 'Stored in Graph'}
                  </span>
                </div>

                {strictAgentScopeView &&
                !isSubtopicMountedBySelectedAgent(selectedSubtopic.id) ? (
                  <div className="rounded-2xl theme-elevated p-4 text-xs theme-text-secondary leading-relaxed">
                    Strict Agent View is active: <strong>{activeAgent.name}</strong> only sees the summary above until you click <strong>Pull into {activeAgent.name}</strong>.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {state.nodes
                      .filter((n) => n.subtopicId === selectedSubtopic.id)
                      .map((node) => {
                        const isSelected = selectedNode?.id === node.id;
                        return (
                          <div
                            key={node.id}
                            onClick={() => onSelectNode(node.id, selectedSubtopic.id)}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'theme-elevated hover:border-emerald-500/50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold">{node.title}</span>
                              <span className="text-[11px] text-emerald-500 font-medium">
                                {node.kind}
                              </span>
                            </div>
                            <p className="text-xs theme-text-secondary mt-1 leading-relaxed">
                              {node.content}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            <div className="text-[11px] theme-text-muted pt-3 border-t border-slate-500/15 flex items-center justify-between">
              <span>Last updated by {selectedSubtopic.lastUpdatedByModel || 'Claude 3.7'}</span>
              <span className="font-mono tabular-nums">
                {selectedSubtopic.summaryTokenCount}t summary / {selectedSubtopic.fullTokenCount}t full
              </span>
            </div>
          </>
        ) : (
          <div className="text-xs theme-text-muted">
            Click any bubble on the graph to inspect its summary and memories.
          </div>
        )}
      </div>
    </div>
  );
};
