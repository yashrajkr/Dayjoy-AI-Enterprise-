import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        void: {
          DEFAULT: "hsl(var(--void))",
          surface: "hsl(var(--surface-1))",
          elevated: "hsl(var(--surface-2))",
        },
        indigo: { DEFAULT: "hsl(var(--indigo))" },
        cyan: { DEFAULT: "hsl(var(--cyan))" },
        azure: { DEFAULT: "hsl(var(--azure))" },
        dayjoy: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 14px)",
      },
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        aurora:
          "linear-gradient(135deg, hsl(var(--azure)) 0%, hsl(var(--indigo)) 52%, hsl(var(--cyan)) 100%)",
        "aurora-radial":
          "radial-gradient(circle at 30% 30%, hsl(var(--azure) / 0.55), transparent 60%), radial-gradient(circle at 70% 70%, hsl(var(--cyan) / 0.45), transparent 55%), radial-gradient(circle at 50% 50%, hsl(var(--indigo) / 0.6), transparent 70%)",
        "grid-faint":
          "linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.5) 1px, transparent 1px)",
      },
      boxShadow: {
        glow: "0 0 0 1px hsl(var(--indigo) / 0.25), 0 8px 30px -8px hsl(var(--indigo) / 0.55)",
        "glow-cyan": "0 0 0 1px hsl(var(--cyan) / 0.25), 0 8px 30px -8px hsl(var(--cyan) / 0.45)",
        glass: "0 1px 0 0 hsl(0 0% 100% / 0.06) inset, 0 8px 40px -12px hsl(0 0% 0% / 0.6)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 hsl(var(--cyan) / 0.6)" },
          "50%": { opacity: "0.7", boxShadow: "0 0 0 4px hsl(var(--cyan) / 0)" },
        },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-in": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        shimmer: "shimmer 2.4s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
