import type { Config } from "tailwindcss";
import path from "path";

const config: Config = {
  content: [
    path.join(__dirname, "src/pages/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(__dirname, "src/components/**/*.{js,ts,jsx,tsx,mdx}"),
    path.join(__dirname, "src/app/**/*.{js,ts,jsx,tsx,mdx}"),
  ],
  theme: {
    extend: {
      colors: {
        facebook: {
          blue: "#1877F2",
          hover: "#166fe5",
          light: "#E7F3FF",
          border: "#CED0D4",
          dark: "#050505",
          gray: "#65676B",
          bg: "#F0F2F5",
          card: "#FFFFFF",
        },
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05)",
        card: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
        dropdown: "0 12px 28px 0 rgba(0, 0, 0, 0.2), 0 2px 4px 0 rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};
export default config;
