"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TranscriptEntry } from "./hero-data";
import { ChevronRight, FileCheck2, Gauge, Play, RadioTower, ShieldCheck, Sparkles, Zap } from "lucide-react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type LiveCaseCardProps = {
  caseNumber: string;
  transcript: TranscriptEntry[];
  verdictLabel: string;
  recoveredAmount: number;
  resolutionDays: number;
  className?: string;
};

function useCountUp(target: number, shouldRun: boolean) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!shouldRun) {
      setValue(target);
      return;
    }

    let frame = 0;
    const duration = 1200;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      frame = requestAnimationFrame(tick);
      if (progress >= 1) cancelAnimationFrame(frame);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shouldRun, target]);

  return value;
}

function useViewportProgress(ref: React.RefObject<HTMLDivElement | null>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const trigger = ScrollTrigger.create({
      trigger: node,
      start: "top 85%",
      end: "bottom 20%",
      scrub: true,
      onUpdate: (self) => setProgress(self.progress),
    });

    return () => trigger.kill();
  }, [ref]);

  return progress;
}

function CitationChip({ citation, progress }: { citation?: string; progress: number }) {
  if (!citation) return null;

  return (
    <motion.span
      className="mt-2 inline-flex max-w-full overflow-hidden rounded-[999px] border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]"
      initial={false}
      animate={{ opacity: progress > 0.55 ? 1 : 0, width: progress > 0.55 ? "auto" : 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      style={{ whiteSpace: "nowrap" }}
    >
      {citation}
    </motion.span>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Gauge;
  tone: "gold" | "blue" | "orange";
}) {
  const toneClasses = {
    gold: "border-[rgba(232,199,102,0.22)] bg-[rgba(232,199,102,0.055)] text-[var(--gold-bright)]",
    blue: "border-[rgba(91,141,239,0.22)] bg-[rgba(91,141,239,0.06)] text-[var(--agent-advocate)]",
    orange: "border-[rgba(224,138,76,0.22)] bg-[rgba(224,138,76,0.06)] text-[var(--agent-opposition)]",
  };

  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.025)] p-3">
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">{label}</div>
          <div className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--ink-primary)]">{value}</div>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border ${toneClasses[tone]}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
        </div>
      </div>
    </div>
  );
}

export function LiveCaseCard({
  caseNumber,
  transcript,
  verdictLabel,
  recoveredAmount,
  resolutionDays,
  className = "",
}: LiveCaseCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const progress = useViewportProgress(cardRef);
  const shouldAnimate = !reducedMotion;
  const amount = useCountUp(recoveredAmount, progress > 0.82 && shouldAnimate);
  const days = resolutionDays;
  const cardTiltX = reducedMotion ? 0 : 2 - progress * 4;
  const cardTiltY = reducedMotion ? 0 : -2 + progress * 4;
  const completedRows = Math.max(1, Math.ceil(progress * transcript.length));
  const strategyPulse = Math.round(58 + progress * 36);
  const pressurePulse = Math.round(22 + progress * 19);
  const leveragePulse = Math.round(71 + progress * 17);
  const negotiationTemp = Math.round(72 + progress * 18);

  const rowOffsets = useMemo(
    () => transcript.map((_, index) => 0.18 + index * 0.16),
    [transcript],
  );

  return (
    <motion.div
      ref={cardRef}
      className={`relative overflow-hidden rounded-[18px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(145deg,rgba(17,18,22,0.94),rgba(7,8,11,0.98)_58%,rgba(12,13,16,0.98))] p-3 shadow-[0_32px_90px_-32px_rgba(0,0,0,0.78),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl ${className}`}
      style={{
        rotateX: cardTiltX,
        rotateY: cardTiltY,
        transformStyle: "preserve-3d",
      }}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(232,199,102,0.13),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(91,141,239,0.1),transparent_32%),radial-gradient(circle_at_50%_105%,rgba(224,138,76,0.08),transparent_36%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(232,199,102,0.5),rgba(91,141,239,0.36),transparent)]" />

      <div className="relative rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[rgba(5,6,8,0.48)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.07)] pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(232,199,102,0.2)] bg-[rgba(232,199,102,0.08)] text-[var(--gold-bright)]">
              <ShieldCheck className="h-4 w-4" strokeWidth={1.6} />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">Case no. {caseNumber}</div>
              <div className="mt-0.5 text-[14px] font-medium text-[var(--ink-primary)]">MRI denial appeal room</div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-[999px] border border-[rgba(232,199,102,0.34)] bg-[rgba(232,199,102,0.08)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--gold-bright)] shadow-[0_0_24px_-12px_rgba(232,199,102,0.75)]">
            <RadioTower className="h-3 w-3" strokeWidth={1.8} />
            A2A live
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold-bright)] shadow-[0_0_10px_rgba(232,199,102,0.8)] animate-[proxy-pulse_1.4s_ease-in-out_infinite]" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_196px]">
          <div className="relative overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.06)] bg-[linear-gradient(180deg,rgba(11,12,15,0.82),rgba(7,8,10,0.95))] p-3">
            <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-[linear-gradient(180deg,transparent,rgba(232,199,102,0.24),rgba(91,141,239,0.22),transparent)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(232,199,102,0.12)] bg-[radial-gradient(circle,rgba(232,199,102,0.1),transparent_66%)]" />
            <motion.div
              className="pointer-events-none absolute left-1/2 top-6 h-[calc(100%-48px)] w-[3px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(232,199,102,0.1),rgba(232,199,102,0.7),rgba(91,141,239,0.42),rgba(224,138,76,0.36))] shadow-[0_0_22px_rgba(232,199,102,0.24)]"
              style={{ scaleY: Math.max(0.18, progress), transformOrigin: "top" }}
            />

            <div className="relative space-y-3">
              {transcript.map((item, index) => {
                const rowProgress = Math.max(0, Math.min((progress - rowOffsets[index]) / 0.12, 1));
                const isAdvocate = item.role === "advocate";
                const labelColor = isAdvocate ? "var(--agent-advocate)" : "var(--agent-opposition)";
                const labelBg = isAdvocate ? "rgba(91,141,239,0.1)" : "rgba(224,138,76,0.1)";
                const isActive = index < completedRows;

                return (
                  <motion.div
                    key={`${item.role}-${index}`}
                    className="relative grid grid-cols-[1fr_28px_1fr] items-start gap-2"
                    initial={false}
                    animate={{ opacity: rowProgress, y: rowProgress > 0 ? 0 : 10 }}
                    transition={{ duration: reducedMotion ? 0.2 : 0.36, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className={`${isAdvocate ? "block" : "invisible"} rounded-[12px] border border-[rgba(91,141,239,0.18)] bg-[rgba(91,141,239,0.055)] p-3 shadow-[0_18px_36px_-28px_rgba(91,141,239,0.8)]`}>
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-[999px] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: labelColor, background: labelBg }}>
                        <Sparkles className="h-3 w-3" strokeWidth={1.7} />
                        Advocate
                      </div>
                      <p className="text-[13px] leading-[1.45] text-[var(--ink-primary)] md:text-[14px]">{item.text}</p>
                      <CitationChip citation={item.citation} progress={rowProgress} />
                    </div>

                    <div className="relative flex justify-center pt-4">
                      <div
                        className="h-3 w-3 rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(8,9,11,0.95)] shadow-[0_0_0_4px_rgba(8,9,11,0.75)]"
                        style={{ boxShadow: isActive ? `0 0 0 4px rgba(8,9,11,0.75), 0 0 22px -4px ${labelColor}` : undefined }}
                      />
                    </div>

                    <div className={`${!isAdvocate ? "block" : "invisible"} rounded-[12px] border border-[rgba(224,138,76,0.18)] bg-[rgba(224,138,76,0.055)] p-3 shadow-[0_18px_36px_-28px_rgba(224,138,76,0.8)]`}>
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-[999px] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: labelColor, background: labelBg }}>
                        <Zap className="h-3 w-3" strokeWidth={1.7} />
                        Opposition
                      </div>
                      <p className="text-[13px] leading-[1.45] text-[var(--ink-primary)] md:text-[14px]">{item.text}</p>
                      <CitationChip citation={item.citation} progress={rowProgress} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-[14px] border border-[rgba(232,199,102,0.18)] bg-[linear-gradient(180deg,rgba(232,199,102,0.09),rgba(255,255,255,0.025))] p-4">
              <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[rgba(232,199,102,0.14)] blur-2xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">Strategy lock</div>
                  <div className="mt-2 text-[38px] font-semibold leading-none tracking-[-0.05em] text-[var(--gold-bright)]">{strategyPulse}%</div>
                </div>
                <FileCheck2 className="h-5 w-5 text-[var(--gold-bright)]" strokeWidth={1.6} />
              </div>
              <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--gold-primary),var(--gold-bright))]"
                  initial={false}
                  animate={{ width: `${strategyPulse}%` }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <div className="relative mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-secondary)]">Human approval required</div>
            </div>

            <MetricTile label="Temperature" value={`${negotiationTemp}%`} icon={Gauge} tone="gold" />
            <MetricTile label="Evidence" value={`${transcript.length} anchors`} icon={ShieldCheck} tone="blue" />
            <MetricTile label="Leverage" value={`${leveragePulse}%`} icon={RadioTower} tone="orange" />

            <motion.div
              className="mt-auto overflow-hidden rounded-[14px] border border-[rgba(232,199,102,0.18)] bg-[rgba(232,199,102,0.08)] p-4"
              initial={false}
              animate={{ opacity: progress > 0.84 ? 1 : 0.25, y: progress > 0.84 ? 0 : 10 }}
              transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--gold-bright)]">{verdictLabel}</div>
                <div className="rounded-[999px] border border-[rgba(232,199,102,0.2)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-secondary)]">{days} days</div>
              </div>
              <div className="mt-2 text-[13px] font-medium text-[var(--ink-primary)]">Claim approved</div>
              <div className="mt-1 flex items-end gap-2">
                <div className="text-[30px] font-semibold leading-none tracking-[-0.04em] text-[var(--gold-bright)]">+${amount.toLocaleString()}</div>
                <div className="pb-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-secondary)]">recovered</div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Deadline", value: `${Math.round(11 - progress * 3)}d`, tone: "text-[var(--gold-bright)]" },
            { label: "Pressure", value: pressurePulse, tone: "text-[var(--agent-advocate)]" },
            { label: "Route", value: "A2A", tone: "text-[var(--agent-opposition)]" },
          ].map((item) => (
            <div key={item.label} className="rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.025)] px-3 py-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">{item.label}</div>
              <div className={`mt-1 font-mono text-[12px] uppercase tracking-[0.08em] ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function HeroButtons() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <motion.a
        href="#"
        className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[var(--gold-primary)] px-5 py-3 text-[13px] font-medium text-[#0d0d0f] shadow-[0_0_24px_-4px_rgba(212,175,55,0.35)] outline-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:translate-y-[-1px] hover:bg-[var(--gold-bright)] focus-visible:ring-2 focus-visible:ring-[var(--gold-bright)] focus-visible:ring-offset-0"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        File your first case - free
        <ChevronRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1" strokeWidth={1.5} />
      </motion.a>

      <motion.a
        href="#"
        className="group inline-flex items-center justify-center gap-2 rounded-[10px] border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.02)] px-5 py-3 text-[13px] font-medium text-[var(--ink-primary)] outline-none transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[rgba(212,175,55,0.35)] hover:bg-[var(--bg-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--gold-bright)] focus-visible:ring-offset-0"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <Play className="h-4 w-4 fill-current transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110" strokeWidth={1.5} />
        Watch it argue a case
      </motion.a>
    </div>
  );
}

