import { analyses, demoAnalysis, type Analysis } from "./proxy-analysis-data";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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

export async function listAnalyses(): Promise<Analysis[]> {
  try {
    const payload = await request<unknown>("/history");
    if (Array.isArray(payload)) return payload.map((item, index) => normalizeAnalysis(item, `AN-${index + 1}`));
    const rows = (payload as { cases?: unknown[]; analyses?: unknown[] }).analyses ?? (payload as { cases?: unknown[] }).cases;
    return rows?.map((item, index) => normalizeAnalysis(item, `AN-${index + 1}`)) ?? analyses;
  } catch {
    return analyses;
  }
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
