// Owner: lead (preview link, 2026-10-11). Says on screen that the ranking's other players are samples: a line
// "Preview: sample players" at the top of every bracket list, under its stopwatch (the post-win panel and the
// ranking sheet share it, src/ui/overlays/bracket-list.ts) and "Preview: sample ranking" on the result card. The
// game's views are not touched: an observer adds the line to whatever the router mounts (the bracket list's root
// keeps its children fixed, so the line stays in place). Returns a stop function.
import { S } from './strings';

const NOTE = 'data-preview-note';

function note(doc: Document, text: string): HTMLElement {
  const p = doc.createElement('p');
  p.className = 'mwp-note';
  p.setAttribute(NOTE, '');
  p.textContent = text;
  return p;
}

/**
 * Adds the missing lines under `root` (idempotent). UI batch (leaderboard): the stopwatch sits right under the
 * title, so the line goes after it (first when the list has none).
 */
export function labelSamples(root: ParentNode, doc: Document): void {
  for (const list of Array.from(root.querySelectorAll<HTMLElement>('.rank-list--bracket'))) {
    if (Array.from(list.children).some((c) => c.hasAttribute(NOTE))) continue;
    const timer = Array.from(list.children).find((c) => c.classList.contains('lb-timer'));
    if (timer) timer.after(note(doc, S.samplePlayers));
    else list.prepend(note(doc, S.samplePlayers));
  }
  for (const desc of Array.from(root.querySelectorAll<HTMLElement>('.ladder-result .ladder-result__desc'))) {
    if (!desc.querySelector(`[${NOTE}]`)) desc.append(note(doc, S.sampleRanking));
  }
}

export function watchSampleLabels(doc: Document): () => void {
  const target = doc.body ?? doc.documentElement;
  labelSamples(target, doc);
  const Obs = doc.defaultView?.MutationObserver;
  if (!Obs) return () => undefined;
  let queued = false;
  const obs = new Obs(() => {
    if (queued) return;
    queued = true;
    // Once per burst of mutations, after the router has finished building the view.
    queueMicrotask(() => {
      queued = false;
      labelSamples(target, doc);
    });
  });
  obs.observe(target, { childList: true, subtree: true });
  return () => obs.disconnect();
}
