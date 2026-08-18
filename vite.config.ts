import { defineConfig } from "vite";

const developmentInputs = {
  game: "index.html",
  arena: "arena.html",
  classShowdown: "class-showdown.html",
  promotionLab: "promotion-lab.html",
  debug: "debug.html",
  portraitLab: "portrait-lab.html",
  combatLab: "combat-lab.html",
  deploymentLab: "deployment-lab.html",
  techniqueLab: "technique-lab.html",
};

export default defineConfig(({ mode }) => {
  const releaseBuild = mode === "release";
  return {
    server: { port: 4173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      outDir: releaseBuild ? "release" : "dist",
      emptyOutDir: true,
      target: "es2022",
      chunkSizeWarningLimit: 1400,
      rolldownOptions: {
        input: releaseBuild ? { game: "index.html" } : developmentInputs,
      },
    },
  };
});
