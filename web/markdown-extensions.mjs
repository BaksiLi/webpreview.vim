// The bundled extension is also a complete example for custom Markdown builds.
import annotation from 'markdown-it-inline-annotation';
import { diagram } from './pele-diagrams.mjs';
import 'markdown-it-inline-annotation/styles.css';

export default function extend(md) {
  md.use(annotation, { spaceAlignment: 'auto', inlineStyles: false });
  const inline = md.renderer.rules.html_inline;
  md.renderer.rules.html_inline = (tokens, i, options, env, renderer) => {
    const html = inline(tokens, i, options, env, renderer);
    const source = tokens[i].meta?.inlineAnnotationSource;
    return source ? `<span data-source="${md.utils.escapeHtml(source)}">${html}</span>` : html;
  };
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, i, options, env, renderer) => {
    const { info, content } = tokens[i];
    const image = info.trim().split(/\s+/)[0] === 'mermaid' && diagram(content);
    if (!image) return fence(tokens, i, options, env, renderer);
    const { src, alt, width, height } = image;
    return `<figure class="wp-diagram"><img src="${src}" alt="${alt}" width="${width}" height="${height}"></figure>\n`;
  };
}
