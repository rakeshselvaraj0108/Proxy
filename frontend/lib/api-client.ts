import { analyses, demoAnalysis, type Analysis } from "./proxy-analysis-data";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

// No real login flow is wired up yet, so there's no session token to attach.
// The backend's dev-mode auth (app/auth/dependencies.py) accepts any bearer
// string as a stand-in user id when ENVIRONMENT=development and no Supabase
// JWT secret is configured -- persist a stable per-browser id so requests
// authenticate consistently instead of getting a fresh identity every call.
function getDeviceUserId(): string {
  if (typeof window === "undefined") return "server";
  const key = "proxy:device-user-id";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getDeviceUserId()}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function normalizeAnalysis(payload: unknown, id: string): Analysis {
  if (!payload || typeof payload !== "object") return { ...demoAnalysis, id };
  const data = payload as Record<string, unknown>;
  const rawCase = (data.case ?? data.analysis ?? data) as Record<string, unknown>;
  return {
    ...demoAnalysis,
    id: String(rawCase.id ?? rawCase.case_id ?? id),
    status: String(rawCase.status ?? demoAnalysis.status) as Analysis["status"],
    updated: String(rawCase.updated_at ?? rawCase.updated ?? demoAnalysis.updated),
  };
}

export async function getAnalysis(id: string): Promise<Analysis> {
  try {
    return normalizeAnalysis(await request(`/case/${id}`), id);
  } catch {
    return { ...demoAnalysis, id };
  }
}

export async function runAnalysis(id: string) {
  return request("/analyze", { method: "POST", body: JSON.stringify({ case_id: id }) });
}

export async function askAI(id: string, message: string) {
  try {
    return await request<{ answer: string; sources?: Array<{ title: string; source: string }> }>("/chat", { method: "POST", body: JSON.stringify({ case_id: id, message }) });
  } catch {
    return { answer: "Realtime AI is in fallback mode. Start FastAPI to stream cited answers from Gemini, Qdrant, and Neo4j.", sources: [{ title: "Offline analysis preview", source: id }] };
  }
}

export interface DomainCandidate {
  domain: string;
  confidence: number;
  matched_terms: string[];
}

export interface Citation {
  title: string;
  authority: string;
  url: string | null;
  publication_date: string | null;
  section: string | null;
  domain: string;
  retrieved_chunk: string;
  confidence: number;
}

export interface GlobalSearchResult {
  id: string;
  score: number;
  text: string;
  domain: string;
  metadata: Record<string, unknown>;
  evidence_scores: {
    similarity_score: number;
    authority_score: number;
    legal_weight: number;
    freshness_score: number;
    confidence: number;
    overall_evidence_score: number;
  };
}

export interface GlobalSearchResponse {
  query: string;
  domains_searched: string[];
  results: GlobalSearchResult[];
  total_hits: number;
}

export async function classifyQuery(query: string): Promise<{ query: string; candidates: DomainCandidate[] }> {
  return request("/intelligence/classify", { method: "POST", body: JSON.stringify({ query }) });
}

export async function globalSearch(query: string, topKOverall = 15): Promise<GlobalSearchResponse> {
  return request("/intelligence/search", {
    method: "POST",
    body: JSON.stringify({ query, top_k_overall: topKOverall }),
  });
}

export interface Appeal {
  id: string;
  case_id: string;
  user_id: string;
  version: number;
  title: string;
  content: string;
  status: "draft" | "sent" | "escalated" | "resolved";
  document_type: string;
  domain: string | null;
  created_at: string;
}

export interface DomainResult {
  confidence: number;
  route: string;
  final_report: string | null;
  agent_trace: string[];
  appeals: Appeal[];
}

export interface MultiDomainCaseResponse {
  query: string;
  domains_analyzed: string[];
  primary_domain: string;
  per_domain_results: Record<string, DomainResult>;
  combined_citations: Citation[];
  combined_summary: string;
}

export async function runMultiDomainCase(caseId: string, message: string, generateAppeals = false): Promise<MultiDomainCaseResponse> {
  return request("/intelligence/cases/multi-domain", {
    method: "POST",
    body: JSON.stringify({ case_id: caseId, case_summary: message, generate_appeals: generateAppeals }),
  });
}

export async function listAppeals(): Promise<Appeal[]> {
  return request("/appeals", { method: "GET" });
}

export async function updateAppealStatus(appealId: string, status: Appeal["status"]): Promise<Appeal> {
  return request(`/appeals/${appealId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export interface VaultDocument {
  id: string;
  document_id: string;
  case_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  text_extract: string;
  document_type: string;
  domain: string | null;
  indexed: boolean;
  chunks_indexed: number;
  created_at: string;
}

export async function listDocuments(): Promise<VaultDocument[]> {
  return request("/upload/documents", { method: "GET" });
}

export async function deleteDocument(documentId: string): Promise<void> {
  await request(`/upload/documents/${documentId}`, { method: "DELETE" });
}

export async function getDocumentSignedUrl(caseId: string, documentId: string): Promise<string> {
  const result = await request<{ signed_url: string }>(`/upload/${caseId}/documents/${documentId}/signed-url`, { method: "GET" });
  return result.signed_url;
}

export interface UploadProgressHandlers {
  onProgress?: (percent: number) => void;
}

// Uses XMLHttpRequest instead of fetch() so upload progress is observable --
// fetch's request-body progress isn't exposed in a way that works reliably
// across browsers yet. Deliberately bypasses request()'s JSON Content-Type
// default (must NOT be set for multipart/form-data -- the browser sets the
// boundary itself), but still attaches the same bearer auth.
export async function uploadDocument(domain: string, file: File, handlers?: UploadProgressHandlers): Promise<VaultDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/upload/vault/${domain}`);
    xhr.setRequestHeader("Authorization", `Bearer ${getDeviceUserId()}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && handlers?.onProgress) {
        handlers.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export interface ReportSummary {
  totals: { cases: number; appeals: number; documents: number; domains_engaged: number };
  resolution_rate: number | null;
  domain_breakdown: Array<{ domain: string; count: number }>;
  appeal_status_breakdown: Array<{ status: string; count: number }>;
  case_status_breakdown: Array<{ status: string; count: number }>;
  recent_activity: Array<{
    id: string;
    case_id: string;
    event_type: string;
    title: string;
    body: string | null;
    actor: string;
    created_at: string | null;
  }>;
  generated_at: string;
}

export interface CaseReportData {
  case: {
    id: string;
    domain: string;
    title: string;
    institution_name: string;
    summary: string;
    status: string;
    synthetic?: boolean;
  } | null;
  appeals: Appeal[];
  documents: VaultDocument[];
  events: ReportSummary["recent_activity"];
}

export async function getReportSummary(): Promise<ReportSummary> {
  return request("/reports/summary", { method: "GET" });
}

export async function getCaseReport(caseId: string): Promise<CaseReportData> {
  return request(`/reports/case/${caseId}`, { method: "GET" });
}

export type CaseStatus = "draft" | "intake" | "analyzing" | "review_required" | "ready_for_approval" | "submitted" | "resolved" | "closed";

export interface AnalysisCase {
  id: string;
  user_id: string;
  domain: string;
  title: string;
  institution_name: string;
  summary: string;
  jurisdiction: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
  avg_confidence: number | null;
  run_count: number;
  completed_runs: number;
  domains_involved: string[];
}

export async function listAnalyses(): Promise<AnalysisCase[]> {
  return request("/cases/analyses", { method: "GET" });
}

export async function updateCaseStatus(caseId: string, status: CaseStatus): Promise<AnalysisCase> {
  return request(`/cases/${caseId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export interface InstitutionPattern {
  pattern: string;
  domain: string;
  institution: string;
  confidence: number;
}

export async function getInstitutionPatterns(domain: string, institutionName: string): Promise<InstitutionPattern[]> {
  return request(`/graph/patterns?domain=${encodeURIComponent(domain)}&institution_name=${encodeURIComponent(institutionName)}`, {
    method: "GET",
  });
}

export interface CitizenDomainProfile {
  domain: string;
  case_count: number;
  cases: Array<{ case_id: string; title: string }>;
  institutions: string[];
}

export interface CitizenProfile {
  user_id: string;
  domains_active_in: string[];
  total_cases: number;
  by_domain: CitizenDomainProfile[];
}

export async function getCitizenProfile(userId: string): Promise<CitizenProfile> {
  return request(`/graph/citizen/${userId}/profile`, { method: "GET" });
}

export async function getMyCitizenProfile(): Promise<CitizenProfile> {
  return getCitizenProfile(getDeviceUserId());
}
