import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1400,
    rolldownOptions: {
      input: {
        game: "index.html",
        arena: "arena.html",
        classShowdown: "class-showdown.html",
        promotionLab: "promotion-lab.html",
        debug: "debug.html",
        portraitLab: "portrait-lab.html",
        combatLab: "combat-lab.html",
        deploymentLab: "deployment-lab.html",
        techniqueLab: "technique-lab.html",
      },
    },
  },
});
