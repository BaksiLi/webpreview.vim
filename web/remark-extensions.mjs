import annotation from './remark-annotation.mjs';
import { visit } from 'unist-util-visit';
import { diagram } from './pele-diagrams.mjs';
import 'markdown-it-inline-annotation/styles.css';

function mermaid() {
  return tree => visit(tree, { type: 'element', tagName: 'pre' }, node => {
    const [code] = node.children;
    if (code?.tagName !== 'code' || !code.properties.className?.includes('language-mermaid')) return;
    const image = diagram(code.children[0]?.value ?? '');
    if (!image) return;
    node.tagName = 'figure';
    node.properties.className = ['wp-diagram'];
    node.children = [{ type: 'element', tagName: 'img', properties: image, children: [] }];
  });
}

export default function extend({ remark, rehype }) {
  remark.use(annotation, { spaceAlignment: 'auto', inlineStyles: false });
  rehype.use(mermaid);
}
