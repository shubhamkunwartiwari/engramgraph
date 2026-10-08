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
    const cx = 520;
    const cy = 300;
    const subRadius = 158;

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

      // Expand satellite nodes outward when mounted or inspected; keep tucked close when paged out!
      const nodeOuterRadius = isExpanded ? 268 : 220;
      const arcSpan = Math.min(Math.PI / 2.8, (2 * Math.PI) / count - 0.22);

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

    // Active agent dock node on the left of the canvas
    const agentAnchor = { x: 115, y: 110 };

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
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - dragStart.y });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetCamera = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const mountedInSelectedSub = selectedSubtopic
    ? isSubtopicMountedBySelectedAgent(selectedSubtopic.id)
    : false;

  return (
    <div className="relative flex flex-col border border-slate-800/80 bg-[#0B0F17] overflow-hidden">
      {/* Minimal Floating Top-Left View Filter & Top-Right Zoom Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleStrictScope}
            className={`tactile-btn px-3.5 py-1.5 text-xs font-medium rounded-md border ${
              strictAgentScopeView
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                : 'bg-[#121824]/90 border-slate-700/80 text-slate-300 hover:text-white'
            }`}
          >
            {strictAgentScopeView
              ? `Agent View: Only What ${activeAgent.name} Holds`
              : 'Graph View: All Sub-Topics'}
          </button>
        </div>

        <div className="flex items-center bg-[#121824]/90 border border-slate-800 rounded-md pointer-events-auto">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 font-mono text-xs tabular-nums text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))))}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="p-2 text-slate-400 hover:text-white transition-colors border-l border-slate-800"
            title="Center Graph"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Spacious Interactive Graph Stage */}
      <div className="relative h-[500px] w-full select-none">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.25) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        <svg
          viewBox="0 0 1000 600"
          className={`h-full w-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <marker
              id="arrow-lease"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
            </marker>
            <marker
              id="arrow-path"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#F59E0B" />
            </marker>
          </defs>

          <g
            transform={`translate(${pan.x}, ${pan.y}) translate(520, 300) scale(${zoom}) translate(-520, -300)`}
          >
            {/* Subtle Orbit Ring */}
            <circle
              cx={layout.cx}
              cy={layout.cy}
              r={158}
              fill="none"
              stroke="#1E293B"
              strokeWidth="1"
              strokeDasharray="4 6"
            />

            {/* 1. RootGraph -> SubTopic Spokes */}
            {Array.from(layout.subtopicCoords.values()).map(({ x, y, subtopic }) => {
              const isMounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSelected = selectedSubtopicId === subtopic.id;
              const inPath = activeHighlightedPath?.subtopicIds.includes(subtopic.id);
              return (
                <line
                  key={`spoke_${subtopic.id}`}
                  x1={layout.cx}
                  y1={layout.cy}
                  x2={x}
                  y2={y}
                  stroke={
                    inPath
                      ? '#F59E0B'
                      : isMounted
                      ? subtopic.color
                      : isSelected
                      ? '#94A3B8'
                      : '#1E293B'
                  }
                  strokeWidth={inPath || isMounted || isSelected ? 2.2 : 1.2}
                />
              );
            })}

            {/* 2. SubTopic -> MemoryNode Spokes */}
            {Array.from(layout.nodeCoords.values()).map(({ x, y, node, subtopic }) => {
              const subCoord = layout.subtopicCoords.get(subtopic.id);
              if (!subCoord) return null;
              const mounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSubSelected = selectedSubtopicId === subtopic.id;
              const hidden = strictAgentScopeView && !mounted;
              const inPath = activeHighlightedPath?.nodeIds.includes(node.id);

              return (
                <line
                  key={`contain_${node.id}`}
                  x1={subCoord.x}
                  y1={subCoord.y}
                  x2={x}
                  y2={y}
                  stroke={inPath ? '#F59E0B' : subtopic.color}
                  strokeWidth={inPath ? 2 : mounted || isSubSelected ? 1.4 : 0.8}
                  strokeOpacity={hidden ? 0.08 : inPath ? 0.95 : mounted || isSubSelected ? 0.65 : 0.22}
                />
              );
            })}

            {/* 3. Cross-Topic Semantic Edges (Highlighted when Path selected or SubTopic selected) */}
            {state.edges.map((edge) => {
              const src = layout.nodeCoords.get(edge.sourceId);
              const dst = layout.nodeCoords.get(edge.targetId);
              if (!src || !dst) return null;

              const inPath =
                activeHighlightedPath &&
                (activeHighlightedPath.edgeIds.includes(edge.id) ||
                  (activeHighlightedPath.nodeIds.includes(edge.sourceId) &&
                    activeHighlightedPath.nodeIds.includes(edge.targetId)));

              const touchesSelectedSub =
                selectedSubtopicId &&
                (src.subtopic.id === selectedSubtopicId || dst.subtopic.id === selectedSubtopicId);

              if (!inPath && !touchesSelectedSub) return null;

              const mx = (src.x + dst.x) / 2 + (layout.cx - (src.x + dst.x) / 2) * 0.25;
              const my = (src.y + dst.y) / 2 + (layout.cy - (src.y + dst.y) / 2) * 0.25;

              return (
                <path
                  key={edge.id}
                  d={`M ${src.x} ${src.y} Q ${mx} ${my} ${dst.x} ${dst.y}`}
                  fill="none"
                  stroke={inPath ? '#F59E0B' : '#38BDF8'}
                  strokeWidth={inPath ? 2.5 : 1.4}
                  strokeDasharray={inPath ? undefined : '4 4'}
                  strokeOpacity={inPath ? 0.95 : 0.55}
                  markerEnd={inPath ? 'url(#arrow-path)' : undefined}
                />
              );
            })}

            {/* 4. Active Agent Memory Tether Lines */}
            {activeAgent.mountedSubtopicIds.map((subId) => {
              const targetSub = layout.subtopicCoords.get(subId);
              if (!targetSub) return null;
              return (
                <g key={`tether_${subId}`}>
                  <line
                    x1={layout.agentAnchor.x + 65}
                    y1={layout.agentAnchor.y}
                    x2={targetSub.x}
                    y2={targetSub.y}
                    stroke="#10B981"
                    strokeWidth="2.2"
                    strokeDasharray="6 4"
                    markerEnd="url(#arrow-lease)"
                  />
                </g>
              );
            })}

            {/* 5. Outer Memory Nodes */}
            {Array.from(layout.nodeCoords.values()).map(({ x, y, node, subtopic }) => {
              const mounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSubSelected = selectedSubtopicId === subtopic.id;
              const hidden = strictAgentScopeView && !mounted;
              const isSelected = selectedNodeId === node.id;
              const inPath = activeHighlightedPath?.nodeIds.includes(node.id);

              return (
                <g
                  key={node.id}
                  data-interactive="true"
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onSelectNode(node.id, subtopic.id)}
                  className="cursor-pointer"
                  opacity={hidden ? 0.1 : mounted || isSubSelected || inPath ? 1 : 0.45}
                >
                  {(isSelected || inPath) && (
                    <circle
                      r={15}
                      fill="none"
                      stroke={inPath ? '#F59E0B' : '#FFFFFF'}
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    r={mounted || isSelected || inPath ? 9.5 : 6.5}
                    fill={inPath ? '#F59E0B' : mounted ? subtopic.color : '#161F30'}
                    stroke={inPath ? '#FDE68A' : subtopic.color}
                    strokeWidth="1.5"
                  />
                  {/* Only show node label if its subtopic is selected, mounted, or in a highlighted path */}
                  {(isSelected || isSubSelected || mounted || inPath) && !hidden && (
                    <text
                      y={21}
                      textAnchor="middle"
                      fill={isSelected || inPath ? '#FFFFFF' : '#94A3B8'}
                      className="text-[10px] font-medium"
                    >
                      {node.title.length > 18 ? `${node.title.slice(0, 16)}…` : node.title}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 6. Sub-Topic Orbs (Primary Interactive Hubs) */}
            {Array.from(layout.subtopicCoords.values()).map(({ x, y, subtopic }) => {
              const isMounted = isSubtopicMountedBySelectedAgent(subtopic.id);
              const isSelected = selectedSubtopicId === subtopic.id;
              const inPath = activeHighlightedPath?.subtopicIds.includes(subtopic.id);
              const nodeCount = state.nodes.filter((n) => n.subtopicId === subtopic.id).length;

              return (
                <g
                  key={subtopic.id}
                  data-interactive="true"
                  transform={`translate(${x}, ${y})`}
                  onClick={() => onSelectSubtopic(subtopic.id)}
                  onDoubleClick={() =>
                    isMounted
                      ? onReleaseSubtopic(activeAgent.id, subtopic.id)
                      : onCheckoutSubtopic(activeAgent.id, subtopic.id)
                  }
                  className="cursor-pointer"
                >
                  {isMounted && (
                    <circle
                      r={40}
                      fill={subtopic.color}
                      fillOpacity="0.15"
                      stroke={subtopic.color}
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                  )}
                  <circle
                    r={32}
                    fill={isMounted ? '#111C2D' : '#0D131F'}
                    stroke={isSelected ? '#FFFFFF' : inPath ? '#F59E0B' : subtopic.color}
                    strokeWidth={isSelected || isMounted ? 2.5 : 1.5}
                  />
                  <text
                    y={-3}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    className="text-[11px] font-semibold"
                  >
                    {subtopic.name.split(' ')[0]}
                  </text>
                  <text
                    y={11}
                    textAnchor="middle"
                    fill={isMounted ? '#34D399' : '#64748B'}
                    className="font-mono text-[9px]"
                  >
                    {isMounted ? 'LOADED' : `${nodeCount} nodes`}
                  </text>
                </g>
              );
            })}

            {/* 7. Center Main Graph Core */}
            <g transform={`translate(${layout.cx}, ${layout.cy})`}>
              <circle r={42} fill="#0F172A" stroke="#10B981" strokeWidth="2" />
              <text
                y={-4}
                textAnchor="middle"
                fill="#10B981"
                className="font-mono text-[9px] font-semibold"
              >
                MAIN GRAPH
              </text>
              <text
                y={10}
                textAnchor="middle"
                fill="#F8FAFC"
                className="text-[11px] font-semibold"
              >
                {state.subtopics.length} Sub-Topics
              </text>
            </g>

            {/* 8. Active Agent Node on Canvas */}
            <g transform={`translate(${layout.agentAnchor.x}, ${layout.agentAnchor.y})`}>
              <rect
                x={-72}
                y={-30}
                width={144}
                height={60}
                rx={8}
                fill="#111827"
                stroke={activeAgent.accentColor}
                strokeWidth="2"
              />
              <text
                x={0}
                y={-8}
                textAnchor="middle"
                fill="#FFFFFF"
                className="text-xs font-bold"
              >
                {activeAgent.name}
              </text>
              <text
                x={0}
                y={7}
                textAnchor="middle"
                fill="#94A3B8"
                className="font-mono text-[9.5px]"
              >
                {activeAgent.activeModelLabel}
              </text>
              <text
                x={0}
                y={21}
                textAnchor="middle"
                fill="#10B981"
                className="font-mono text-[9px]"
              >
                {activeAgent.mountedSubtopicIds.length === 0
                  ? 'Holds Summaries Only'
                  : `${activeAgent.mountedSubtopicIds.length} Topic(s) Loaded`}
              </text>
            </g>
          </g>
        </svg>
      </div>

      {/* Minimalist Interactive Sub-Topic Dock Bar at Bottom of Canvas */}
      {selectedSubtopic && (
        <div className="border-t border-slate-800/90 bg-[#0F1522] px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-white text-sm">{selectedSubtopic.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">v{selectedSubtopic.version}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {mountedInSelectedSub
                  ? `Full Context Active (${selectedSubtopic.fullTokenCount} tokens)`
                  : `Summary Only (${selectedSubtopic.summaryTokenCount} tokens)`}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedNode && selectedNode.subtopicId === selectedSubtopic.id
                ? `${selectedNode.title}: ${selectedNode.content}`
                : selectedSubtopic.summary}
            </p>
          </div>

          {/* Bespoke Tactile Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenNewNodeModal(selectedSubtopic.id)}
              className="tactile-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-[#182234] border border-slate-700 text-slate-200 hover:text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              Add Memory
            </button>

            {mountedInSelectedSub ? (
              <button
                type="button"
                onClick={() => onReleaseSubtopic(activeAgent.id, selectedSubtopic.id)}
                className="tactile-rose inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold whitespace-nowrap"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Send Back to Graph
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCheckoutSubtopic(activeAgent.id, selectedSubtopic.id)}
                className="tactile-emerald inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold whitespace-nowrap"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Pull Full Topic into {activeAgent.name}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
