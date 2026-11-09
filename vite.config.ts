import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "./" : "/",
  build: {
    target: "es2022",
    rollupOptions: {
      input: mode === "pages" ? "index.html" : { carrera: "index.html", mando: "mando.html" },
    },
  },
}));
