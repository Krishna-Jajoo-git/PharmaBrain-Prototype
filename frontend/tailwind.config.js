/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effcfb",
          100: "#d6f6f3",
          500: "#0eaaa3",
          600: "#07837f",
          700: "#086966",
        },
      },
    },
  },
  plugins: [],
};

