export function configureGameScaling(viewport: HTMLElement, screen: HTMLElement): () => void {
  const resize = () => {
    const scale = Math.min(1, viewport.clientWidth / 640);
    viewport.style.height = `${350 * scale}px`;
    screen.style.setProperty("--game-scale", String(scale));
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  resize();
  return () => observer.disconnect();
}
