// Owner: G3 (Phase 2d.1)
// The lazy fx chunk (helpers-spec §7.3 "Bundle note", §7.9): the points flight, the cat burst, the
// completion labels and the level-start tickers, behind ONE dynamic import from game-screen.ts,
// prefetched at idle after the first game screen mounts (none of it is needed to show the first run's
// screen, the tutorial, which has no ticker). Until it has loaded, POINTS falls back to 2d's roll, a finished unit shows no label
// and a level start's tickers wait for it (they join their crossing where it would be by then); once it
// has, the game screen's fx layer carries [data-celebrate=ready]. Its stylesheet (celebrate.css: the fx
// layer and the tickers) comes with it, out of the first load, and so do the star's and the shards'
// symbols (mountLazyArt, G2's lazy art; the board's mouse chunk mounts them too).
// Which event plays what (CONTRACTS-2d1 §8): CAT_PLACED → shards, light, twinkles (not with reduced
// motion); POINTS → the "+N" over the tile, the star to the Score, then the bar's count-up (reduced
// motion: the "+N" fades in place); UNITS_DONE → one label per anchor tile (the board plays the waves;
// the game screen defers a mouse action's units to their anchor's landing before they get here).
import './celebrate.css';
import type { GameEvent } from '../../game/types';
import { formatNumber, t } from '../../i18n';
import { mountLazyArt } from '../art/lazy-art';
import { createFxLoop, type FxLoop } from './fx-loop';
import { playCatBurst } from './cat-burst';
import { playDoneLabels } from './done-label';
import { playPoints } from './points-flight';

export { createTickers } from './tickers';

/** What the game screen lends the celebrations: its board's rects and colours, its scale, its Score. */
export interface CelebrateContext {
  cellRect(cell: number): DOMRect | null;
  /** The cell's region colour as CSS (var(--rN)). */
  color(cell: number): string;
  /** Slot pitch (tile + gap) in px. */
  pitch(): number;
  /** The game screen's scale s. */
  s(): number;
  reduced(): boolean;
  /** The Score number's client rect (the star's target). */
  scoreRect(): DOMRect | null;
  /** The star landed: the bar counts up to this total. */
  countTo(total: number): void;
}

export interface Celebrate {
  /** Plays what an event shows in the fx layer (CAT_PLACED, POINTS, UNITS_DONE); other events are ignored. */
  play(ev: GameEvent): void;
  /** Ends every running piece at once (a props render: restore, Retry, new board, language change). */
  cancel(): void;
  /** Pieces still running (tests). */
  running(): number;
}

export function createCelebrate(layer: HTMLElement, ctx: CelebrateContext): Celebrate {
  // The star and the shards are not in the first-load sprite: add them now (idempotent; requests-G2 H2).
  mountLazyArt(layer.ownerDocument);
  const loop: FxLoop = createFxLoop(layer.ownerDocument.defaultView as Window);
  return {
    play(ev) {
      if (ev.type === 'POINTS') {
        const tile = ctx.cellRect(ev.cell);
        if (!tile) return;
        playPoints({
          loop,
          layer,
          tile,
          pitch: ctx.pitch(),
          s: ctx.s(),
          text: t('fish.plus', { count: formatNumber(ev.gained) }),
          reduced: ctx.reduced(),
          target: () => ctx.scoreRect(),
          onLand: () => ctx.countTo(ev.total),
          seed: ev.cell,
        });
      } else if (ev.type === 'CAT_PLACED') {
        const tile = ctx.cellRect(ev.cell);
        if (tile && !ctx.reduced()) playCatBurst({ loop, layer, tile, s: ctx.s(), color: ctx.color(ev.cell), seed: ev.cell });
      } else if (ev.type === 'UNITS_DONE') {
        const anchors: { cell: number; tile: DOMRect }[] = [];
        for (const u of ev.units) {
          const tile = ctx.cellRect(u.anchor);
          if (tile && !anchors.some((a) => a.cell === u.anchor)) anchors.push({ cell: u.anchor, tile });
        }
        if (anchors.length) playDoneLabels({ loop, layer, anchors, pitch: ctx.pitch(), s: ctx.s(), reduced: ctx.reduced() });
      }
    },
    cancel: () => loop.cancel(),
    running: () => loop.size(),
  };
}
