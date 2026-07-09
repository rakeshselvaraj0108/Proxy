"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search, FileText, Scale, Building2, Layers, Loader2, Network, Users,
  Landmark, X, ChevronRight, Sparkles, ScrollText,
} from "lucide-react";
import {
  listAnalyses, getCaseReport, getInstitutionPatterns, getMyCitizenProfile,
  type AnalysisCase, type CaseReportData, type InstitutionPattern, type CitizenProfile,
} from "@/lib/api-client";
import { DOMAIN_THEME, domainTheme } from "@/components/chat/domain-theme";

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

export function KnowledgeGraphExplorer() {
  const [tab, setTab] = useState<Tab>("case");
  const [analyses, setAnalyses] = useState<AnalysisCase[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(true);

  useEffect(() => {
    listAnalyses()
      .then(setAnalyses)
      .catch(() => {})
      .finally(() => setLoadingAnalyses(false));
  }, []);

  return (
    <div className="flex min-h-[760px] flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-glass p-2 backdrop-blur-2xl">
        <TabButton active={tab === "case"} icon={Network} label="Case Graph" onClick={() => setTab("case")} />
        <TabButton active={tab === "institution"} icon={Landmark} label="Institution Intelligence" onClick={() => setTab("institution")} />
        <TabButton active={tab === "profile"} icon={Users} label="My Cross-Domain Profile" onClick={() => setTab("profile")} />
      </div>

      {tab === "case" && <CaseGraphTab analyses={analyses} loading={loadingAnalyses} />}
      {tab === "institution" && <InstitutionTab analyses={analyses} />}
      {tab === "profile" && <ProfileTab />}
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

/* ---------------------------------------------------------------------- */
/* Case Graph                                                              */
/* ---------------------------------------------------------------------- */

interface GraphNode {
  id: string;
  kind: "case" | "domain" | "institution" | "document" | "appeal";
  label: string;
  color: string;
  x: number;
  y: number;
  detail: React.ReactNode;
}

const SIZE = 460;
const CENTER = SIZE / 2;
const INNER_R = 90;
const OUTER_R = 175;

function CaseGraphTab({ analyses, loading }: { analyses: AnalysisCase[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [report, setReport] = useState<CaseReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (analyses.length > 0 && !selectedCaseId) setSelectedCaseId(analyses[0].id);
  }, [analyses, selectedCaseId]);

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
        x: CENTER,
        y: CENTER,
        detail: (
          <>
            <DetailRow label="Full title" value={caseData.title} />
            <DetailRow label="Summary" value={caseData.summary} />
            <DetailRow label="Status" value={caseData.status} />
          </>
        ),
      },
    ];

    const domainAngle = -Math.PI / 2 - 0.5;
    result.push({
      id: "domain",
      kind: "domain",
      label: theme.label,
      color: theme.color,
      x: CENTER + INNER_R * Math.cos(domainAngle),
      y: CENTER + INNER_R * Math.sin(domainAngle),
      detail: <DetailRow label="Domain" value={`This case is classified under ${theme.label}.`} />,
    });

    const institutionAngle = -Math.PI / 2 + 0.5;
    result.push({
      id: "institution",
      kind: "institution",
      label: caseData.institution_name || "Not specified",
      color: "#ffc857",
      x: CENTER + INNER_R * Math.cos(institutionAngle),
      y: CENTER + INNER_R * Math.sin(institutionAngle),
      detail: <DetailRow label="Institution" value={caseData.institution_name || "Not specified"} />,
    });

    const outer = [
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

    outer.forEach((item, index) => {
      const angle = (index / Math.max(outer.length, 1)) * Math.PI * 2 - Math.PI / 2;
      result.push({ ...item, x: CENTER + OUTER_R * Math.cos(angle), y: CENTER + OUTER_R * Math.sin(angle) });
    });

    return result;
  }, [report, theme]);

  const active = nodes.find((n) => n.id === selectedNode) ?? nodes[0];

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border border-white/10 bg-glass p-3 backdrop-blur-2xl">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-proxy-tertiary" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your cases..."
            className="w-full rounded-lg border border-white/10 bg-black/30 py-1.5 pl-8 pr-2 text-xs text-proxy-text outline-none placeholder:text-proxy-tertiary focus:border-cyan-300/40"
          />
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin text-proxy-tertiary" /></div>
        ) : filteredAnalyses.length === 0 ? (
          <p className="p-2 text-xs text-proxy-tertiary">No analyses yet. Ask the AI Assistant a question to create one.</p>
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
        <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[.18em] text-proxy-tertiary">Case Knowledge Graph</p>
          <p className="text-sm text-cyan-100">{nodes.length} real entities</p>
        </div>
        {loadingReport ? (
          <div className="flex h-full min-h-[600px] items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full min-h-[600px] flex-col items-center justify-center gap-2 text-center">
            <Network className="size-8 text-proxy-tertiary" />
            <p className="text-sm text-proxy-tertiary">Select a case to explore its knowledge graph.</p>
          </div>
        ) : (
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full min-h-[600px] w-full" role="img" aria-label="Case knowledge graph">
            <defs>
              <radialGradient id="caseGraphGlow">
                <stop offset="0%" stopColor="rgba(0,229,255,.16)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
            </defs>
            <rect width={SIZE} height={SIZE} fill="url(#caseGraphGlow)" />
            {nodes.slice(1).map((node) => {
              const caseNode = nodes[0];
              const isCore = node.kind === "domain" || node.kind === "institution";
              const active = node.id === hoveredNode || node.id === selectedNode;
              return (
                <line
                  key={`edge-${node.id}`}
                  x1={caseNode.x}
                  y1={caseNode.y}
                  x2={node.x}
                  y2={node.y}
                  stroke={node.color}
                  strokeWidth={isCore ? 1.5 : 1}
                  strokeOpacity={active ? 0.6 : 0.18}
                />
              );
            })}
            {nodes.map((node) => {
              const isCase = node.kind === "case";
              const r = isCase ? 42 : node.kind === "domain" || node.kind === "institution" ? 26 : 20;
              const isActive = node.id === selectedNode;
              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill="rgba(5,5,8,.9)"
                    stroke={node.color}
                    strokeWidth={isActive ? 3 : 1.5}
                    style={{ filter: `drop-shadow(0 0 ${isActive ? 16 : 8}px ${node.color}66)`, transition: "all .15s ease" }}
                  />
                  <foreignObject x={node.x - 9} y={node.y - 9} width="18" height="18">
                    <NodeIcon kind={node.kind} color={node.color} />
                  </foreignObject>
                  <text x={node.x} y={node.y + r + 14} textAnchor="middle" fill="#dbeafe" fontSize={isCase ? 12 : 10}>
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>
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

function InstitutionTab({ analyses }: { analyses: AnalysisCase[] }) {
  const [domain, setDomain] = useState("health_insurance");
  const [institution, setInstitution] = useState("");
  const [patterns, setPatterns] = useState<InstitutionPattern[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownInstitutions = useMemo(() => {
    const set = new Set<string>();
    for (const a of analyses) if (a.institution_name && a.institution_name !== "Not specified") set.add(a.institution_name);
    return Array.from(set);
  }, [analyses]);

  async function search() {
    if (!institution.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setPatterns(await getInstitutionPatterns(domain, institution.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the knowledge graph.");
      setPatterns(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="size-4 text-cyan-200" />
          <h2 className="font-semibold">Query the institution graph</h2>
        </div>
        <p className="mb-4 text-xs leading-5 text-proxy-muted">
          Real cross-user pattern intelligence pulled from the knowledge graph -- prior cases and indexed documents logged against a domain + institution pair.
        </p>
        <label className="mb-3 block text-sm">
          <span className="mb-1.5 block text-xs text-proxy-muted">Domain</span>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60">
            {Object.entries(DOMAIN_THEME).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
          </select>
        </label>
        <label className="mb-2 block text-sm">
          <span className="mb-1.5 block text-xs text-proxy-muted">Institution name</span>
          <input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="e.g. Star Health Insurance"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/60"
          />
        </label>
        {knownInstitutions.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {knownInstitutions.slice(0, 6).map((name) => (
              <button key={name} onClick={() => setInstitution(name)} className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-proxy-muted hover:border-cyan-300/30 hover:text-cyan-100">
                {name}
              </button>
            ))}
          </div>
        )}
        <button onClick={search} disabled={!institution.trim() || loading} className="search-orb inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Query graph
        </button>
        <style jsx>{`
          .search-orb { background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0); }
        `}</style>
      </aside>

      <section className="rounded-2xl border border-white/10 bg-glass p-5 backdrop-blur-2xl">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>
        ) : error ? (
          <p className="text-sm text-red-200">{error}</p>
        ) : !patterns ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Sparkles className="size-8 text-proxy-tertiary" />
            <p className="text-sm text-proxy-tertiary">Pick a domain and institution to query real pattern intelligence.</p>
          </div>
        ) : patterns.length === 0 ? (
          <p className="text-sm text-proxy-tertiary">No graph patterns found yet for this domain + institution pair.</p>
        ) : (
          <div className="space-y-3">
            {patterns.map((p, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: `${domainTheme(p.domain).color}1a`, color: domainTheme(p.domain).color }}>
                    {domainTheme(p.domain).label}
                  </span>
                  <span className="text-xs text-proxy-tertiary">{Math.round(p.confidence * 100)}% confidence</span>
                </div>
                <p className="text-sm leading-6 text-proxy-text">{p.pattern}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-cyan-300" style={{ width: `${p.confidence * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Cross-Domain Profile                                                    */
/* ---------------------------------------------------------------------- */

function ProfileTab() {
  const [profile, setProfile] = useState<CitizenProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  useEffect(() => {
    getMyCitizenProfile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="size-6 animate-spin text-cyan-200" /></div>;
  }
  if (!profile || profile.total_cases === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-center">
        <Users className="size-8 text-proxy-tertiary" />
        <p className="text-sm text-proxy-tertiary">Your cross-domain profile builds automatically as you run analyses.</p>
      </div>
    );
  }

  const size = 420;
  const center = size / 2;
  const radius = 150;
  const maxCases = Math.max(1, ...profile.by_domain.map((d) => d.case_count));
  const active = profile.by_domain.find((d) => d.domain === selectedDomain) ?? null;

  return (
    <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#050608] shadow-glow-cyan">
        <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[.18em] text-proxy-tertiary">Your cross-domain footprint</p>
          <p className="text-sm text-cyan-100">{profile.total_cases} case{profile.total_cases === 1 ? "" : "s"} across {profile.domains_active_in.length} domain{profile.domains_active_in.length === 1 ? "" : "s"}</p>
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full min-h-[520px] w-full" role="img" aria-label="Cross-domain citizen profile">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray="2 7" />
          {profile.by_domain.map((entry, index) => {
            const theme = domainTheme(entry.domain);
            const angle = (index / profile.by_domain.length) * Math.PI * 2 - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            const r = 16 + (entry.case_count / maxCases) * 20;
            const isActive = selectedDomain === entry.domain;
            return (
              <g key={entry.domain}>
                <line x1={center} y1={center} x2={x} y2={y} stroke={theme.color} strokeOpacity={isActive ? 0.55 : 0.18} strokeWidth={1.5} />
                <circle
                  cx={x} cy={y} r={r} fill="rgba(5,5,8,.9)" stroke={theme.color} strokeWidth={isActive ? 3 : 1.5}
                  style={{ cursor: "pointer", filter: `drop-shadow(0 0 ${isActive ? 16 : 8}px ${theme.color}66)`, transition: "all .15s ease" }}
                  onClick={() => setSelectedDomain(entry.domain)}
                />
                <text x={x} y={y + 4} textAnchor="middle" fill="#dbeafe" fontSize="12" fontWeight={600} style={{ pointerEvents: "none" }}>
                  {entry.case_count}
                </text>
                <text x={x} y={y + r + 16} textAnchor="middle" fill="#a8b3c7" fontSize="11" style={{ pointerEvents: "none" }}>
                  {theme.label}
                </text>
              </g>
            );
          })}
          <circle cx={center} cy={center} r={36} fill="#07080b" stroke="rgba(255,255,255,.15)" strokeWidth={2} />
          <foreignObject x={center - 12} y={center - 12} width="24" height="24">
            <Users className="size-6 text-cyan-200" />
          </foreignObject>
          <text x={center} y={center + 52} textAnchor="middle" fill="#687386" fontSize="10">YOU</text>
        </svg>
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
            <p className="mb-3 text-xs text-proxy-tertiary">{active.case_count} case{active.case_count === 1 ? "" : "s"}</p>
            {active.institutions.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Institutions</p>
                <div className="flex flex-wrap gap-1.5">
                  {active.institutions.map((name) => (
                    <span key={name} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-proxy-muted">{name}</span>
                  ))}
                </div>
              </div>
            )}
            <p className="mb-1.5 text-[10px] uppercase tracking-[.16em] text-proxy-tertiary">Cases</p>
            <div className="space-y-1.5">
              {active.cases.map((c) => (
                <div key={c.case_id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 p-2 text-xs text-proxy-text">
                  <ChevronRight className="size-3 shrink-0 text-proxy-tertiary" />
                  <span className="truncate">{c.title}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-proxy-tertiary">Click a domain node to see the institutions and cases behind it.</p>
        )}
      </aside>
    </div>
  );
}
