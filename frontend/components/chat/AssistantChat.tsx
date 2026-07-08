"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Send, Mic, MicOff, Sparkles, User, Loader2, ChevronDown, ChevronRight,
  ShieldCheck, ExternalLink, CheckCircle2, Circle, AlertCircle, Command, Trash2, RotateCcw,
} from "lucide-react";
import {
  classifyQuery, runMultiDomainCase, type DomainCandidate, type Citation, type MultiDomainCaseResponse,
} from "@/lib/api-client";
import { traceToStages, ESTIMATED_STAGES, type PipelineStage } from "./pipeline";

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

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  domains?: string[];
  citations?: Citation[];
  perDomainTraces?: Record<string, string[]>;
  error?: string;
}

const STORAGE_KEY = "proxy:assistant-chat-history";

function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
  } catch {
    // storage full or unavailable -- conversation still works, just won't persist
  }
}

function useSpeechRecognition(onResult: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
  }, [onResult]);

  function toggle() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }

  return { supported, listening, toggle };
}

function scoreColor(score: number): string {
  if (score >= 0.6) return "border-green-300/25 bg-green-300/10 text-green-100";
  if (score >= 0.4) return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.035] text-proxy-muted";
}

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [livePreview, setLivePreview] = useState<DomainCandidate[]>([]);
  const [processing, setProcessing] = useState(false);
  const [liveStages, setLiveStages] = useState<string[]>([]);
  const [reasoningDomain, setReasoningDomain] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Typed as `number` explicitly (not ReturnType<typeof setInterval>) because
  // @types/node's ambient setInterval (returning NodeJS.Timeout) and the DOM
  // lib's window.setInterval (returning number) both apply in this project,
  // and TS resolves the bare/inferred form to the Node one -- window.setInterval
  // genuinely returns a number in the browser at runtime regardless.
  const stageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (messages.length) saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveStages]);

  // Live domain classification preview, debounced -- purely client-facing
  // feedback that this is a multi-domain-aware assistant before you even hit send.
  useEffect(() => {
    if (input.trim().length < 12) {
      setLivePreview([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await classifyQuery(input);
        setLivePreview(result.candidates);
      } catch {
        setLivePreview([]);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  const { supported: voiceSupported, listening, toggle: toggleVoice } = useSpeechRecognition((text) => {
    setInput((current) => (current ? `${current} ${text}` : text));
  });

  async function send() {
    const text = input.trim();
    if (!text || processing) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, timestamp: Date.now() };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLivePreview([]);
    setProcessing(true);
    setLiveStages([]);

    let stageIndex = 0;
    stageTimerRef.current = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, ESTIMATED_STAGES.length);
      setLiveStages(ESTIMATED_STAGES.slice(0, stageIndex));
    }, 1400);

    try {
      const response: MultiDomainCaseResponse = await runMultiDomainCase(userMessage.id, text);
      const perDomainTraces: Record<string, string[]> = {};
      Object.entries(response.per_domain_results).forEach(([domain, result]) => {
        perDomainTraces[domain] = result.agent_trace ?? [];
      });
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.combined_summary || "The assistant didn't return a summary for this query.",
        timestamp: Date.now(),
        domains: response.domains_analyzed,
        citations: response.combined_citations,
        perDomainTraces,
      };
      setMessages((current) => [...current, assistantMessage]);
      setReasoningDomain(response.primary_domain);
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        error: err instanceof Error ? err.message : "Something went wrong reaching the multi-agent backend.",
      };
      setMessages((current) => [...current, errorMessage]);
    } finally {
      if (stageTimerRef.current) window.clearInterval(stageTimerRef.current);
      setProcessing(false);
      setLiveStages([]);
    }
  }

  function retryLast() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      setMessages((current) => current.filter((m) => m.id !== current[current.length - 1]?.id || m.role !== "assistant"));
      setInput(lastUser.content);
      window.setTimeout(() => send(), 0);
    }
  }

  function clearConversation() {
    setMessages([]);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  function toggleCitations(messageId: string) {
    setExpandedCitations((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant" && !m.error), [messages]);
  const reasoningDomains = lastAssistant?.domains ?? [];
  const activeReasoningDomain = reasoningDomain && reasoningDomains.includes(reasoningDomain) ? reasoningDomain : reasoningDomains[0];
  const reasoningStages: PipelineStage[] = lastAssistant?.perDomainTraces?.[activeReasoningDomain ?? ""]
    ? traceToStages(lastAssistant.perDomainTraces[activeReasoningDomain ?? ""])
    : [];

  return (
    <div className="grid min-h-[720px] flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Main conversation column */}
      <section className="flex flex-col rounded-2xl border border-white/10 bg-glass backdrop-blur-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
              <Sparkles className="size-4 text-cyan-200" />
            </div>
            <div>
              <p className="text-sm font-semibold">PROXY Assistant</p>
              <p className="text-[11px] text-proxy-tertiary">Reasons across all 8 domains, cites every claim</p>
            </div>
          </div>
          <button
            onClick={clearConversation}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-proxy-muted hover:border-red-300/30 hover:text-red-100"
          >
            <Trash2 className="size-3.5" /> Clear
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          {messages.length === 0 && (
            <EmptyState onPick={(prompt) => setInput(prompt)} />
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              expanded={expandedCitations.has(message.id)}
              onToggleCitations={() => toggleCitations(message.id)}
              onRetry={message.error ? retryLast : undefined}
            />
          ))}

          {processing && <ThinkingIndicator stages={liveStages} />}
        </div>

        <Composer
          input={input}
          setInput={setInput}
          onSend={send}
          processing={processing}
          textareaRef={textareaRef}
          voiceSupported={voiceSupported}
          listening={listening}
          onToggleVoice={toggleVoice}
          livePreview={livePreview}
        />
      </section>

      {/* Live agent reasoning panel */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
          <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-proxy-tertiary">
            <Bot className="size-3.5" /> Agent Reasoning
          </p>
          {reasoningDomains.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {reasoningDomains.map((domain) => (
                <button
                  key={domain}
                  onClick={() => setReasoningDomain(domain)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    activeReasoningDomain === domain
                      ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.02] text-proxy-tertiary hover:border-cyan-300/25"
                  }`}
                >
                  {domainLabel(domain)}
                </button>
              ))}
            </div>
          )}
          {reasoningStages.length === 0 && !processing && (
            <p className="text-xs text-proxy-tertiary">
              Send a message to see exactly which agents ran and in what order -- this reflects the real
              execution trace returned by the backend, not a canned animation.
            </p>
          )}
          <div className="space-y-1.5">
            {reasoningStages.map((stage) => (
              <div key={stage.key} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-300" />
                <div>
                  <p className="text-proxy-text">{stage.label}</p>
                  {stage.detail && <p className="text-[11px] text-proxy-tertiary">{stage.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {lastAssistant?.citations && lastAssistant.citations.length > 0 && (
          <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-glass p-4 backdrop-blur-2xl">
            <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-proxy-tertiary">
              <ShieldCheck className="size-3.5" /> Sources ({lastAssistant.citations.length})
            </p>
            <div className="space-y-2">
              {lastAssistant.citations.slice(0, 10).map((citation, index) => (
                <CitationCard key={`${citation.title}-${index}`} citation={citation} />
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const suggestions = [
    "My flight was cancelled and my travel insurance rejected the claim.",
    "My builder delayed possession of my flat by 18 months under RERA.",
    "What are the symptoms of dengue fever and when should I see a doctor?",
    "My credit card was charged twice for the same transaction.",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 shadow-glow-cyan">
        <Bot className="size-7 text-cyan-200" />
      </div>
      <div>
        <p className="text-lg font-semibold">Ask across any domain, or several at once</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-proxy-muted">
          One question can span multiple domains -- PROXY classifies, researches, and cites each one.
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {suggestions.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPick(prompt)}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left text-xs text-proxy-muted transition-colors hover:border-cyan-300/30 hover:text-proxy-text"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message, expanded, onToggleCitations, onRetry,
}: {
  message: ChatMessage;
  expanded: boolean;
  onToggleCitations: () => void;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`grid size-8 shrink-0 place-items-center rounded-lg border ${
          isUser ? "border-purple-300/30 bg-purple-300/10" : "border-cyan-300/30 bg-cyan-300/10"
        }`}
      >
        {isUser ? <User className="size-4 text-purple-200" /> : <Bot className="size-4 text-cyan-200" />}
      </div>
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-2`}>
        {message.error ? (
          <div className="rounded-xl border border-red-300/25 bg-red-300/10 px-4 py-3 text-sm text-red-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4" /> {message.error}
            </div>
            {onRetry && (
              <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1 text-xs text-red-200 hover:text-red-100">
                <RotateCcw className="size-3" /> Retry
              </button>
            )}
          </div>
        ) : (
          <div
            className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
              isUser ? "border-purple-300/20 bg-purple-300/10 text-proxy-text" : "border-white/10 bg-black/20 text-proxy-text"
            }`}
          >
            {message.content}
          </div>
        )}

        {message.domains && message.domains.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.domains.map((domain) => (
              <span key={domain} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
                {domainLabel(domain)}
              </span>
            ))}
          </div>
        )}

        {message.citations && message.citations.length > 0 && (
          <button onClick={onToggleCitations} className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {message.citations.length} source{message.citations.length === 1 ? "" : "s"}
          </button>
        )}
        {expanded && message.citations && (
          <div className="w-full space-y-2">
            {message.citations.slice(0, 6).map((citation, index) => (
              <CitationCard key={`${citation.title}-${index}`} citation={citation} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-proxy-text line-clamp-1">{citation.title}</span>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${scoreColor(citation.confidence)}`}>
          {Math.round(citation.confidence * 100)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-proxy-tertiary">
        <span>{citation.authority} &middot; {domainLabel(citation.domain)}</span>
        {citation.url && (
          <a href={citation.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-200 hover:text-cyan-100">
            View <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator({ stages }: { stages: string[] }) {
  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
        <Loader2 className="size-4 animate-spin text-cyan-200" />
      </div>
      <div className="max-w-[80%] rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
        <p className="mb-2 text-proxy-muted">Running multi-agent analysis across relevant domains...</p>
        <div className="space-y-1">
          {stages.map((stage, index) => (
            <div key={stage} className="flex items-center gap-2 text-xs text-proxy-tertiary">
              {index === stages.length - 1 ? (
                <Loader2 className="size-3 animate-spin text-cyan-300" />
              ) : (
                <CheckCircle2 className="size-3 text-green-300" />
              )}
              {stage}
            </div>
          ))}
          {stages.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-proxy-tertiary">
              <Circle className="size-3 animate-pulse text-cyan-300" /> Starting...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({
  input, setInput, onSend, processing, textareaRef, voiceSupported, listening, onToggleVoice, livePreview,
}: {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  processing: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  voiceSupported: boolean;
  listening: boolean;
  onToggleVoice: () => void;
  livePreview: DomainCandidate[];
}) {
  return (
    <div className="border-t border-white/10 p-3">
      {livePreview.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] uppercase tracking-wide text-proxy-tertiary">Detected:</span>
          {livePreview.map((candidate) => (
            <span key={candidate.domain} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] text-cyan-100">
              {domainLabel(candidate.domain)}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask about any domain -- or several at once... (Ctrl/Cmd+K to focus)"
          rows={1}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-proxy-text outline-none placeholder:text-proxy-tertiary"
        />
        {voiceSupported && (
          <button
            onClick={onToggleVoice}
            className={`grid size-9 shrink-0 place-items-center rounded-lg border transition-colors ${
              listening ? "border-red-300/40 bg-red-300/10 text-red-200" : "border-white/10 text-proxy-muted hover:border-cyan-300/30"
            }`}
            title={listening ? "Stop listening" : "Voice input"}
          >
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
        )}
        <button
          onClick={onSend}
          disabled={processing || !input.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 shadow-glow-cyan transition-colors hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {processing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1 px-1 text-[10px] text-proxy-tertiary">
        <Command className="size-3" /> K to focus &middot; Enter to send &middot; Shift+Enter for new line
      </div>
    </div>
  );
}
