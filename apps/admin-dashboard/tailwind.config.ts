import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			brand: 'var(--brand)',
  			'brand-foreground': 'var(--brand-foreground)',
  			gold: 'var(--gold)',
  			success: 'var(--success)',
  			warning: 'var(--warning)',
  			danger: 'var(--danger)',
  			info: 'var(--info)',
  			violet: 'var(--violet)',
  			teal: 'var(--teal)',
  			subtle: 'var(--subtle)',
  			glass: 'var(--glass)',
  			'glass-strong': 'var(--glass-strong)',
  			sidebar: {
  				DEFAULT: 'var(--sidebar)',
  				foreground: 'var(--sidebar-foreground)',
  				primary: 'var(--brand)',
  				'primary-foreground': 'var(--brand-foreground)',
  				accent: 'var(--glass)',
  				'accent-foreground': 'var(--foreground)',
  				border: 'var(--border)',
  				ring: 'var(--ring)',
  			},
  			chart: {
  				'1': 'var(--brand)',
  				'2': 'var(--info)',
  				'3': 'var(--success)',
  				'4': 'var(--violet)',
  				'5': 'var(--gold)',
  			},
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  		},
  		fontFamily: {
  			sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
  		},
  	},
  },
  plugins: [tailwindcssAnimate],
};

export default config;
