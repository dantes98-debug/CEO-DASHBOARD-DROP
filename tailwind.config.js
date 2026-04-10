/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        card: '#1e293b',
        'card-hover': '#263548',
        accent: '#3b82f6',
        'accent-hover': '#2563eb',
        border: '#334155',
        muted: '#64748b',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
      },
    },
  },
  plugins: [],
}
