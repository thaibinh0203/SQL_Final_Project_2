import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0F172A",
        slate: "#64748B",
        sage: "#059669",
        canvas: "#F8FAFC",
        line: "#E2E8F0",
        success: "#22C55E",
        warning: "#EAB308",
        danger: "#EF4444",
        info: "#0EA5E9"
      },
      fontFamily: {
        heading: ["Plus Jakarta Sans", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
        mono: ["Fira Code", "monospace"]
      },
      boxShadow: {
        soft: "0 4px 16px rgba(15, 23, 42, 0.07)",
        lift: "0 8px 32px rgba(15, 23, 42, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
