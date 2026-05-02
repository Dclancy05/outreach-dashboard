/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        'neon-purple': '#a855f7',
        'neon-blue': '#3b82f6',
        'neon-green': '#22c55e',
        'neon-pink': '#ec4899',
        'neon-cyan': '#06b6d4',
        // Memory v2 palette — additive tokens used by /agency/memory + /agency/agents 4-pane shell.
        // Color values track the prototype 1:1 so ports of those components work without rewrite.
        'mem-bg': '#0A0A0B',
        'mem-surface-1': '#111113',
        'mem-surface-2': '#17171A',
        'mem-surface-3': '#1F1F23',
        'mem-border': 'rgba(255,255,255,0.08)',
        'mem-border-strong': 'rgba(255,255,255,0.14)',
        'mem-text-primary': '#EDEDED',
        'mem-text-secondary': '#A1A1A6',
        'mem-text-muted': '#6E6E78',
        'mem-accent': '#7C5CFF',
        'mem-status-working': '#34D399',
        'mem-status-thinking': '#FBBF24',
        'mem-status-needs': '#60A5FA',
        'mem-status-stuck': '#F87171',
        'mem-status-idle': '#71717A',
        'mem-status-done': '#C084FC',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionTimingFunction: {
        'mem-spring': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'mem-stream-caret': {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
      animation: {
        'mem-stream-caret': 'mem-stream-caret 1s steps(2) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
