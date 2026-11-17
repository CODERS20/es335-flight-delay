/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paper, ink and hairlines: the look of a printed research report.
        bg: "#FDFCF9",
        panel: "#FFFFFF",
        raised: "#F4F2EC",
        line: "#E6E3DA",
        "line-strong": "#CBC7BC",
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#45433E",
          muted: "#75726A",
        },
        // UI accent only -- never a data series. A deep academic crimson.
        accent: { DEFAULT: "#9B1B30", soft: "rgba(155, 27, 48, 0.07)" },
        // Data series: the light-surface steps of the colour-vision-safe trio.
        s1: "#2A78D6",
        s2: "#EB6834",
        s3: "#1BAF7A",
        good: "#0CA30C",
        bad: "#D03B3B",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
