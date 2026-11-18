import { PeleError, render } from 'pele';
import './pele-diagrams.css';

// SVG images keep the diagram separate from the reader DOM. The image's
// preferred color scheme follows the reader, including its manual override.
const dark = `<style>@media (prefers-color-scheme: dark) {
  .pele {
    --pele-bg:#201e19; --pele-fg:#efe8d8; --pele-muted:#b3ab9b;
    --pele-line:#b3ab9b; --pele-surface:#2f2b24; --pele-surface-alt:#3a362e;
    --pele-border:#786f60; --pele-accent:#85b4ac;
  }
}</style>`;

export function diagram(source) {
  try {
    const { svg, type, width, height } = render(source, { links: false, images: false });
    return { src: 'data:image/svg+xml,' + encodeURIComponent(svg.replace('>', '>' + dark)),
      alt: `Mermaid diagram (${type})`, width, height };
  } catch (error) {
    if (!(error instanceof PeleError)) throw error;
    // A draft can be temporarily invalid. Keep the original fence readable.
    return null;
  }
}
