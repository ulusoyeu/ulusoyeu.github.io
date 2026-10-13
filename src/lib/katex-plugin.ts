// Renders $inline$ and $$display$$ math with KaTeX at build time, so pages ship no math JavaScript.
import katex from 'katex';
import { defineMdastPlugin } from 'satteri';

const render = (tex: string, displayMode: boolean) =>
  katex.renderToString(tex, { displayMode, throwOnError: false });

export const katexPlugin = defineMdastPlugin({
  name: 'katex',
  inlineMath(node, ctx) {
    ctx.replaceNode(node, { type: 'html', value: render(node.value, false) });
  },
  math(node, ctx) {
    ctx.replaceNode(node, { type: 'html', value: render(node.value, true) });
  },
});
