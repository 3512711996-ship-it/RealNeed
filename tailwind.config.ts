import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        ink: "#111111",
        graphite: "#3F3F3F",
        helper: "#737373",
        paper: "#FAF8F1",
        paper2: "#F7F4EC",
        lime: "#C6F36A",
        straw: "#F3D36B",
        clay: "#E36B5D",
        line: "#E5E0D6"
      },
      boxShadow: {
        paper: "0 8px 30px rgba(0, 0, 0, 0.04)",
        soft: "0 12px 40px rgba(0, 0, 0, 0.06)",
        line: "0 1px 0 rgba(17, 17, 17, 0.08)"
      },
      borderRadius: {
        button: "14px",
        input: "18px",
        card: "20px",
        modal: "24px",
        panel: "18px"
      }
    }
  },
  plugins: []
};

export default config;
