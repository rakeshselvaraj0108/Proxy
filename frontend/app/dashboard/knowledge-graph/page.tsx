import { KnowledgeGraphExplorer } from "@/components/knowledge-graph/KnowledgeGraphExplorer";

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.22em] text-cyan-200">PROXY AI Reasoning</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Knowledge Intelligence Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-proxy-muted">
            Explore the real graph behind every case -- entities, institutions, cross-domain patterns, and your own citizen profile, all backed by the live knowledge graph.
          </p>
        </div>
      </header>
      <KnowledgeGraphExplorer />
    </div>
  );
}
