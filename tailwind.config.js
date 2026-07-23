/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff8ff',
          100: '#dbeefe',
          500: '#1E7FB8',
          600: '#166A9C',
          700: '#125680',
        },
      },
    },
  },
  plugins: [],
}
