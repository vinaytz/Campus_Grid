import type { Config } from "tailwindcss";

/**
 * Design language: "Drafting table".
 *
 * The application chrome is deep graphite — the frame of a professional tool.
 * The work surface is a bone sheet floating on it, the way a drawing sits on a
 * drafting table. Colour is scarce and always means something: claret marks the
 * thing you are acting on, moss confirms, ochre warns. Regions that cannot
 * accept a session are drawn as engineering hatch, not alarm red.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: "#0E1013",
          900: "#14171C",
          800: "#1B1F26",
          700: "#242932",
          600: "#333945",
          500: "#4A5160",
          400: "#6B7280",
        },
        sheet: "#FCFCFC",
        ground: "#E7E9EB",
        rule: { DEFAULT: "#E3E5E8", strong: "#C9CCD2" },
        ink: "#14171C",
        muted: "#5C6270",
        claret: { DEFAULT: "#93283C", hover: "#7C1F31", soft: "#F8EAED", line: "#E4C0C8" },
        moss: { DEFAULT: "#2E6B4F", soft: "#E7F1EC", line: "#BEDBCB" },
        ochre: { DEFAULT: "#9A6810", soft: "#FBF1DC", line: "#EBD6A6" },
        lapis: { DEFAULT: "#2A4A8B", soft: "#EAEFF8", line: "#C3D0E8" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        label: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.09em" }],
      },
      borderRadius: { xs: "2px", sm: "3px", DEFAULT: "5px", md: "7px", lg: "10px" },
      boxShadow: {
        hair: "0 0 0 1px rgba(20,23,28,.07)",
        sheet: "0 1px 2px rgba(14,16,19,.05), 0 8px 24px -12px rgba(14,16,19,.16)",
        lift: "0 2px 4px rgba(14,16,19,.06), 0 16px 40px -12px rgba(14,16,19,.28)",
        drag: "0 12px 28px -6px rgba(14,16,19,.35), 0 0 0 1px rgba(147,40,60,.5)",
        inset: "inset 0 1px 0 rgba(255,255,255,.04)",
      },
      transitionTimingFunction: {
        physical: "cubic-bezier(.2,.9,.3,1)",
      },
      keyframes: {
        sheetIn: { "0%": { opacity: "0", transform: "translateY(4px)" }, "100%": { opacity: "1", transform: "none" } },
        sweep: { "0%": { backgroundPosition: "0% 0" }, "100%": { backgroundPosition: "200% 0" } },
        tick: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".3" } },
      },
      animation: {
        sheetIn: "sheetIn .22s cubic-bezier(.2,.9,.3,1) both",
        sweep: "sweep 1.4s linear infinite",
        tick: "tick 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
