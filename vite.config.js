import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Для GitHub Pages обычно достаточно "./". Если ассеты не грузятся — поставь base: "/<repo>/"
  base: "./",
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5173,
      clientPort: 5173,
    },
  },
});
