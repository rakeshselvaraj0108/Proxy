import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./pages/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-void": "var(--bg-void)",
        "bg-surface": "var(--bg-surface)",
        "bg-surface-2": "var(--bg-surface-2)",
        "border-hairline": "var(--border-hairline)",
        "gold-primary": "var(--gold-primary)",
        "gold-bright": "var(--gold-bright)",
        "ink-primary": "var(--ink-primary)",
        "ink-secondary": "var(--ink-secondary)",
        "ink-tertiary": "var(--ink-tertiary)",
        advocate: "var(--agent-advocate)",
        opposition: "var(--agent-opposition)",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "14px",
        button: "10px",
      },
      boxShadow: {
        panel: "0 20px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px var(--border-hairline)",
        glow: "0 0 24px -4px rgba(212,175,55,0.35)",
      },
      keyframes: {
        "proxy-pulse": {
          "0%, 100%": { transform: "scale(0.85)", opacity: "0.4" },
          "50%": { transform: "scale(1)", opacity: "1" },
        },
        "proxy-float": {
          "0%, 100%": { transform: "translateY(-6px)" },
          "50%": { transform: "translateY(6px)" },
        },
      },
      animation: {
        "proxy-pulse": "proxy-pulse 1.4s ease-in-out infinite",
        "proxy-float": "proxy-float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
