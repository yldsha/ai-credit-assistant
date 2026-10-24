/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        alfa: '#EF3124',
        alfaDark: '#CC281D',
      }
    },
  },
  plugins: [],
}