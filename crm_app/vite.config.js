import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


export default defineConfig({
plugins: [react()],
// Для GitHub Pages обычно достаточно "./". Если ассеты не грузятся — поставь base: "/<repo>/"
base: "./"
});