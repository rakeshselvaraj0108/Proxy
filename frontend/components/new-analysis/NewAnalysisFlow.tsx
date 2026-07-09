"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Upload, Play, Loader2, FileText, AlertCircle, CheckCircle2, Sparkles,
  ArrowUpRight, Trash2, RotateCcw, ClipboardList, ScrollText,
} from "lucide-react";
import {
  classifyQuery, runMultiDomainCase, uploadDocument, deleteDocument, listAnalyses,
  type DomainCandidate, type MultiDomainCaseResponse, type VaultDocument,
} from "@/lib/api-client";
import { DOMAIN_THEME, domainTheme } from "@/components/chat/domain-theme";
import { ReasoningLanes } from "@/components/chat/ReasoningLanes";
import { CitationConstellation } from "@/components/chat/CitationConstellation";
import { markdownComponents } from "@/components/chat/markdown-components";
import { ESTIMATED_STAGES } from "@/components/chat/pipeline";
import { PREF_KEYS, getPref } from "@/lib/preferences";

const DOMAIN_PROMPTS: Record<string, string> = {
  health_insurance: "My health insurance claim was denied for a pre-existing condition exclusion.",
  banking: "My bank charged me twice for the same transaction and won't refund it.",
  airlines: "My flight was cancelled and the airline refused a refund.",
  telecom: "My telecom provider is billing me for a plan I cancelled two months ago.",
  ecommerce: "An online seller sent me a counterfeit product and refuses a return.",
  government: "My passport renewal application has been stuck in review for 90 days.",
  housing: "My builder delayed possession of my flat by 18 months under RERA.",
  healthcare: "I was overcharged for a hospital procedure that my insurance should have covered.",
};

const DOMAIN_TAGLINES: Record<string, string> = {
  health_insurance: "Claim denials, reimbursement disputes, policy clause interpretation.",
  banking: "Chargebacks, unauthorized transactions, loan and fee disputes.",
  airlines: "Cancellations, delays, denied boarding, baggage claims.",
  telecom: "Billing errors, service outages, plan mis-selling, porting.",
  ecommerce: "Refunds, defective products, warranty denials, delivery disputes.",
  government: "RTI requests, certificates, public scheme grievance appeals.",
  housing: "Security deposits, rent agreements, builder possession delays.",
  healthcare: "Hospital billing, discharge records, duplicate charges.",
};

interface PendingUpload {
  id: string;
  filename: string;
  progress: number;
  error?: string;
}

interface DomainAnswer {
  domain: string;
  route: string;
  report: string | null;
}

export function NewAnalysisFlow() {
  const router = useRouter();
  const [focusDomain, setFocusDomain] = useState(() => getPref(PREF_KEYS.newAnalysisDefaultDomain, "health_insurance"));
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});
  const [issueText, setIssueText] = useState("");
  const [livePreview, setLivePreview] = useState<DomainCandidate[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<VaultDocument[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [draftAppeals, setDraftAppeals] = useState(false);
  const [runState, setRunState] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [filledCount, setFilledCount] = useState(0);
  const [result, setResult] = useState<MultiDomainCaseResponse | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    listAnalyses()
      .then((analyses) => {
        const counts: Record<string, number> = {};
        for (const a of analyses) for (const d of a.domains_involved) counts[d] = (counts[d] ?? 0) + 1;
        setDomainCounts(counts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (issueText.trim().length < 12) {
      setLivePreview([]);
      return;
    }
    setClassifying(true);
    const timer = window.setTimeout(async () => {
      try {
        setLivePreview((await classifyQuery(issueText)).candidates);
      } catch {
        setLivePreview([]);
      } finally {
        setClassifying(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [issueText]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const pendingId = crypto.randomUUID();
        setPendingUploads((current) => [...current, { id: pendingId, filename: file.name, progress: 0 }]);
        try {
          const doc = await uploadDocument(focusDomain, file, {
            onProgress: (percent) =>
              setPendingUploads((current) => current.map((p) => (p.id === pendingId ? { ...p, progress: percent } : p))),
          });
          setPendingUploads((current) => current.filter((p) => p.id !== pendingId));
          setUploadedDocs((current) => [doc, ...current]);
        } catch (err) {
          setPendingUploads((current) =>
            current.map((p) => (p.id === pendingId ? { ...p, error: err instanceof Error ? err.message : "Upload failed" } : p))
          );
          window.setTimeout(() => setPendingUploads((current) => current.filter((p) => p.id !== pendingId)), 4000);
        }
      }
    },
    [focusDomain]
  );

  async function removeDoc(doc: VaultDocument) {
    setUploadedDocs((current) => current.filter((d) => d.id !== doc.id));
    try {
      await deleteDocument(doc.id);
    } catch {
      // best-effort -- it's already removed from this session's intake list
    }
  }

  function pickDomain(domain: string) {
    setFocusDomain(domain);
    if (!issueText.trim()) setIssueText(DOMAIN_PROMPTS[domain] ?? "");
  }

  const canRun = issueText.trim().length > 12 && runState !== "running";

  async function runAnalysis() {
    if (!canRun) return;
    setRunState("running");
    setError(null);
    setResult(null);
    setFilledCount(0);
    const id = crypto.randomUUID();
    setCaseId(id);

    let stageIndex = 0;
    stageTimerRef.current = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, ESTIMATED_STAGES.length);
      setFilledCount(stageIndex);
    }, 1300);

    try {
      const response = await runMultiDomainCase(id, issueText, draftAppeals);
      setResult(response);
      setRunState("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong reaching the multi-agent backend.");
      setRunState("error");
    } finally {
      if (stageTimerRef.current) window.clearInterval(stageTimerRef.current);
      setFilledCount(0);
    }
  }

  function reset() {
    setIssueText("");
    setUploadedDocs([]);
    setResult(null);
    setRunState("idle");
    setCaseId(null);
    setError(null);
  }

  const lanes = useMemo(() => {
    if (runState === "complete" && result) {
      return result.domains_analyzed.map((d) => ({ domain: d, trace: result.per_domain_results[d]?.agent_trace }));
    }
    const domains = livePreview.length ? livePreview.map((c) => c.domain) : [focusDomain];
    return domains.map((d) => ({ domain: d, trace: undefined as string[] | undefined }));
  }, [runState, result, livePreview, focusDomain]);

  return (
    <div
      className="relative flex min-h-[720px] flex-1 flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
    >
      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-30 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-cyan-300/60 bg-cyan-300/5 px-10 py-8 text-center">
            <Upload className="mx-auto mb-2 size-9 text-cyan-200" />
            <p className="text-sm font-medium text-cyan-100">Drop to add evidence to this analysis</p>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.csv,.json,image/*"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      <DomainDeck focusDomain={focusDomain} counts={domainCounts} onSelect={pickDomain} />

      <section className="rounded-2xl border border-cyan-300/20 bg-glass p-4 shadow-glow-cyan backdrop-blur-2xl sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-cyan-200">Structured analysis flow</p>
            <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{domainTheme(focusDomain).label}: describe, evidence, analyze</h2>
          </div>
          <FlowStepper runState={runState} />
        </div>
        <div className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
          <IntakePanel
            issueText={issueText}
            setIssueText={setIssueText}
            livePreview={livePreview}
            classifying={classifying}
            uploadedDocs={uploadedDocs}
            pendingUploads={pendingUploads}
            onPick={() => fileInputRef.current?.click()}
            onRemoveDoc={removeDoc}
            draftAppeals={draftAppeals}
            setDraftAppeals={setDraftAppeals}
            canRun={canRun}
            runState={runState}
            onRun={runAnalysis}
          />
          <LiveFlowPanel lanes={lanes} runState={runState} filledCount={filledCount} error={error} />
        </div>
      </section>

      {runState === "complete" && result && (
        <ResultsPanel
          result={result}
          caseId={caseId}
          onReset={reset}
          onOpenAnalyses={() => router.push("/dashboard/analyses")}
          onOpenAppeals={() => router.push("/dashboard/appeals")}
        />
      )}
    </div>
  );
}

function FlowStepper({ runState }: { runState: "idle" | "running" | "complete" | "error" }) {
  const steps = ["Domain", "Intake", "Agents", "Results"];
  const active = runState === "idle" ? 1 : runState === "running" ? 2 : 3;
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto">
      {steps.map((step, index) => (
        <div
          key={step}
          className={`min-w-fit rounded-full border px-3 py-1.5 text-xs ${
            index <= active ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-proxy-tertiary"
          }`}
        >
          {step}
        </div>
      ))}
    </div>
  );
}

function DomainDeck({
  focusDomain, counts, onSelect,
}: {
  focusDomain: string;
  counts: Record<string, number>;
  onSelect: (domain: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">8-domain analysis cockpit</h2>
          <p className="mt-1 text-sm text-proxy-muted">Pick a focus domain for uploaded evidence -- the multi-agent router still classifies your description across every domain automatically.</p>
        </div>
        <span className="rounded-full border border-green-300/25 bg-green-300/10 px-3 py-1 text-xs text-green-100">8/8 domains online</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Object.keys(DOMAIN_THEME).map((domain) => {
          const theme = domainTheme(domain);
          const active = focusDomain === domain;
          return (
            <button
              key={domain}
              onClick={() => onSelect(domain)}
              className={`motion-card rounded-lg border p-4 text-left transition-colors ${
                active ? "border-white/25 bg-white/[0.04] shadow-glow-cyan" : "border-white/10 bg-black/20"
              }`}
              style={active ? { borderColor: `${theme.color}60` } : undefined}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">{theme.label}</h3>
                <span
                  className="rounded-full px-2 py-1 text-[11px]"
                  style={{ backgroundColor: active ? `${theme.color}25` : "rgba(255,255,255,.06)", color: active ? theme.color : "var(--proxy-tertiary)" }}
                >
                  {active ? "Active" : "Select"}
                </span>
              </div>
              <p className="min-h-10 text-xs leading-5 text-proxy-muted">{DOMAIN_TAGLINES[domain]}</p>
              <div className="mt-3 text-xs text-proxy-tertiary">{counts[domain] ?? 0} past analys{(counts[domain] ?? 0) === 1 ? "is" : "es"}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IntakePanel({
  issueText, setIssueText, livePreview, classifying, uploadedDocs, pendingUploads, onPick, onRemoveDoc, draftAppeals, setDraftAppeals, canRun, runState, onRun,
}: {
  issueText: string;
  setIssueText: (v: string) => void;
  livePreview: DomainCandidate[];
  classifying: boolean;
  uploadedDocs: VaultDocument[];
  pendingUploads: PendingUpload[];
  onPick: () => void;
  onRemoveDoc: (doc: VaultDocument) => void;
  draftAppeals: boolean;
  setDraftAppeals: (v: boolean) => void;
  canRun: boolean;
  runState: "idle" | "running" | "complete" | "error";
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">1. Intake</h3>
        <button onClick={onPick} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-proxy-muted hover:border-cyan-300/30 hover:text-cyan-100">
          <Upload className="size-3" /> Add evidence
        </button>
      </div>

      {(uploadedDocs.length > 0 || pendingUploads.length > 0) && (
        <div className="mb-3 space-y-1.5">
          {pendingUploads.map((upload) => (
            <div key={upload.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate text-proxy-text">{upload.filename}</span>
                {upload.error ? (
                  <span className="flex items-center gap-1 text-red-200"><AlertCircle className="size-3" /> Failed</span>
                ) : (
                  <span className="text-proxy-tertiary">{upload.progress}%</span>
                )}
              </div>
              {!upload.error && (
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${upload.progress}%` }} />
                </div>
              )}
            </div>
          ))}
          {uploadedDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-cyan-200" />
              <span className="min-w-0 flex-1 truncate text-proxy-text">{doc.filename}</span>
              {doc.indexed ? (
                <span className="flex shrink-0 items-center gap-1 text-[10px] text-green-300"><CheckCircle2 className="size-3" /> Indexed</span>
              ) : (
                <span className="shrink-0 text-[10px] text-amber-300">Processing</span>
              )}
              <button onClick={() => onRemoveDoc(doc)} className="shrink-0 text-proxy-tertiary hover:text-red-200">
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">Describe the problem</span>
        <textarea
          value={issueText}
          onChange={(event) => setIssueText(event.target.value)}
          placeholder="Example: My builder delayed possession of my flat by 18 months under RERA."
          className="min-h-32 w-full rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-proxy-muted outline-none focus:border-cyan-300/60"
        />
      </label>

      {livePreview.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-proxy-tertiary">Detected:</span>
          {livePreview.map((candidate) => {
            const theme = domainTheme(candidate.domain);
            return (
              <span key={candidate.domain} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: `${theme.color}40`, backgroundColor: `${theme.color}1a`, color: theme.color }}>
                {theme.label}
              </span>
            );
          })}
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-xs text-proxy-muted">
        <input
          type="checkbox"
          checked={draftAppeals}
          onChange={(event) => setDraftAppeals(event.target.checked)}
          className="size-3.5 accent-cyan-300"
        />
        Also draft appeal / complaint letters (slower -- extra reasoning pass per domain)
      </label>

      <button
        onClick={onRun}
        disabled={!canRun}
        className="run-orb mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
      >
        {runState === "running" ? (
          <><Loader2 className="mr-2 inline size-4 animate-spin" /> Agents running{classifying ? "" : "..."}</>
        ) : (
          <><Play className="mr-2 inline size-4" /> Run Multi-Domain Analysis</>
        )}
      </button>

      <style jsx>{`
        .run-orb {
          background: radial-gradient(circle at 30% 30%, #5cf5ff, #00b8d9 55%, #6a3df0);
          box-shadow: 0 0 18px rgba(0, 229, 255, 0.35);
        }
      `}</style>
    </div>
  );
}

function LiveFlowPanel({
  lanes, runState, filledCount, error,
}: {
  lanes: Array<{ domain: string; trace?: string[] }>;
  runState: "idle" | "running" | "complete" | "error";
  filledCount: number;
  error: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">2. Live Agent Flow</h3>
        <span className="text-xs text-proxy-tertiary">Real multi-agent trace</span>
      </div>
      <ReasoningLanes lanes={lanes} processing={runState === "running"} filledCount={filledCount} />

      <div className="mt-4 rounded-xl border border-white/10 bg-[#050608] p-4 font-mono text-xs text-proxy-muted">
        <div className="mb-2 flex items-center gap-1.5 text-cyan-100"><ScrollText className="size-3.5" /> Console</div>
        {error ? (
          <p className="flex items-center gap-2 text-red-200"><AlertCircle className="size-3.5 shrink-0" /> {error}</p>
        ) : runState === "idle" ? (
          <p>Waiting for domain, evidence, or issue description...</p>
        ) : runState === "running" ? (
          <>
            <p className="mb-1"><span className="text-green-300">&#10003;</span> Domain Router: classifying across domains...</p>
            <p className="mb-1"><span className="text-green-300">&#10003;</span> {ESTIMATED_STAGES[Math.min(filledCount, ESTIMATED_STAGES.length - 1)]}...</p>
            <p className="text-proxy-tertiary">(estimate -- replaced by the real trace once the response lands)</p>
          </>
        ) : (
          <p><span className="text-green-300">&#10003;</span> Complete. Results and citations unlocked below.</p>
        )}
      </div>
    </div>
  );
}

function ResultsPanel({
  result, caseId, onReset, onOpenAnalyses, onOpenAppeals,
}: {
  result: MultiDomainCaseResponse;
  caseId: string | null;
  onReset: () => void;
  onOpenAnalyses: () => void;
  onOpenAppeals: () => void;
}) {
  const answers: DomainAnswer[] = Object.entries(result.per_domain_results).map(([domain, r]) => ({
    domain, route: r.route, report: r.final_report,
  }));
  const appealCount = Object.values(result.per_domain_results).reduce((sum, r) => sum + r.appeals.length, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg border border-green-300/25 bg-green-300/10">
            <Sparkles className="size-4 text-green-200" />
          </div>
          <div>
            <p className="text-sm font-semibold text-proxy-text">Analysis complete</p>
            <p className="text-[11px] text-proxy-tertiary">
              {result.domains_analyzed.length} domain{result.domains_analyzed.length === 1 ? "" : "s"} analyzed &middot; {appealCount} document{appealCount === 1 ? "" : "s"} drafted
              {caseId ? <> &middot; Case <span className="font-mono text-proxy-muted">{caseId.slice(0, 8)}</span></> : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onOpenAnalyses} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/15">
            Open in My Analyses <ArrowUpRight className="size-3.5" />
          </button>
          {appealCount > 0 && (
            <button onClick={onOpenAppeals} className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300/25 bg-purple-300/10 px-3 py-1.5 text-xs text-purple-100 hover:bg-purple-300/15">
              <ClipboardList className="size-3.5" /> View drafted appeals
            </button>
          )}
          <button onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-proxy-muted hover:border-white/25">
            <RotateCcw className="size-3.5" /> New analysis
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {answers.map((answer) => (
          <DomainAnswerSection key={answer.domain} answer={answer} />
        ))}
      </div>

      {result.combined_citations.length > 0 && (
        <div className="mt-5 border-t border-white/5 pt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-proxy-tertiary">Citation map</p>
          <CitationConstellation citations={result.combined_citations} />
        </div>
      )}
    </section>
  );
}

function DomainAnswerSection({ answer }: { answer: DomainAnswer }) {
  const theme = domainTheme(answer.domain);
  const [expanded, setExpanded] = useState(true);
  if (!answer.report) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/5" style={{ borderLeftColor: theme.color, borderLeftWidth: 3 }}>
      <button onClick={() => setExpanded((current) => !current)} className="flex w-full items-center justify-between bg-white/[0.02] px-3 py-2 text-left">
        <span className="flex items-center gap-2 text-xs font-medium" style={{ color: theme.color }}>
          {theme.label}
          <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-proxy-tertiary">{answer.route}</span>
        </span>
        <span className="text-[10px] text-proxy-tertiary">{expanded ? "Collapse" : "Expand"}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {answer.report}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
