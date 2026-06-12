/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cabinet Grotesk"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Satoshi"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      // Strict 8px-rhythm spacing — extends Tailwind's defaults
      spacing: {
        section: "5rem",      // 80px — between major page sections
        "section-lg": "7rem", // 112px — on landing-grade hero/closing
        gutter: "1.5rem",     // 24px — consistent inner gutter
      },
      maxWidth: {
        prose: "68ch",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",          // 16px — premium card radius
        "2xl": "1.25rem",    // 20px — hero cards
        "3xl": "1.75rem",
      },
      boxShadow: {
        // Layered shadows — soft + crisp
        "card": "0 1px 2px rgba(10,15,26,0.04), 0 1px 0 rgba(10,15,26,0.02)",
        "card-hover": "0 1px 2px rgba(10,15,26,0.04), 0 12px 28px -16px rgba(10,15,26,0.18)",
        "lift": "0 30px 80px -40px rgba(10,15,26,0.35), 0 10px 24px -16px rgba(10,15,26,0.18)",
        "ring-brand": "0 0 0 2px rgba(26,46,53,0.18)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // ENCORE brand tokens
        ink: {
          DEFAULT: "#0A0F1A",
          soft: "#525C6A",
          muted: "#A0AAB5",
        },
        canvas: {
          DEFAULT: "#F7F8F6",
          surface: "#FFFFFF",
          warm: "#F2EFE8",      // warm-neutral tint for section backgrounds
        },
        brand: {
          DEFAULT: "#1A2E35",
          hover: "#2C454E",
          moss: "#4A6B53",
          sand: "#A29061",
        },
        signal: {
          success: "#4A6B53",
          warning: "#C78D38",
          error: "#964545",
        },
        // Restrained recommendation/score scale — used only on badges, bars
        score: {
          weak: "#C56565",     // muted red
          mid: "#C78D38",      // amber
          strong: "#4A6B53",   // green
        },
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "drift": {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "50%": { transform: "translate3d(-2%, 2%, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 1.8s infinite",
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        drift: "drift 18s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
