"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Scale, Building2, Layers, Loader2, Network, Users,
  Landmark, X, ChevronRight, Sparkles, ScrollText, Plus, TrendingUp, Clock, Bot,
} from "lucide-react";
import {
  listAnalyses, getCaseReport, getInstitutionPatterns, getSimilarCases, getMyCitizenProfile,
  type AnalysisCase, type CaseReportData, type InstitutionPattern, type SimilarCase,
  type CitizenProfile, type CitizenDomainProfile,
} from "@/lib/api-client";
import { DOMAIN_THEME, domainTheme } from "@/components/chat/domain-theme";
import { GraphCanvas, type CanvasEdge, type CanvasNode } from "./GraphCanvas";
import { PREF_KEYS, getPref } from "@/lib/preferences";

type Tab = "case" | "institution" | "profile";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface InstitutionPrefill {
  domain: string;
  institution: string;
}

export function KnowledgeGraphExplorer() {
  const [tab, setTab] = useState<Tab>(() => getPref(PREF_KEYS.kgDefaultTab, "case") as Tab);
  const [analyses, setAnalyses] = useState<AnalysisCase[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);
  const [focusCaseId, setFocusCaseId] = useState<string | null>(null);
  const [institutionPrefill, setInstitutionPrefill] = useState<InstitutionPrefill | null>(null);

  useEffect(() => {
    listAnalyses()
      .then(setAnalyses)
      .catch(() => {})
      .finally(() => setLoadingAnalyses(false));
  }, []);

  // Deep-link from Notifications (?case=<id>) -- opens straight into that
  // case's graph instead of requiring the user to hunt for it in the list.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const caseId = params.get("case");
    if (caseId) {
      setFocusCaseId(caseId);
      setTab("case");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function openCase(caseId: string) {
    setFocusCaseId(caseId);
    setTab("case");
  }

  function openInstitution(domain: string, institution: string) {
    setInstitutionPrefill({ domain, institution });
    setTab("institution");
  }

  return (
    <div className="flex min-h-[760px] flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-glass p-2 backdrop-blur-2xl">
        <TabButton active={tab === "case"} icon={Network} label="Case Graph" onClick={() => setTab("case")} />
        <TabButton active={tab === "institution"} icon={Landmark} label="Institution Intelligence" onClick={() => setTab("institution")} />
        <TabButton active={tab === "profile"} icon={Users} label="My Cross-Domain Profile" onClick={() => setTab("profile")} />
        <div className="ml-auto"><NewAnalysisButton /></div>
      </div>

      {tab === "case" && <CaseGraphTab analyses={analyses} loading={loadingAnalyses} focusCaseId={focusCaseId} onOpenInstitution={openInstitution} />}
      {tab === "institution" && <InstitutionTab analyses={analyses} prefill={institutionPrefill} onOpenCase={openCase} />}
      {tab === "profile" && <ProfileTab analyses={analyses} onOpenCase={openCase} onOpenInstitution={openInstitution} />}
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Network; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
        active ? "bg-cyan-300/15 text-cyan-100" : "text-proxy-muted hover:bg-white/5"
      }`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function NewAnalysisButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  if (compact) {
    return (
      <button
        onClick={() => router.push("/dashboard/assistant")}
        title="Ask the AI Assistant"
        className="new-orb grid size-8 shrink-0 place-items-center rounded-lg text-black"
      >
        <Bot className="size-4" />
        <style jsx>{`.new-orb { background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0); }`}</style>
      </button>
    );
  }
  return (
    <button
      onClick={() => router.push("/dashboard/assistant")}
      className="new-orb inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-black"
    >
      <Bot className="size-3.5" /> Ask the AI Assistant
      <style jsx>{`.new-orb { background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0); }`}</style>
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* Case Graph                                                              */
/* ---------------------------------------------------------------------- */

interface GraphNode {
  id: string;
  kind: "case" | "domain" | "institution" | "document" | "appeal";
  label: string;
  color: string;
  detail: React.ReactNode;
}

const CASE_GRAPH_LEGEND = [
  { label: "Case", color: "#00e5ff" },
  { label: "Domain", color: "#00e5ff" },
  { label: "Institution", color: "#ffc857" },
  { label: "Document", color: "#37f29a" },
  { label: "Appeal", color: "#9b5cff" },
];

function CaseGraphTab({
  analyses, loading, focusCaseId, onOpenInstitution,
}: {
  analyses: AnalysisCase[];
  loading: boolean;
  focusCaseId: string | null;
  onOpenInstitution: (domain: string, institution: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [report, setReport] = useState<CaseReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    if (analyses.length > 0 && !selectedCaseId) setSelectedCaseId(analyses[0].id);
  }, [analyses, selectedCaseId]);

  useEffect(() => {
    if (focusCaseId) setSelectedCaseId(focusCaseId);
  }, [focusCaseId]);

  useEffect(() => {
    if (!selectedCaseId) return;
    setLoadingReport(true);
    setSelectedNode(null);
    getCaseReport(selectedCaseId)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoadingReport(false));
  }, [selectedCaseId]);

  const filteredAnalyses = useMemo(
    () => analyses.filter((a) => a.title.toLowerCase().includes(search.toLowerCase())),
    [analyses, search]
  );

  const selectedCase = analyses.find((a) => a.id === selectedCaseId);
  const theme = domainTheme(selectedCase?.domains_involved[0] ?? selectedCase?.domain ?? "");

  const nodes: GraphNode[] = useMemo(() => {
    if (!report?.case) return [];
    const caseData = report.case;
    const result: GraphNode[] = [
      {
        id: "case",
        kind: "case",
        label: caseData.title.length > 28 ? `${caseData.title.slice(0, 28)}...` : caseData.title,
        color: theme.color,
        detail: (
          <>
            <DetailRow label="Full title" value={caseData.title} />
            <DetailRow label="Summary" value={caseData.summary} />
            <DetailRow label="Status" value={caseData.status} />
          </>
        ),
      },
      {
        id: "domain",
        kind: "domain",
        label: theme.label,
        color: theme.color,
        detail: <DetailRow label="Domain" value={`This case is classified under ${theme.label}.`} />,
      },
      {
        id: "institution",
        kind: "institution",
        label: caseData.institution_name || "Not specified",
        color: "#ffc857",
        detail: (
          <>
            <DetailRow label="Institution" value={caseData.institution_name || "Not specified"} />
            {caseData.institution_name && caseData.institution_name !== "Not specified" && (
              <button
                onClick={() => onOpenInstitution(caseData.domain, caseData.institution_name)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-300/15"
              >
                <Landmark className="size-3.5" /> Explore this institution
              </button>
            )}
          </>
        ),
      },
      ...report.documents.map((doc) => ({
        id: `doc-${doc.id}`,
        kind: "document" as const,
        label: doc.filename.length > 20 ? `${doc.filename.slice(0, 20)}...` : doc.filename,
        color: "#37f29a",
        detail: (
          <>
            <DetailRow label="Filename" value={doc.filename} />
            <DetailRow label="Indexed" value={doc.indexed ? `Yes -- ${doc.chunks_indexed} chunks` : "Not yet indexed"} />
            {doc.text_extract && <DetailRow label="Extract" value={doc.text_extract.slice(0, 240)} />}
          </>
        ),
      })),
      ...report.appeals.map((appeal) => ({
        id: `appeal-${appeal.id}`,
        kind: "appeal" as const,
        label: appeal.title.length > 20 ? `${appeal.title.slice(0, 20)}...` : appeal.title,
        color: "#9b5cff",
        detail: (
          <>
            <DetailRow label="Document type" value={appeal.document_type} />
            <DetailRow label="Status" value={appeal.status} />
            <DetailRow label="Preview" value={appeal.content.slice(0, 240)} />
          </>
        ),
      })),
    ];

    return result;
  }, [report, theme]);

  const canvasNodes: CanvasNode[] = useMemo(
    () => nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, color: n.color, r: n.kind === "case" ? 40 : n.kind === "domain" || n.kind === "institution" ? 26 : 20 })),
    [nodes]
  );
  const canvasEdges: CanvasEdge[] = useMemo(() => nodes.slice(1).map((n) => ({ source: "case", target: n.id })), [nodes]);

  const active = nodes.find((n) => n.id === selectedNode) ?? nodes[0];

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border border-white/10 bg-glass p-3 backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-proxy-tertiary" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your cases..."
              className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-2 text-xs text-proxy-text outline-none placeholder:text-proxy-tertiary focus:border-cyan-300/40"
            />
          </div>
          <NewAnalysisButton compact />
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-proxy-tertiary" /></div>
        ) : filteredAnalyses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-3 text-center">
            <p className="text-xs text-proxy-tertiary">No analyses yet -- ask the live multi-agent AI Assistant a question to create your first real case.</p>
            <NewAnalysisButton />
          </div>
        ) : (
          <div className="max-h-[640px] space-y-1.5 overflow-y-auto pr-1">
            {filteredAnalyses.map((a) => {
              const t = domainTheme(a.domains_involved[0] ?? a.domain);
              const isActive = a.id === selectedCaseId;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedCaseId(a.id)}
                  className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                    isActive ? "border-white/25 bg-white/[0.05]" : "border-white/5 bg-black/20 hover:border-white/15"
                  }`}
                  style={isActive ? { borderLeftColor: t.color, borderLeftWidth: 3 } : undefined}
                >
                  <p className="line-clamp-2 text-xs font-medium text-proxy-text">{a.title}</p>
                  <p className="mt-1 text-[10px] text-proxy-tertiary">{t.label} &middot; {timeAgo(a.updated_at)}</p>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#050608] shadow-glow-cyan">
        {loadingReport ? (
          <div className="flex h-full min-h-[600px] items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>
        ) : (
          <GraphCanvas
            nodes={canvasNodes}
            edges={canvasEdges}
            anchorId="case"
            selectedId={selectedNode}
            onSelect={setSelectedNode}
            renderIcon={(kind, color) => <NodeIcon kind={kind as GraphNode["kind"]} color={color} />}
            legend={CASE_GRAPH_LEGEND}
            emptyMessage="Select a case to explore its knowledge graph."
            headerBadge={
              <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
                <p className="text-xs uppercase tracking-[.18em] text-proxy-tertiary">Case Knowledge Graph</p>
                <p className="text-sm text-cyan-100">{nodes.length} real entities &middot; drag to explore, scroll to zoom</p>
              </div>
            }
          />
        )}
      </section>

      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        {active ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-lg border" style={{ borderColor: active.color, boxShadow: `0 0 18px ${active.color}55` }}>
                <NodeIcon kind={active.kind} color={active.color} large />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">{active.kind}</p>
                <p className="truncate text-sm font-semibold text-proxy-text">{active.label}</p>
              </div>
            </div>
            <div className="space-y-3">{active.detail}</div>
          </>
        ) : (
          <p className="text-xs text-proxy-tertiary">Select a node to inspect it.</p>
        )}
      </aside>
    </div>
  );
}

function NodeIcon({ kind, color, large }: { kind: GraphNode["kind"]; color: string; large?: boolean }) {
  const cls = large ? "size-4" : "size-full";
  const style = { color };
  switch (kind) {
    case "case": return <ScrollText className={cls} style={style} />;
    case "domain": return <Layers className={cls} style={style} />;
    case "institution": return <Building2 className={cls} style={style} />;
    case "document": return <FileText className={cls} style={style} />;
    case "appeal": return <Scale className={cls} style={style} />;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="mb-1 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">{label}</p>
      <p className="text-sm leading-6 text-proxy-muted">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Institution Intelligence                                                */
/* ---------------------------------------------------------------------- */

interface InstitutionSlot {
  domain: string;
  institution: string;
}

interface InstitutionResult {
  patterns: InstitutionPattern[];
  similar: SimilarCase[];
  avgConfidence: number | null;
}

const RECENT_QUERIES_KEY = "proxy:kg-institution-recent";

function loadRecentQueries(): InstitutionSlot[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_QUERIES_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function InstitutionTab({
  analyses, prefill, onOpenCase,
}: {
  analyses: AnalysisCase[];
  prefill: InstitutionPrefill | null;
  onOpenCase: (caseId: string) => void;
}) {
  const [slots, setSlots] = useState<InstitutionSlot[]>([{ domain: "health_insurance", institution: "" }]);
  const [results, setResults] = useState<Record<number, InstitutionResult | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<InstitutionSlot[]>([]);

  useEffect(() => setRecent(loadRecentQueries()), []);

  useEffect(() => {
    if (prefill) {
      setSlots([{ domain: prefill.domain, institution: prefill.institution }]);
      window.setTimeout(() => runSearch([{ domain: prefill.domain, institution: prefill.institution }]), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const knownInstitutions = useMemo(() => {
    const set = new Set<string>();
    for (const a of analyses) if (a.institution_name && a.institution_name !== "Not specified") set.add(a.institution_name);
    return Array.from(set);
  }, [analyses]);

  function updateSlot(index: number, patch: Partial<InstitutionSlot>) {
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function addComparison() {
    if (slots.length >= 2) return;
    setSlots((current) => [...current, { domain: "health_insurance", institution: "" }]);
  }

  function removeSlot(index: number) {
    setSlots((current) => current.filter((_, i) => i !== index));
    setResults((current) => {
      const next: Record<number, InstitutionResult | null> = {};
      Object.entries(current).forEach(([key, value]) => {
        const i = Number(key);
        if (i < index) next[i] = value;
        else if (i > index) next[i - 1] = value;
      });
      return next;
    });
  }

  async function runSearch(activeSlots: InstitutionSlot[]) {
    const filled = activeSlots.filter((s) => s.institution.trim());
    if (filled.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await Promise.all(
        activeSlots.map(async (slot) => {
          if (!slot.institution.trim()) return null;
          const [patterns, similar] = await Promise.all([
            getInstitutionPatterns(slot.domain, slot.institution.trim()),
            getSimilarCases(slot.domain, slot.institution.trim(), 5),
          ]);
          const confidences = patterns.map((p) => p.confidence);
          return {
            patterns,
            similar,
            avgConfidence: confidences.length ? confidences.reduce((s, c) => s + c, 0) / confidences.length : null,
          };
        })
      );
      const nextResults: Record<number, InstitutionResult | null> = {};
      fetched.forEach((result, index) => {
        nextResults[index] = result;
      });
      setResults(nextResults);
      const nextRecent = [...filled, ...recent.filter((r) => !filled.some((f) => f.domain === r.domain && f.institution === r.institution))].slice(0, 8);
      setRecent(nextRecent);
      window.localStorage.setItem(RECENT_QUERIES_KEY, JSON.stringify(nextRecent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the knowledge graph.");
      setResults({});
    } finally {
      setLoading(false);
    }
  }

  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);

  const graphNodes: InstitutionGraphNode[] = useMemo(() => {
    const list: InstitutionGraphNode[] = [];
    slots.forEach((slot, index) => {
      const result = results[index];
      if (!result) return;
      const theme = domainTheme(slot.domain);
      list.push({
        id: `institution-${index}`,
        kind: "institution",
        label: slot.institution,
        color: theme.color,
        r: 32,
        detail: <InstitutionScoreDetail slot={slot} result={result} />,
      });
      result.patterns.forEach((p, i) => {
        list.push({
          id: `pattern-${index}-${i}`,
          kind: "pattern",
          label: p.pattern.length > 26 ? `${p.pattern.slice(0, 26)}...` : p.pattern,
          color: "#00e5ff",
          r: 14 + p.confidence * 12,
          detail: (
            <>
              <DetailRow label="Pattern" value={p.pattern} />
              <DetailRow label="Confidence" value={`${Math.round(p.confidence * 100)}%`} />
            </>
          ),
        });
      });
      result.similar.forEach((c) => {
        list.push({
          id: `case-${index}-${c.case_id}`,
          kind: "case",
          label: c.title.length > 24 ? `${c.title.slice(0, 24)}...` : c.title,
          color: "#9b5cff",
          r: 18,
          detail: (
            <>
              <DetailRow label="Title" value={c.title} />
              <DetailRow label="Summary" value={c.summary} />
              <button
                onClick={() => onOpenCase(c.case_id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300/25 bg-purple-300/10 px-3 py-1.5 text-xs text-purple-100 hover:bg-purple-300/15"
              >
                <Network className="size-3.5" /> Open in Case Graph
              </button>
            </>
          ),
        });
      });
    });
    return list;
  }, [slots, results, onOpenCase]);

  const graphEdges: CanvasEdge[] = useMemo(() => {
    const list: CanvasEdge[] = [];
    slots.forEach((_slot, index) => {
      const result = results[index];
      if (!result) return;
      result.patterns.forEach((_, i) => list.push({ source: `institution-${index}`, target: `pattern-${index}-${i}` }));
      result.similar.forEach((c) => list.push({ source: `institution-${index}`, target: `case-${index}-${c.case_id}` }));
    });
    return list;
  }, [slots, results]);

  const activeInstitutionCount = Object.values(results).filter(Boolean).length;
  const canvasNodes: CanvasNode[] = graphNodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, color: n.color, r: n.r }));
  const selectedGraphDetail = graphNodes.find((n) => n.id === selectedGraphNode);

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="size-4 text-cyan-200" />
          <h2 className="font-semibold">Query the institution graph</h2>
        </div>
        <p className="mb-4 text-xs leading-5 text-proxy-muted">
          Real cross-user pattern intelligence and similar cases pulled from the knowledge graph. Compare up to two institutions side by side.
        </p>

        {slots.map((slot, index) => (
          <div key={index} className="mb-3 rounded-xl border border-white/10 bg-black/20 p-3">
            {slots.length > 1 && (
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-proxy-tertiary">Query {index + 1}</span>
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
              <input
                value={slot.institution}
                onChange={(e) => updateSlot(index, { institution: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && runSearch(slots)}
                placeholder="e.g. Star Health Insurance"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60"
              />
            </label>
          </div>
        ))}

        {slots.length < 2 && (
          <button onClick={addComparison} className="mb-3 inline-flex items-center gap-1.5 text-xs text-cyan-200 hover:text-cyan-100">
            <Plus className="size-3.5" /> Compare with another institution
          </button>
        )}

        {knownInstitutions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {knownInstitutions.slice(0, 6).map((name) => (
              <button key={name} onClick={() => updateSlot(0, { institution: name })} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-proxy-muted hover:border-cyan-300/30 hover:text-cyan-100">
                {name}
              </button>
            ))}
          </div>
        )}

        {recent.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Recent queries</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((r, i) => (
                <button
                  key={`${r.domain}-${r.institution}-${i}`}
                  onClick={() => { setSlots([r]); runSearch([r]); }}
                  className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-proxy-muted hover:border-cyan-300/30 hover:text-cyan-100"
                >
                  {r.institution} &middot; {domainTheme(r.domain).label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => runSearch(slots)} disabled={!slots.some((s) => s.institution.trim()) || loading} className="search-orb inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Query graph
        </button>
        <style jsx>{`
          .search-orb { background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0); }
        `}</style>
      </aside>

      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#050608] shadow-glow-cyan">
        {loading ? (
          <div className="flex h-full min-h-[600px] items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>
        ) : error ? (
          <div className="flex h-full min-h-[600px] items-center justify-center p-6 text-center">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : (
          <GraphCanvas
            nodes={canvasNodes}
            edges={graphEdges}
            anchorId={activeInstitutionCount === 1 ? "institution-0" : undefined}
            selectedId={selectedGraphNode}
            onSelect={setSelectedGraphNode}
            renderIcon={(kind, color) => <InstitutionNodeIcon kind={kind as InstitutionGraphNode["kind"]} color={color} />}
            legend={INSTITUTION_GRAPH_LEGEND}
            emptyMessage="Pick a domain and institution to query real pattern intelligence."
            headerBadge={
              activeInstitutionCount > 0 ? (
                <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
                  <p className="text-xs uppercase tracking-[.18em] text-proxy-tertiary">Institution Graph</p>
                  <p className="text-sm text-cyan-100">{activeInstitutionCount} institution{activeInstitutionCount === 1 ? "" : "s"} &middot; {canvasNodes.length} real entities</p>
                </div>
              ) : undefined
            }
          />
        )}
      </section>

      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        {selectedGraphDetail ? (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-lg border" style={{ borderColor: selectedGraphDetail.color, boxShadow: `0 0 18px ${selectedGraphDetail.color}55` }}>
                <InstitutionNodeIcon kind={selectedGraphDetail.kind} color={selectedGraphDetail.color} large />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">{selectedGraphDetail.kind}</p>
                <p className="truncate text-sm font-semibold text-proxy-text">{selectedGraphDetail.label}</p>
              </div>
            </div>
            <div className="space-y-3">{selectedGraphDetail.detail}</div>
          </>
        ) : (
          <p className="text-xs text-proxy-tertiary">Query an institution, then select a node to inspect it -- drag nodes to explore, scroll to zoom.</p>
        )}
      </aside>
    </div>
  );
}

interface InstitutionGraphNode {
  id: string;
  kind: "institution" | "pattern" | "case";
  label: string;
  color: string;
  r: number;
  detail: React.ReactNode;
}

const INSTITUTION_GRAPH_LEGEND = [
  { label: "Institution", color: "#ffc857" },
  { label: "Pattern", color: "#00e5ff" },
  { label: "Similar Case", color: "#9b5cff" },
];

function InstitutionNodeIcon({ kind, color, large }: { kind: InstitutionGraphNode["kind"]; color: string; large?: boolean }) {
  const cls = large ? "size-4" : "size-full";
  const style = { color };
  switch (kind) {
    case "institution": return <Building2 className={cls} style={style} />;
    case "pattern": return <Sparkles className={cls} style={style} />;
    case "case": return <ScrollText className={cls} style={style} />;
  }
}

function InstitutionScoreDetail({ slot, result }: { slot: InstitutionSlot; result: InstitutionResult }) {
  const theme = domainTheme(slot.domain);
  const circumference = 2 * Math.PI * 26;
  const pct = result.avgConfidence ?? 0;
  const offset = circumference * (1 - pct);
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <svg width="60" height="60" viewBox="0 0 64 64" className="shrink-0">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r="26" fill="none" stroke={theme.color} strokeWidth="5"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset .6s ease" }}
          />
          <text x="32" y="37" textAnchor="middle" fill="#dbeafe" fontSize="13" fontWeight={600}>
            {result.avgConfidence !== null ? `${Math.round(pct * 100)}%` : "-"}
          </text>
        </svg>
        <div className="min-w-0">
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${theme.color}1a`, color: theme.color }}>{theme.label}</span>
          <p className="mt-1 text-[11px] text-proxy-tertiary">{result.patterns.length} pattern{result.patterns.length === 1 ? "" : "s"} &middot; {result.similar.length} similar case{result.similar.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <DetailRow label="Institution" value={slot.institution} />
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Cross-Domain Profile                                                    */
/* ---------------------------------------------------------------------- */

function ProfileTab({
  analyses, onOpenCase, onOpenInstitution,
}: {
  analyses: AnalysisCase[];
  onOpenCase: (caseId: string) => void;
  onOpenInstitution: (domain: string, institution: string) => void;
}) {
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  useEffect(() => {
    getMyCitizenProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const analysesById = useMemo(() => new Map(analyses.map((a) => [a.id, a])), [analyses]);

  const timeline = useMemo(
    () => [...analyses].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [analyses]
  );

  const overallConfidence = useMemo(() => {
    const values = analyses.map((a) => a.avg_confidence).filter((c): c is number => c !== null);
    return values.length ? values.reduce((s, c) => s + c, 0) / values.length : null;
  }, [analyses]);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>;
  }
  if (!profile || profile.total_cases === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 text-center">
        <Users className="size-8 text-proxy-tertiary" />
        <p className="text-sm text-proxy-tertiary">Your cross-domain profile builds automatically as you run analyses.</p>
        <NewAnalysisButton />
      </div>
    );
  }

  const maxCases = Math.max(1, ...profile.by_domain.map((d) => d.case_count));
  const active = profile.by_domain.find((d) => d.domain === selectedDomain) ?? null;
  const mostActive = [...profile.by_domain].sort((a, b) => b.case_count - a.case_count)[0];
  const activeDomainConfidence = computeDomainConfidence(active, analysesById);

  const profileNodes: CanvasNode[] = [
    { id: "you", kind: "you", label: "YOU", color: "#00e5ff", r: 34 },
    ...profile.by_domain.map((entry) => ({
      id: entry.domain,
      kind: "domain",
      label: domainTheme(entry.domain).label,
      color: domainTheme(entry.domain).color,
      r: 16 + (entry.case_count / maxCases) * 20,
    })),
  ];
  const profileEdges: CanvasEdge[] = profile.by_domain.map((entry) => ({ source: "you", target: entry.domain }));
  const profileLegend = profile.by_domain.map((entry) => ({ label: domainTheme(entry.domain).label, color: domainTheme(entry.domain).color }));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <ProfileStat icon={Users} label="Total cases" value={String(profile.total_cases)} accent="#00e5ff" />
        <ProfileStat icon={Layers} label="Active domains" value={String(profile.domains_active_in.length)} accent="#9b5cff" />
        <ProfileStat icon={TrendingUp} label="Avg. confidence" value={overallConfidence !== null ? `${Math.round(overallConfidence * 100)}%` : "-"} accent="#37f29a" />
        <ProfileStat icon={Building2} label="Most active domain" value={mostActive ? domainTheme(mostActive.domain).label : "-"} accent="#ffc857" />
      </div>

      {timeline.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-glass p-3 backdrop-blur-2xl">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">
            <Clock className="size-3" /> Activity timeline
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {timeline.map((a) => {
              const t = domainTheme(a.domains_involved[0] ?? a.domain);
              return (
                <button
                  key={a.id}
                  onClick={() => onOpenCase(a.id)}
                  className="w-40 shrink-0 rounded-lg border border-white/5 bg-black/20 p-2 text-left hover:border-white/20"
                  style={{ borderTopColor: t.color, borderTopWidth: 2 }}
                >
                  <p className="line-clamp-2 text-[11px] text-proxy-text">{a.title}</p>
                  <p className="mt-1 text-[9px] text-proxy-tertiary">{new Date(a.created_at).toLocaleDateString()}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#050608] shadow-glow-cyan">
          <GraphCanvas
            nodes={profileNodes}
            edges={profileEdges}
            anchorId="you"
            selectedId={selectedDomain}
            onSelect={setSelectedDomain}
            renderIcon={(kind, color) => (kind === "you" ? <Users className="size-full" style={{ color }} /> : <Layers className="size-full" style={{ color }} />)}
            legend={profileLegend}
            headerBadge={
              <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
                <p className="text-xs uppercase tracking-[.18em] text-proxy-tertiary">Your cross-domain footprint</p>
                <p className="text-sm text-cyan-100">{profile.total_cases} case{profile.total_cases === 1 ? "" : "s"} across {profile.domains_active_in.length} domain{profile.domains_active_in.length === 1 ? "" : "s"}</p>
              </div>
            }
          />
        </section>

        <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
          {active ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid size-9 place-items-center rounded-lg border" style={{ borderColor: domainTheme(active.domain).color, boxShadow: `0 0 18px ${domainTheme(active.domain).color}55` }}>
                    <Layers className="size-4" style={{ color: domainTheme(active.domain).color }} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Domain</p>
                    <p className="text-sm font-semibold text-proxy-text">{domainTheme(active.domain).label}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedDomain(null)} className="text-proxy-tertiary hover:text-proxy-text"><X className="size-4" /></button>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/20 p-2 text-center">
                  <p className="text-sm font-semibold text-proxy-text">{active.case_count}</p>
                  <p className="text-[9px] text-proxy-tertiary">Cases</p>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/20 p-2 text-center">
                  <p className="text-sm font-semibold text-proxy-text">{activeDomainConfidence !== null ? `${Math.round(activeDomainConfidence * 100)}%` : "-"}</p>
                  <p className="text-[9px] text-proxy-tertiary">Avg. confidence</p>
                </div>
              </div>
              {active.institutions.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Institutions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {active.institutions.map((name) => (
                      <button
                        key={name}
                        onClick={() => onOpenInstitution(active.domain, name)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-proxy-muted hover:border-amber-300/30 hover:text-amber-100"
                      >
                        <Landmark className="size-2.5" /> {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mb-1.5 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Cases</p>
              <div className="space-y-1.5">
                {active.cases.map((c) => {
                  const full = analysesById.get(c.case_id);
                  return (
                    <button
                      key={c.case_id}
                      onClick={() => onOpenCase(c.case_id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-black/20 p-2 text-left text-xs text-proxy-text hover:border-cyan-300/25"
                    >
                      <ScrollText className="size-3 shrink-0 text-proxy-tertiary" />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {full?.avg_confidence !== null && full?.avg_confidence !== undefined && (
                        <span className="shrink-0 text-[10px] text-proxy-tertiary">{Math.round(full.avg_confidence * 100)}%</span>
                      )}
                      <ChevronRight className="size-3 shrink-0 text-proxy-tertiary" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs text-proxy-tertiary">Click a domain node to see confidence, institutions, and cases behind it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function computeDomainConfidence(active: CitizenDomainProfile | null, analysesById: Map<string, AnalysisCase>): number | null {
  if (!active) return null;
  const values = active.cases
    .map((c: { case_id: string }) => analysesById.get(c.case_id)?.avg_confidence)
    .filter((c): c is number => c !== null && c !== undefined);
  return values.length ? values.reduce((s, c) => s + c, 0) / values.length : null;
}

function ProfileStat({ icon: Icon, label, value, accent }: { icon: typeof Users; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
      <div className="mb-2 grid size-8 place-items-center rounded-lg border" style={{ borderColor: `${accent}40`, backgroundColor: `${accent}15` }}>
        <Icon className="size-4" style={{ color: accent }} />
      </div>
      <p className="truncate text-lg font-semibold text-proxy-text">{value}</p>
      <p className="text-[11px] text-proxy-tertiary">{label}</p>
    </div>
  );
}
