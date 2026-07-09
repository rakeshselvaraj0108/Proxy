"use client";

import { useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useForceGraph, type ForceEdgeInput, type ForceNodeInput } from "./useForceGraph";

export interface CanvasNode {
  id: string;
  kind: string;
  label: string;
  color: string;
  r: number;
}

export interface CanvasEdge {
  source: string;
  target: string;
}

const SPACE = 640;
const CLICK_THRESHOLD = 5;

export function GraphCanvas({
  nodes, edges, anchorId, selectedId, onSelect, renderIcon, legend, emptyMessage, headerBadge,
}: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  anchorId?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderIcon: (kind: string, color: string) => React.ReactNode;
  legend?: Array<{ label: string; color: string }>;
  emptyMessage?: string;
  headerBadge?: React.ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dragState = useRef<{ id: string; moved: boolean } | null>(null);
  const panState = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);

  const forceNodes: ForceNodeInput[] = useMemo(() => nodes.map((n) => ({ id: n.id, r: n.r })), [nodes]);
  const forceEdges: ForceEdgeInput[] = useMemo(() => edges.map((e) => ({ source: e.source, target: e.target })), [edges]);
  const { position, pin, release } = useForceGraph(forceNodes, forceEdges, SPACE, SPACE, anchorId);

  function clientToViewboxPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function clientToSimPoint(clientX: number, clientY: number) {
    const group = groupRef.current;
    if (!group) return { x: 0, y: 0 };
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = group.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const cursor = clientToViewboxPoint(e.clientX, e.clientY);
    const nextK = Math.min(2.6, Math.max(0.45, view.k * (1 - e.deltaY * 0.0012)));
    const nextX = cursor.x - (cursor.x - view.x) * (nextK / view.k);
    const nextY = cursor.y - (cursor.y - view.y) * (nextK / view.k);
    setView({ x: nextX, y: nextY, k: nextK });
  }

  function zoomBy(factor: number) {
    const nextK = Math.min(2.6, Math.max(0.45, view.k * factor));
    const cx = SPACE / 2;
    const cy = SPACE / 2;
    const nextX = cx - (cx - view.x) * (nextK / view.k);
    const nextY = cy - (cy - view.y) * (nextK / view.k);
    setView({ x: nextX, y: nextY, k: nextK });
  }

  function resetView() {
    setView({ x: 0, y: 0, k: 1 });
  }

  function onBackgroundMouseDown(e: React.MouseEvent) {
    panState.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
    window.addEventListener("mousemove", onPanMove);
    window.addEventListener("mouseup", onPanUp);
  }
  function onPanMove(e: MouseEvent) {
    const pan = panState.current;
    if (!pan) return;
    setView((current) => ({ ...current, x: pan.viewX + (e.clientX - pan.startX), y: pan.viewY + (e.clientY - pan.startY) }));
  }
  function onPanUp() {
    panState.current = null;
    window.removeEventListener("mousemove", onPanMove);
    window.removeEventListener("mouseup", onPanUp);
  }

  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    dragState.current = { id, moved: false };
    const start = { x: e.clientX, y: e.clientY };
    const move = (event: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;
      if (!state.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_THRESHOLD) {
        state.moved = true;
      }
      const sim = clientToSimPoint(event.clientX, event.clientY);
      pin(id, sim.x, sim.y);
    };
    const up = () => {
      const state = dragState.current;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (state) {
        release(state.id);
        if (!state.moved) onSelect(state.id);
      }
      dragState.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[600px] flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-proxy-tertiary">{emptyMessage ?? "Nothing to show yet."}</p>
      </div>
    );
  }

  const now = Date.now() / 1000;

  return (
    <div className="relative h-full min-h-[600px] w-full overflow-hidden">
      {headerBadge}
      {legend && (
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-[10px] text-proxy-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className="absolute right-4 top-4 z-10 flex flex-col gap-1">
        <button onClick={() => zoomBy(1.25)} className="grid size-7 place-items-center rounded-lg border border-white/10 bg-black/45 text-proxy-muted backdrop-blur-xl hover:border-cyan-300/30 hover:text-cyan-100">
          <ZoomIn className="size-3.5" />
        </button>
        <button onClick={() => zoomBy(0.8)} className="grid size-7 place-items-center rounded-lg border border-white/10 bg-black/45 text-proxy-muted backdrop-blur-xl hover:border-cyan-300/30 hover:text-cyan-100">
          <ZoomOut className="size-3.5" />
        </button>
        <button onClick={resetView} className="grid size-7 place-items-center rounded-lg border border-white/10 bg-black/45 text-proxy-muted backdrop-blur-xl hover:border-cyan-300/30 hover:text-cyan-100">
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SPACE} ${SPACE}`}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        role="img"
        aria-label="Knowledge graph"
        onWheel={onWheel}
        onMouseDown={onBackgroundMouseDown}
      >
        <defs>
          <radialGradient id="graphCanvasGlow">
            <stop offset="0%" stopColor="rgba(0,229,255,.14)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <rect width={SPACE} height={SPACE} fill="url(#graphCanvasGlow)" />

        <g ref={groupRef} transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {edges.map((edge) => {
            const from = position(edge.source);
            const to = position(edge.target);
            const targetNode = nodes.find((n) => n.id === edge.target);
            const active = hoveredId === edge.source || hoveredId === edge.target || selectedId === edge.source || selectedId === edge.target;
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dist = Math.hypot(dx, dy) || 1;
            const bow = Math.min(28, dist * 0.14);
            const cx = mx - (dy / dist) * bow;
            const cy = my + (dx / dist) * bow;
            const t = (now * 0.28 + hashPhase(edge.source + edge.target)) % 1;
            const px = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
            const py = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * to.y;
            return (
              <g key={`${edge.source}-${edge.target}`} opacity={hoveredId && !active ? 0.15 : 1}>
                <path
                  d={`M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`}
                  fill="none"
                  stroke={targetNode?.color ?? "#00e5ff"}
                  strokeWidth={active ? 2 : 1.2}
                  strokeOpacity={active ? 0.7 : 0.25}
                />
                <circle cx={px} cy={py} r={2.2} fill={targetNode?.color ?? "#00e5ff"} opacity={active ? 0.9 : 0.5} />
              </g>
            );
          })}

          {nodes.map((node, index) => {
            const pos = position(node.id);
            const isSelected = node.id === selectedId;
            const isHovered = node.id === hoveredId;
            const dimmed = Boolean(hoveredId) && !isHovered && !edges.some((e) => (e.source === hoveredId && e.target === node.id) || (e.target === hoveredId && e.source === node.id));
            return (
              <g key={node.id} style={{ animation: `graphNodeIn .5s cubic-bezier(.16,1,.3,1) ${index * 45}ms both` }}>
                <g
                  transform={`translate(${pos.x} ${pos.y})`}
                  opacity={dimmed ? 0.3 : 1}
                  style={{ cursor: "grab", transition: "opacity .15s ease" }}
                  onMouseDown={(e) => onNodeMouseDown(e, node.id)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <circle
                    r={node.r}
                    fill="rgba(5,5,8,.92)"
                    stroke={node.color}
                    strokeWidth={isSelected ? 3 : 1.5}
                    style={{ filter: `drop-shadow(0 0 ${isSelected ? 18 : isHovered ? 12 : 7}px ${node.color}77)`, transition: "filter .15s ease, stroke-width .15s ease" }}
                  />
                  {isSelected && (
                    <circle r={node.r + 9} fill="none" stroke={node.color} strokeOpacity={0.4}>
                      <animate attributeName="r" values={`${node.r + 5};${node.r + 15}`} dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <foreignObject x={-9} y={-9} width="18" height="18" style={{ pointerEvents: "none" }}>
                    {renderIcon(node.kind, node.color)}
                  </foreignObject>
                  <text y={node.r + 15} textAnchor="middle" fill="#dbeafe" fontSize={node.id === anchorId ? 12 : 10.5} style={{ pointerEvents: "none" }}>
                    {node.label}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      <style jsx global>{`
        @keyframes graphNodeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function hashPhase(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 1000;
  return hash / 1000;
}
