"use client";

import { AppShell } from "@/components/proxy-v2/Shell";
import { SceneBackground } from "@/components/3d/SceneBackground";
import { FileText, Search, Upload, FolderOpen, Star, Clock, ArrowUpRight, Filter, Grid3X3, List, Download, Share2, Trash2 } from "lucide-react";

const documents = [
  { name: "Health Insurance Policy Document.pdf", type: "Policy", size: "2.4 MB", date: "2026-06-28", status: "Analyzed", starred: true },
  { name: "Claim Rejection Letter.pdf", type: "Correspondence", size: "0.8 MB", date: "2026-06-25", status: "Analyzed", starred: false },
  { name: "Medical Report - Cardiology.pdf", type: "Medical Record", size: "4.2 MB", date: "2026-06-22", status: "Processing", starred: true },
  { name: "Hospital Discharge Summary.pdf", type: "Medical Record", size: "1.6 MB", date: "2026-06-20", status: "Analyzed", starred: false },
  { name: "Bank Statement - Jun 2026.pdf", type: "Financial", size: "3.1 MB", date: "2026-06-18", status: "Pending", starred: false },
  { name: "Insurance Correspondence History.pdf", type: "Correspondence", size: "5.7 MB", date: "2026-06-15", status: "Analyzed", starred: true },
  { name: "Prescription Records.pdf", type: "Medical Record", size: "0.5 MB", date: "2026-06-12", status: "Processing", starred: false },
  { name: "Treatment Plan & Estimates.pdf", type: "Medical Record", size: "2.1 MB", date: "2026-06-10", status: "Analyzed", starred: false },
];

const statusColor = (status: string) => {
  switch (status) {
    case "Analyzed": return "border-green-300/25 bg-green-300/10 text-green-100";
    case "Processing": return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
    case "Pending": return "border-amber-300/25 bg-amber-300/10 text-amber-100";
    default: return "border-white/10 bg-white/[0.035] text-proxy-muted";
  }
};

export default function DocumentsPage() {
  return (
    <AppShell>
      <SceneBackground />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">PROXY Document Vault</p>
            <h1 className="mt-1 text-3xl font-semibold sm:text-4xl bg-gradient-to-r from-white via-cyan-100 to-purple-200 bg-clip-text text-transparent">
              Documents
            </h1>
            <p className="mt-1 text-sm text-proxy-muted">AI-powered document analysis & evidence extraction</p>
          </div>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2.5 text-sm font-medium text-cyan-100 shadow-glow-cyan backdrop-blur-xl hover:bg-cyan-300/20">
              <Upload className="size-4" /> Upload Documents
            </button>
            <button className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm text-proxy-muted backdrop-blur-xl hover:border-cyan-300/35">
              <FolderOpen className="size-4" />
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-proxy-muted" />
            <input
              placeholder="Search documents..."
              className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-4 text-sm text-proxy-text outline-none backdrop-blur-xl placeholder:text-proxy-tertiary focus:border-cyan-300/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-2 text-cyan-100"><Grid3X3 className="size-4" /></button>
            <button className="rounded-lg border border-white/10 p-2 text-proxy-muted"><List className="size-4" /></button>
            <div className="h-6 w-px bg-white/10" />
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-proxy-muted"><Filter className="size-3.5" /> Filters</button>
            <span className="text-xs text-proxy-tertiary">{documents.length} documents</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6 backdrop-blur-sm hover:border-cyan-300/30 hover:bg-cyan-300/[0.03] transition-all duration-300 cursor-pointer group">
            <div className="grid place-items-center rounded-xl border border-white/10 bg-black/40 size-14 mb-4 group-hover:border-cyan-300/30 group-hover:bg-cyan-300/10 transition-all">
              <Upload className="size-6 text-proxy-muted group-hover:text-cyan-200 transition-colors" />
            </div>
            <h3 className="font-medium text-proxy-muted group-hover:text-proxy-text transition-colors">Upload new document</h3>
            <p className="mt-1 text-xs text-proxy-tertiary">PDF, images — up to 25 MB</p>
          </div>

          {documents.map((doc, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-white/10 bg-glass p-5 backdrop-blur-2xl hover:border-cyan-300/30 transition-all duration-300 hover:shadow-glow-cyan"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="grid place-items-center rounded-xl border border-white/10 bg-black/40 size-12 group-hover:border-cyan-300/20 group-hover:bg-cyan-300/10 transition-all">
                  <FileText className="size-5 text-cyan-200" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="rounded-lg border border-white/10 p-1.5 text-proxy-muted hover:bg-white/10"><Download className="size-3.5" /></button>
                  <button className="rounded-lg border border-white/10 p-1.5 text-proxy-muted hover:bg-white/10"><Share2 className="size-3.5" /></button>
                  <button className="rounded-lg border border-white/10 p-1.5 text-proxy-muted hover:bg-white/10"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
              <h3 className="font-medium text-sm leading-5 line-clamp-1">{doc.name}</h3>
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusColor(doc.status)}`}>{doc.status}</span>
                <span className="text-[11px] text-proxy-tertiary">{doc.type}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-proxy-tertiary">
                <span className="flex items-center gap-1"><Clock className="size-3" />{doc.date}</span>
                <span>{doc.size}</span>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                <button className="flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100 transition-colors">
                  Analyze <ArrowUpRight className="size-3" />
                </button>
                {doc.starred && <Star className="size-3.5 text-amber-400 ml-auto" fill="#fbbf24" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
