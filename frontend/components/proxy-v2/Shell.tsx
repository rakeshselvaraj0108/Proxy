"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Bot, ClipboardList, Command, FileSearch, FileText, Gauge, Home, Network, Search, Settings, Sparkles, Upload, Workflow, X, ChevronRight } from "lucide-react";
import { domainRegistry, findDomainAnalysis } from "@/lib/proxy-analysis-data";
import { SceneBackground } from "@/components/3d/SceneBackground";

const nav = [
  ["Dashboard", "/dashboard", Home], ["New Analysis", "/dashboard/new", Upload], ["My Analyses", "/dashboard/analyses", FileSearch], ["AI Assistant", "/dashboard/assistant", Bot], ["Knowledge Graph", "/dashboard/knowledge-graph", Network], ["Cross-Domain Search", "/dashboard/cross-domain-search", Search], ["Documents", "/dashboard/documents", FileText], ["Appeals", "/dashboard/appeals", ClipboardList], ["Reports", "/dashboard/reports", Gauge], ["Notifications", "/dashboard/notifications", Bell], ["Settings", "/dashboard/settings", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="min-h-screen bg-proxy-black text-proxy-text">
      <SceneBackground />
      <Aurora />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-proxy-cyan focus:px-3 focus:py-2 focus:text-black">Skip to content</a>
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 border-r border-white/10 bg-black/45 p-4 backdrop-blur-2xl lg:block">
        <div className="mb-7 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 shadow-glow-cyan"><Workflow className="size-5 text-cyan-200" /></div><div><p className="text-lg font-semibold">PROXY</p><p className="text-xs text-proxy-muted">AI Claim Analysis</p></div></div>
        <nav className="space-y-1" aria-label="Primary navigation">{nav.map(([label, href, Icon]) => <Link key={label} href={href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-proxy-muted transition hover:bg-white/8 hover:text-proxy-text focus-visible:bg-white/10"><Icon className="size-4 text-cyan-200/70 group-hover:text-cyan-200" />{label}</Link>)}</nav>
        <div className="mt-6 rounded-lg border border-purple-300/20 bg-purple-400/10 p-4 shadow-glow-purple"><p className="text-sm font-medium">Upgrade Analysis Desk</p><p className="mt-2 text-xs leading-5 text-proxy-muted">Enterprise audit trails, exports, pinned analyses, and review workflows.</p></div>
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3"><div><p className="text-sm font-medium">Rakesh</p><p className="text-xs text-proxy-muted">Dark mode on</p></div><button aria-label="Toggle dark mode" className="rounded-md border border-white/10 p-2 text-cyan-200"><Sparkles className="size-4" /></button></div>
      </aside>
      <section id="main" className="lg:pl-72">{children}</section>
      <button onClick={() => setPaletteOpen(true)} className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-black/70 px-4 py-3 text-sm text-cyan-100 shadow-glow-cyan backdrop-blur-xl"><Command className="size-4" /> Ctrl K</button>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </main>
  );
}

function Aurora() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"><div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,229,255,.18),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(155,92,255,.16),transparent_30%),linear-gradient(180deg,#050505,#090a0f_52%,#050505)]" /><div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,.045),transparent)] opacity-40" /></div>;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const actions = ["Search analyses", "Open documents", "Start new analysis", "Navigate anywhere", "Ask AI", "Export history", "Show audit logs", "Keyboard shortcuts", ...domainRegistry.map((domain) => `Open ${domain.label}`)];
  return <div className="fixed inset-0 z-50 grid place-items-start bg-black/70 px-4 pt-20 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Global AI command palette"><div className="mx-auto w-full max-w-2xl rounded-xl border border-cyan-300/20 bg-[#080a0f]/95 p-3 shadow-glow-cyan"><div className="flex items-center gap-3 border-b border-white/10 px-2 pb-3"><Search className="size-5 text-cyan-200" /><input autoFocus placeholder="Search analyses, open documents, ask AI, generate appeal..." className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-proxy-tertiary" /><button onClick={onClose} aria-label="Close command palette" className="rounded-md p-2 text-proxy-muted hover:bg-white/10"><X className="size-4" /></button></div><div className="mt-2 grid gap-1">{actions.map((action) => <a key={action} href={domainRegistry.some((domain) => action === `Open ${domain.label}`) ? `/dashboard/analyses/${findDomainAnalysis(domainRegistry.find((domain) => action === `Open ${domain.label}`)?.key ?? "health_insurance").id}` : "/dashboard"} className="flex items-center justify-between rounded-lg px-3 py-3 text-left text-sm text-proxy-muted hover:bg-white/8 hover:text-proxy-text"><span>{action}</span><ChevronRight className="size-4" /></a>)}</div></div></div>;
}



