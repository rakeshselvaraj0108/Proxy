"use client";

import { useState } from "react";
import { AppShell } from "@/components/proxy-v2/Shell";
import { SceneBackground } from "@/components/3d/SceneBackground";
import { Search, Loader2, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { classifyQuery, globalSearch, type DomainCandidate, type GlobalSearchResult } from "@/lib/api-client";

const DOMAIN_LABELS: Record<string, string> = {
  health_insurance: "Health Insurance",
  banking: "Banking",
  airlines: "Airlines",
  telecom: "Telecom",
  ecommerce: "E-commerce",
  government: "Government",
  housing: "Housing",
  healthcare: "Healthcare",
};

function domainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

function scoreColor(score: number): string {
  if (score >= 0.6) return "border-green-300/25 bg-green-300/10 text-green-100";
  if (score >= 0.4) return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.035] text-proxy-muted";
}

export default function CrossDomainSearchPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DomainCandidate[]>([]);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [domainsSearched, setDomainsSearched] = useState<string[]>([]);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [classification, search] = await Promise.all([
        classifyQuery(query),
        globalSearch(query),
      ]);
      setCandidates(classification.candidates);
      setResults(search.results);
      setDomainsSearched(search.domains_searched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Is the backend running?");
      setCandidates([]);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <SceneBackground />
      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">PROXY Enterprise Intelligence</p>
          <h1 className="mt-1 bg-gradient-to-r from-white via-cyan-100 to-purple-200 bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl">
            Cross-Domain Search
          </h1>
          <p className="mt-1 text-sm text-proxy-muted">
            Ask one question across all 8 domains at once -- classified, ranked by evidence quality, and cited.
          </p>
        </header>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-proxy-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && runSearch()}
              placeholder="e.g. My flight was cancelled and my travel insurance rejected the claim"
              className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-10 pr-4 text-sm text-proxy-text outline-none backdrop-blur-xl placeholder:text-proxy-tertiary focus:border-cyan-300/60"
            />
          </div>
          <button
            onClick={runSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-medium text-cyan-100 shadow-glow-cyan backdrop-blur-xl transition-colors hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {candidates.length > 0 && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-proxy-tertiary">
              Domain classification ({domainsSearched.length} domains searched)
            </p>
            <div className="flex flex-wrap gap-2">
              {candidates.map((candidate) => (
                <span
                  key={candidate.domain}
                  className={`rounded-full border px-3 py-1.5 text-xs ${scoreColor(candidate.confidence)}`}
                >
                  {domainLabel(candidate.domain)} &middot; {Math.round(candidate.confidence * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.18em] text-proxy-tertiary">
              {results.length} evidence-ranked result{results.length === 1 ? "" : "s"}
            </p>
            {results.map((result) => (
              <div
                key={result.id}
                className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl transition-all hover:border-cyan-300/30"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-0.5 text-[10px] text-cyan-100">
                    {domainLabel(result.domain)}
                  </span>
                  {typeof result.metadata.authority === "string" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-proxy-tertiary">
                      <ShieldCheck className="size-3" /> {result.metadata.authority}
                    </span>
                  )}
                  <span
                    className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${scoreColor(
                      result.evidence_scores.overall_evidence_score
                    )}`}
                  >
                    evidence score {Math.round(result.evidence_scores.overall_evidence_score * 100)}%
                  </span>
                </div>
                <p className="text-sm leading-6 text-proxy-muted line-clamp-4">{result.text}</p>
                {typeof result.metadata.source_url === "string" && (
                  <a
                    href={result.metadata.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100"
                  >
                    View source <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && results.length === 0 && candidates.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-10 text-center text-sm text-proxy-tertiary">
            Try a question that spans more than one domain -- e.g. a cancelled flight with a rejected travel
            insurance claim -- to see PROXY classify and search both at once.
          </div>
        )}
      </div>
    </AppShell>
  );
}
