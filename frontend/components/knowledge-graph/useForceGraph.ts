"use client";

import { useEffect, useRef, useState } from "react";

export interface ForceNodeInput {
  id: string;
  /** Larger radius pushes neighbors further away -- keeps big "hub" nodes from being crowded. */
  r: number;
}

export interface ForceEdgeInput {
  source: string;
  target: string;
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  fx?: number;
  fy?: number;
}

const REPEL = 3200;
const SPRING = 0.018;
const IDEAL_LENGTH = 128;
const CENTER_PULL = 0.0022;
const DAMPING = 0.83;

/** Lightweight force-directed layout (repulsion + spring edges + weak center
 * gravity), run continuously via rAF so the graph feels alive and nodes can
 * be dragged at any time -- no charting/physics library, consistent with
 * every other hand-built SVG visualization in this app. */
export function useForceGraph(
  nodes: ForceNodeInput[],
  edges: ForceEdgeInput[],
  width: number,
  height: number,
  anchorId?: string
) {
  const simRef = useRef<Map<string, SimNode>>(new Map());
  const [tick, setTick] = useState(0);
  const draggingRef = useRef<string | null>(null);

  useEffect(() => {
    const sim = simRef.current;
    const incomingIds = new Set(nodes.map((n) => n.id));
    for (const id of Array.from(sim.keys())) {
      if (!incomingIds.has(id)) sim.delete(id);
    }
    nodes.forEach((n, index) => {
      if (!sim.has(n.id)) {
        const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
        const startR = n.id === anchorId ? 0 : 90 + Math.random() * 40;
        sim.set(n.id, {
          id: n.id,
          x: width / 2 + startR * Math.cos(angle),
          y: height / 2 + startR * Math.sin(angle),
          vx: 0,
          vy: 0,
          r: n.r,
        });
      } else {
        sim.get(n.id)!.r = n.r;
      }
    });
    if (anchorId && sim.has(anchorId)) {
      const anchor = sim.get(anchorId)!;
      anchor.fx = width / 2;
      anchor.fy = height / 2;
    }
  }, [nodes.map((n) => n.id).join("|"), width, height, anchorId]);

  useEffect(() => {
    let raf: number;
    let stopped = false;

    function step() {
      if (stopped) return;
      const sim = simRef.current;
      const list = Array.from(sim.values());

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = Math.max(dx * dx + dy * dy, 25);
          const dist = Math.sqrt(distSq);
          const force = (REPEL * (1 + (a.r + b.r) / 40)) / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      for (const edge of edges) {
        const a = sim.get(edge.source);
        const b = sim.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const diff = dist - IDEAL_LENGTH;
        const fx = (dx / dist) * diff * SPRING;
        const fy = (dy / dist) * diff * SPRING;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      for (const node of list) {
        node.vx += (width / 2 - node.x) * CENTER_PULL;
        node.vy += (height / 2 - node.y) * CENTER_PULL;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        if (node.fx !== undefined) {
          node.x = node.fx;
          node.vx = 0;
        } else {
          node.x += node.vx;
        }
        if (node.fy !== undefined) {
          node.y = node.fy;
          node.vy = 0;
        } else {
          node.y += node.vy;
        }
      }

      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(step);
    }

    raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [edges.map((e) => `${e.source}-${e.target}`).join("|"), width, height]);

  function pin(id: string, x: number, y: number) {
    const node = simRef.current.get(id);
    if (!node) return;
    node.fx = x;
    node.fy = y;
  }

  function release(id: string) {
    if (id === anchorId) return;
    const node = simRef.current.get(id);
    if (!node) return;
    node.fx = undefined;
    node.fy = undefined;
  }

  function position(id: string): { x: number; y: number } {
    const node = simRef.current.get(id);
    return node ? { x: node.x, y: node.y } : { x: width / 2, y: height / 2 };
  }

  return { position, pin, release, draggingRef, tick };
}
