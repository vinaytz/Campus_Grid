import type { Config } from "tailwindcss";

/** Campus Grid design tokens: six colours, with accent reserved for action and focus. */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F3EC",
        surface: "#FFFDF8",
        ink: "#0C3B2E",
        muted: "#587267",
        line: "#D9D1C2",
        accent: "#FFBA00",
        // Legacy semantic names resolve to the same six tokens while screens migrate.
        graphite: { 950: "#0C3B2E", 900: "#0C3B2E", 800: "#0C3B2E", 700: "#587267", 600: "#587267", 500: "#587267", 400: "#D9D1C2" },
        sheet: "#FFFDF8",
        ground: "#F7F3EC",
        rule: { DEFAULT: "#D9D1C2", strong: "#BB8A52" },
        claret: { DEFAULT: "#0C3B2E", hover: "#08291F", soft: "#EAF1EC", line: "#B7CDBA" },
        moss: { DEFAULT: "#6D9773", soft: "#EAF1EC", line: "#B7CDBA" },
        ochre: { DEFAULT: "#BB8A52", soft: "#F5EBDD", line: "#DEC29B" },
        lapis: { DEFAULT: "#6D9773", soft: "#EAF1EC", line: "#B7CDBA" },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        label: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.09em" }],
      },
      borderRadius: { xs: "4px", sm: "7px", DEFAULT: "10px", md: "14px", lg: "20px" },
      boxShadow: { lift: "0 18px 48px -24px rgba(12,59,46,.18)" },
    },
  },
  plugins: [],
};
export default config;
