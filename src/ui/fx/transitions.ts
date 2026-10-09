// Owner: B
// Screen transitions (phase2b §2.9), played by C's router.replaceScreen:
//   'to_game'   (Home → game, victory → next game, event → game): outgoing fades 1 → 0 and scales
//               1 → 0.98 over fx.screenOutMs; after fx.screenInDelayMs the incoming slides up
//               fx.screenSlidePx → 0 and fades in over fx.screenInMs (ease-out); the board entry overlaps.
//   'from_game' (game → Home, game → event): outgoing fades out over fx.screenOutMs; incoming fades
//               in over fx.screenBackInMs; the Home mascot pops in (CSS).
//   reduced:    a crossfade of fx.screenReducedMs.
// During a transition the outgoing screen is inert and aria-hidden; focus moves to the incoming
// screen at its start (the router does that). WAAPI on opacity and transform only.
// F0 stub: signature final; body is B's.
import { cfg, type GameConfig } from '../../app/config';

export type ScreenTransitionKind = 'to_game' | 'from_game';

/**
 * Animates `oldEl` out and `newEl` in (both already in the document; `oldEl` null on the first
 * screen). Resolves when both animations end; never rejects. The caller removes `oldEl` afterwards.
 */
export function playScreenTransition(
  oldEl: HTMLElement | null,
  newEl: HTMLElement,
  kind: ScreenTransitionKind,
  reduced: boolean,
  c: GameConfig = cfg,
): Promise<void> {
  void oldEl;
  void newEl;
  void kind;
  void reduced;
  void c;
  throw new Error('not implemented: playScreenTransition (B, phase2b §2.9)');
}
