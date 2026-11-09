import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    rollupOptions: {
      input: { carrera: "index.html", mando: "mando.html" },
    },
  },
});
