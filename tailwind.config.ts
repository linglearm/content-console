import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // โทนสีแนวกีฬา/ฟิตเนส (SiamAthlete) — ส้ม-แดงพลังงานสูง
        brand: {
          50: "#fff4ed",
          100: "#ffe6d5",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
