/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyan: {
          400: '#00f0ff', // VitalPath AI Cyan
          950: '#083344',
        }
      }
    },
  },
  plugins: [],
}