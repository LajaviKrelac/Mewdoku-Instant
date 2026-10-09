// Owner: U (Phase 2b review fixes, PAR-7)
// Teaching copy in the original's style (01 §9.3, §6.4): rule keywords in the accent colour and
// region colours named "in their colour". Pastel text on white would fail WCAG 1.4.3, so a colour
// name keeps the ink colour and gets a small swatch (and an underline) in its tile colour instead.
// Input is a translated string that may hold `*keyword*` markers (i18n translateMarked) and colour
// tokens (colorToken(id), passed as a placeholder value). The rendered element's textContent is the
// plain sentence: markers and tokens resolved, so screen readers and text comparisons see the same
// words as the plain-text path (t(), hintText()).
//
// Classes: .kw (keyword), .color-name[style=--sw] > .color-name__sw (swatch) + the name; .nowrap.
import { splitMarks } from '../i18n';
import { h } from './dom';
import { keepTogetherNodes } from './overlays/overlay-base';
import { CAP } from './rich-tokens';

export { CAP, colorToken } from './rich-tokens';

const TOKEN = /\ue000(\d+)\ue001/g;

/** Removes colour tokens and the CAP sentinel (diagnostics; the renderer resolves them). */
export function stripTokens(text: string): string {
  return text.replace(TOKEN, '').split(CAP).join('');
}

export interface RichTextOptions {
  /** The palette index (swatch colour) and the shown name of the colour token `id`. */
  color?(id: number): { readonly palette: number; readonly name: string };
  /** Capitalises a CAP-marked first letter (i18n capitalizeFirst). Default: unchanged. */
  capitalize?(text: string): string;
  /** Wrap hyphenated words and "word —" in .nowrap spans (setTextKeepTogether's rule). Default true. */
  keepTogether?: boolean;
}

/** The nodes for `text` (see the header). */
export function richNodes(text: string, opts: RichTextOptions = {}): Node[] {
  const out: Node[] = [];
  let capNext = false;
  const keep = opts.keepTogether !== false;
  const cap = (s: string): string => {
    if (!capNext || s === '') return s;
    capNext = false;
    return opts.capitalize ? opts.capitalize(s) : s;
  };
  const textNodes = (s: string): Node[] =>
    (keep ? keepTogetherNodes(s) : [s]).map((n) => (typeof n === 'string' ? document.createTextNode(n) : n));
  for (const seg of splitMarks(text)) {
    const parts: Node[] = [];
    let last = 0;
    const body = seg.text;
    const pushText = (s: string): void => {
      let rest = s;
      const at = rest.indexOf(CAP);
      if (at >= 0) {
        if (at > 0) parts.push(...textNodes(cap(rest.slice(0, at))));
        capNext = true;
        rest = rest.slice(at + 1).split(CAP).join('');
      }
      if (rest !== '') parts.push(...textNodes(cap(rest)));
    };
    for (const m of body.matchAll(TOKEN)) {
      pushText(body.slice(last, m.index));
      const id = Number(m[1]);
      const c = opts.color?.(id) ?? { palette: id, name: String(id) };
      parts.push(
        h(
          'span',
          { class: 'color-name', dataset: { palette: c.palette }, style: { '--sw': `var(--r${c.palette})` } },
          h('span', { class: 'color-name__sw', 'aria-hidden': 'true' }),
          cap(c.name),
        ),
      );
      last = (m.index ?? 0) + m[0].length;
    }
    pushText(body.slice(last));
    if (seg.kw) out.push(h('span', { class: 'kw' }, parts));
    else out.push(...parts);
  }
  return out;
}

/** Replaces `el`'s content with the rich rendering of `text`. */
export function setRichText(el: HTMLElement, text: string, opts: RichTextOptions = {}): void {
  el.textContent = '';
  el.append(...richNodes(text, opts));
}
