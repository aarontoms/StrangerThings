/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        surface: {
          DEFAULT: '#0f172a', // Main bg
          panel: '#111827',  // Panel bg
          border: '#1f2937', // Border
        },
        danger: {
          DEFAULT: '#ef4444',
        }
      }
    },
  },
  plugins: [],
}
