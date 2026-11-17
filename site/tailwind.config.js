/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#070B16",
        panel: "#0B1122",
        raised: "#111A30",
        line: "rgba(148, 163, 205, 0.12)",
        "line-strong": "rgba(148, 163, 205, 0.22)",
        ink: {
          DEFAULT: "#E8ECF5",
          soft: "#A3ADC2",
          muted: "#6B7693",
        },
        // UI accent only -- never a data series. The departures-board amber.
        amber: { DEFAULT: "#FBBF24", soft: "rgba(251, 191, 36, 0.12)" },
        // Data series: the trio that passes the colour-vision checks on this
        // surface for every pair, not just neighbours.
        s1: "#3987E5",
        s2: "#D95926",
        s3: "#199E70",
        good: "#2FB67C",
        bad: "#E5484D",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -30px rgba(0,0,0,0.8)",
        glow: "0 0 0 1px rgba(251,191,36,0.35), 0 10px 40px -10px rgba(251,191,36,0.45)",
      },
    },
  },
  plugins: [],
};
