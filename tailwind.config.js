/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rexant: "#e31b23",
        brass: "#c99a40",
        metal: "#2a2824",
        panel: "#171512",
        bg: "#0f0e0c",
        text: "#f2e9d0",
        muted: "#c8b890",
      },

      fontFamily: {
        // основной стек для интерфейса
        sans: ["Gotham Pro", "Manrope", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "Noto Sans", "sans-serif"],
        // если где-то используешь засечки по-старинке
        serif: ["Cinzel", "serif"],
      },

      boxShadow: {
        brass: "0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.04)",
        soft: "0 8px 22px rgba(0,0,0,.28)",
      },

      backgroundImage: {
        "brass-noise": "url('/assets/brass-noise.webp')",
      },

      keyframes: {
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "spin-slower": { to: { transform: "rotate(-360deg)" } },
        "float-slow": {
          "0%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
          "100%": { transform: "translateY(0)" },
        },
        "steam-pulse": {
          "0%":   { opacity: "0", transform: "translateY(8px) scale(0.95)" },
          "50%":  { opacity: ".35" },
          "100%": { opacity: "0", transform: "translateY(-22px) scale(1.1)" },
        },
      },

      animation: {
        "spin-slow": "spin-slow 28s linear infinite",
        "spin-slower": "spin-slower 18s linear infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
        "steam": "steam-pulse 2.8s ease-in-out infinite",
      },
    },
    container: {
      center: true,
      padding: "1rem",
    },
  },
  plugins: [],
};
