"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { heroTranscript, heroTrustStats } from "./hero-data";
import { HeroButtons, LiveCaseCard } from "./LiveCaseCard";
import { Sparkles } from "lucide-react";
import LightfallBackground from "./LightfallBackground";

function useLowPowerMode() {
  const [lowPower, setLowPower] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setLowPower(reducedMotion || mobile || cores <= 4);
  }, []);

  return lowPower;
}

function usePointerLag() {
  const [pointer, setPointer] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    let raf = 0;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const current = { x: target.x, y: target.y };

    const animate = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      setPointer({ x: current.x, y: current.y, active: true });
      raf = requestAnimationFrame(animate);
    };

    const move = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;
    };

    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, []);

  return pointer;
}

function StatItem({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (started) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setStarted(true);
        const start = performance.now();
        const duration = 1200;
        const frame = () => {
          const progress = Math.min((performance.now() - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplayValue(Math.round(value * eased));
          if (progress < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
      { threshold: 0.25 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started, value]);

  return (
    <div ref={ref} className="flex items-center gap-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-tertiary)]">{label}</div>
      <div className="h-[1px] w-8 bg-[var(--border-hairline)]" />
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-secondary)]">
        {displayValue.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}

function Header({ scrolled }: { scrolled: boolean }) {
  return (
    <header
      data-scrolled={scrolled}
      className="fixed left-0 top-0 z-50 w-full border-b border-transparent bg-transparent transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] supports-[backdrop-filter]:backdrop-blur-0 data-[scrolled=true]:border-[var(--border-hairline)] data-[scrolled=true]:bg-[rgba(8,9,11,0.7)] data-[scrolled=true]:supports-[backdrop-filter]:backdrop-blur-[16px]"
    >
      <div className="mx-auto flex h-[88px] max-w-[1440px] items-center justify-between px-5 transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[scrolled=true]:h-[64px] md:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.02)] text-[var(--gold-bright)]">
            <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--ink-primary)]">PROXY</div>
        </div>

        <nav className="hidden items-center gap-8 lg:flex">
          {["Product", "How it works", "Pricing"].map((item) => (
            <a
              key={item}
              href="#"
              className="group relative text-[13px] text-[var(--ink-secondary)] transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-[var(--ink-primary)]"
            >
              {item}
              <span className="absolute left-1/2 top-[1.7em] h-px w-0 -translate-x-1/2 bg-[var(--gold-primary)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:w-full" />
            </a>
          ))}
        </nav>

        <motion.a
          href="#"
          className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--gold-primary)] px-4 py-2.5 text-[13px] font-medium text-[#0d0d0f] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--gold-bright)] hover:translate-x-[1px]"
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.99 }}
        >
          File a case <span className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1">→</span>
        </motion.a>
      </div>
    </header>
  );
}

export function ProxyHero() {
  const reducedMotion = useReducedMotion();
  const lowPower = useLowPowerMode();
  const pointer = usePointerLag();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const cards = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.2 },
    );
    cards.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[var(--bg-void)] text-[var(--ink-primary)]">
      <div className="pointer-events-none fixed inset-0 z-0">
        <LightfallBackground
          colors={["#EAB308", "#5B8DEF", "#FFF1A8", "#E08A4C"]}
          backgroundColor="#040506"
          speed={0.18}
          streakCount={2}
          streakWidth={1.15}
          streakLength={1.35}
          glow={0.48}
          density={0.32}
          twinkle={0.12}
          zoom={3}
          backgroundGlow={0.1}
          opacity={1}
          mouseInteraction={!lowPower}
          mouseStrength={0.12}
          mouseRadius={0.72}
          mouseDampening={0.28}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(232,199,102,0.1),transparent_14%),radial-gradient(circle_at_80%_20%,rgba(91,141,239,0.08),transparent_16%),radial-gradient(circle_at_50%_82%,rgba(224,138,76,0.05),transparent_24%),linear-gradient(180deg,rgba(8,9,11,0.12),rgba(8,9,11,0.88))]" />
        <div className="absolute -top-28 left-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[rgba(232,199,102,0.12)] blur-[120px] opacity-28 mix-blend-screen animate-[proxy-float_24s_ease-in-out_infinite]" />
        <div className="absolute top-20 right-[-7rem] h-[18rem] w-[18rem] rounded-full bg-[rgba(91,141,239,0.09)] blur-[120px] opacity-25 mix-blend-screen animate-[proxy-float_30s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-6rem] left-[34%] h-[14rem] w-[14rem] rounded-full bg-[rgba(224,138,76,0.075)] blur-[100px] opacity-22 mix-blend-screen animate-[proxy-float_36s_ease-in-out_infinite]" />
      </div>

      <div className="proxy-vignette pointer-events-none fixed inset-0 z-[1]" />
      <div className="proxy-noise pointer-events-none fixed inset-0 z-[2]" />

      <Header scrolled={scrolled} />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-[1440px] items-center px-4 pt-[104px] pb-16 sm:px-5 md:px-8 lg:px-10 lg:pt-[120px] lg:pb-20">
        <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="max-w-[700px]" data-reveal>
            <div className="inline-flex items-center gap-2 rounded-[999px] border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.03)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-secondary)] opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform:translateY(24px)] [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold-bright)] shadow-[0_0_12px_rgba(232,199,102,0.7)] animate-[proxy-pulse_2s_ease-in-out_infinite]" />
              1 IN 5 CLAIMS DENIED ARE WRONG
            </div>

            <h1 className="mt-6 max-w-[12ch] font-serif text-[clamp(2.55rem,7vw,4.75rem)] leading-[0.96] tracking-[-0.02em] text-[var(--ink-primary)] opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform:translateY(24px)] delay-75 sm:text-[clamp(2.9rem,6vw,4.75rem)] [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0" data-reveal>
              Every institution already has an AI fighting your claim. <em className="font-serif italic text-[var(--gold-bright)]">Now you have one too.</em>
            </h1>

            <p className="mt-6 max-w-[480px] text-[16px] leading-[1.65] text-[var(--ink-secondary)] opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform:translateY(24px)] delay-150 sm:text-[17px] [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0" data-reveal>
              PROXY reads your policy, builds your case, argues it against the institution's own AI, and doesn't stop until it's resolved.
            </p>

            <div className="mt-8 opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform:translateY(24px)] delay-200 [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0" data-reveal>
              <HeroButtons />
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--border-hairline)] pt-5 opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] [transform:translateY(24px)] delay-300 [&.is-visible]:opacity-100 [&.is-visible]:translate-y-0" data-reveal>
              {heroTrustStats.map((stat, index) => (
                <div key={stat.label} className="flex items-center gap-4">
                  {index > 0 && <div className="h-6 w-px bg-[var(--border-hairline)]" />}
                  <StatItem label={stat.label} value={stat.value} />
                </div>
              ))}
            </div>
          </section>

          <section className="relative perspective-[1200px] lg:pl-4" data-reveal>
            <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(201,162,75,0.16),transparent_72%)] blur-2xl" />
            <motion.div
              className="absolute inset-0 rounded-[24px] bg-[radial-gradient(circle_at_50%_50%,rgba(91,141,239,0.08),transparent_45%)]"
              animate={reducedMotion ? { opacity: 0.35 } : { opacity: [0.25, 0.45, 0.25] }}
              transition={reducedMotion ? { duration: 0.2 } : { duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="relative"
              animate={reducedMotion ? { y: 0 } : { y: [-6, 6, -6] }}
              transition={reducedMotion ? { duration: 0.2 } : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <LiveCaseCard
                caseNumber="000731"
                transcript={heroTranscript}
                verdictLabel="VERDICT"
                recoveredAmount={800}
                resolutionDays={11}
              />
            </motion.div>
          </section>
        </div>
      </main>

      <div
        className={`pointer-events-none fixed left-0 top-0 z-[60] hidden h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(212,175,55,0.55)] transition-[transform,background-color,border-color,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] md:block ${pointer.active ? "opacity-100" : "opacity-0"}`}
        style={{
          transform: `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%) scale(${scrolled ? 1.2 : 1})`,
          backgroundColor: scrolled ? "rgba(212,175,55,0.12)" : "transparent",
          boxShadow: scrolled ? "0 0 24px -4px rgba(212,175,55,0.35)" : "none",
        }}
      />
    </div>
  );
}
