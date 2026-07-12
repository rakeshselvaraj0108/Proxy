"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Landmark, Loader2, Plus, Search, X } from "lucide-react";
import { useDeviceTier } from "@/components/landing/useDeviceTier";
import { DOMAIN_THEME } from "@/components/chat/domain-theme";
import { useKnowledgeGraphStore } from "../../store";
import { useInstitutionGraphQuery } from "../../queries";
import type { InstitutionQueryParams } from "../../api";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { NodeDetailPanel } from "../../components/NodeDetailPanel";
import { LEGEND_ITEMS } from "../../scene/legend";
import { Fallback2DGraph, type Fallback2DEdge, type Fallback2DNode } from "../../scene/Fallback2DGraph";
import { buildConstellation } from "./buildConstellation";

const InstitutionScene3D = dynamic(() => import("./InstitutionScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[500px] items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" />
    </div>
  ),
});

interface Slot {
  domain: string;
  institution: string;
}
const RECENT_KEY = "proxy:kg-v2-institution-recent";

function loadRecent(): Slot[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Mode 2: Institution Intelligence (spec 6) -- Comparative Constellation.
 * Query up to two institutions; each renders as its own gravitational
 * cluster, with gold arcs for real shared entities computed server-side. */
export function InstitutionMode() {
  const tier = useDeviceTier();
  const { selectedInstitutionNodeId, setSelectedInstitutionNodeId } = useKnowledgeGraphStore();
  const [slots, setSlots] = useState<Slot[]>([{ domain: "health_insurance", institution: "" }]);
  const [queryParams, setQueryParams] = useState<InstitutionQueryParams | null>(null);
  const [recent, setRecent] = useState<Slot[]>([]);

  useEffect(() => setRecent(loadRecent()), []);

  const graphQuery = useInstitutionGraphQuery(queryParams);

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function addComparison() {
    if (slots.length >= 2) return;
    setSlots((current) => [...current, { domain: "health_insurance", institution: "" }]);
  }
  function removeSlot(index: number) {
    setSlots((current) => current.filter((_, i) => i !== index));
  }

  function runQuery(activeSlots: Slot[]) {
    const filled = activeSlots.filter((s) => s.institution.trim());
    if (filled.length === 0) return;
    setSelectedInstitutionNodeId(null);
    const [first, second] = filled;
    setQueryParams({
      domain: first.domain,
      institutionName: first.institution.trim(),
      domain2: second?.domain,
      institutionName2: second?.institution.trim(),
    });
    const nextRecent = [...filled, ...recent.filter((r) => !filled.some((f) => f.domain === r.domain && f.institution === r.institution))].slice(0, 8);
    setRecent(nextRecent);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
  }

  const { nodes, edges, sharedEdges } = useMemo(() => buildConstellation(graphQuery.data), [graphQuery.data]);
  const selectedNode = nodes.find((n) => n.id === selectedInstitutionNodeId) ?? null;

  const fallbackNodes: Fallback2DNode[] = nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, size: n.kind === "institution" ? 30 : 18 }));
  const fallbackEdges: Fallback2DEdge[] = [...edges, ...sharedEdges];

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="size-4 text-cyan-200" />
          <h2 className="font-semibold">Query the institution graph</h2>
        </div>
        <p className="mb-4 text-xs leading-5 text-proxy-muted">Real cross-user pattern intelligence pulled from the knowledge graph. Compare up to two institutions side by side.</p>

        {slots.map((slot, index) => (
          <div key={index} className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {slots.length > 1 && (
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wide text-proxy-tertiary">Query {index + 1}</span>
                <button onClick={() => removeSlot(index)} className="text-proxy-tertiary hover:text-red-200"><X className="size-3.5" /></button>
              </div>
            )}
            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-xs text-proxy-muted">Domain</span>
              <select value={slot.domain} onChange={(e) => updateSlot(index, { domain: e.target.value })} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60">
                {Object.entries(DOMAIN_THEME).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-proxy-muted">Institution name</span>
              <input value={slot.institution} onChange={(e) => updateSlot(index, { institution: e.target.value })} onKeyDown={(e) => e.key === "Enter" && runQuery(slots)} placeholder="e.g. Star Health Insurance" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60" />
            </label>
          </div>
        ))}

        {slots.length < 2 && (
          <button onClick={addComparison} className="mb-3 inline-flex items-center gap-1.5 text-xs text-cyan-200 hover:text-cyan-100">
            <Plus className="size-3.5" /> Compare with another institution
          </button>
        )}

        {recent.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Recent queries</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r, i) => (
                <button key={`${r.domain}-${r.institution}-${i}`} onClick={() => { setSlots([r]); runQuery([r]); }} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-proxy-muted hover:border-cyan-300/30 hover:text-cyan-100">
                  {r.institution} &middot; {DOMAIN_THEME[r.domain]?.label ?? r.domain}
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => runQuery(slots)} disabled={!slots.some((s) => s.institution.trim()) || graphQuery.isFetching} className="search-orb inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
          {graphQuery.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Query graph
        </button>
        <style jsx>{`.search-orb { background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0); }`}</style>
      </aside>

      <section className="relative min-h-[500px] overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#050608] shadow-glow-cyan">
        {!queryParams ? (
          <EmptyState icon={Landmark} title="No institution queried yet" description="Pick a domain and institution name on the left, then query the graph to see its real case patterns as a constellation." />
        ) : graphQuery.isLoading ? (
          <div className="flex h-full min-h-[500px] items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>
        ) : graphQuery.isError ? (
          <ErrorState message={(graphQuery.error as Error).message} onRetry={() => graphQuery.refetch()} />
        ) : (
          <>
            <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
              <p className="font-mono text-xs uppercase tracking-[.18em] text-proxy-tertiary">Comparative Constellation</p>
              <p className="text-sm text-cyan-100">
                {graphQuery.data?.institutions.length ?? 0} institution{(graphQuery.data?.institutions.length ?? 0) === 1 ? "" : "s"} &middot; {nodes.length} real entities
                {sharedEdges.length > 0 ? ` · ${sharedEdges.length} shared` : ""}
              </p>
            </div>
            <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
              {LEGEND_ITEMS.filter((i) => ["institution", "regulation", "case"].includes(i.kind)).map((item) => (
                <span key={item.kind} className="flex items-center gap-1.5 font-mono text-[10px] text-proxy-muted">
                  <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} /> {item.kind === "regulation" ? "Pattern" : item.label}
                </span>
              ))}
              {sharedEdges.length > 0 && (
                <span className="flex items-center gap-1.5 font-mono text-[10px] text-proxy-muted">
                  <span className="size-2 rounded-full" style={{ backgroundColor: "#ffe9b0" }} /> Shared entity
                </span>
              )}
            </div>
            {tier === "high" ? (
              <InstitutionScene3D nodes={nodes} edges={edges} sharedEdges={sharedEdges} selectedId={selectedInstitutionNodeId} onSelect={setSelectedInstitutionNodeId} />
            ) : (
              <Fallback2DGraph nodes={fallbackNodes} edges={fallbackEdges} selectedId={selectedInstitutionNodeId} onSelect={setSelectedInstitutionNodeId} />
            )}
          </>
        )}
      </section>

      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        {selectedNode ? <NodeDetailPanel node={selectedNode} /> : <p className="text-xs text-proxy-tertiary">Query an institution, then select a node to inspect it -- or a gold arc's endpoints to see what&apos;s shared.</p>}
      </aside>
    </div>
  );
}
