// Owner: B (Phase 2b); G2 (Phase 2c: the kept-fish row, level points and the perfect streak)
// Victory screen (new overlay `victory`, phase2b §2.5; replaces O3 `win` and, for dailies, O7
// `daily_result`, which stay one release unopened). Full screen, opaque --page; 12 --accent-soft sun
// rays behind the cat turning once per fx.victoryRaysTurnMs (static with reduced motion). Top to
// bottom: praise word, the win pose, "Level 37 complete", the reward block, the event milestone line;
// then the wide orange primary button (btn--primary btn--lg, enabled `buttonDelayMs` after open) and
// a ghost "Home".
// Phase 2c (fish-lives-spec §2.7): no fish pill, no "+" (shop) and no bonus chip. The reward block has
// two rows: the FISH KEPT (maxHearts fish, the kept ones full and the lost ones as icon-fish-empty,
// "+2" and "This week: 42"; hidden when the win added no leaderboard points) and the LEVEL POINTS
// ("+120 points" and, after a perfect win, the chip "Perfect ×4").
// With `bannerReserved` the root gets data-banner (phase2b §3.2) and the column keeps the
// ads.banner.reservePx band free under the buttons.
// Esc and Enter: Enter presses the focused primary (autofocus); Esc is ignored (a choice is needed).
// Reduced motion: a crossfade of fx.screenReducedMs (WAAPI), static rays, no progress-bar fill.
// Lazy overlay chunk.
//
// Review fixes: a dark full-screen overlay like the fail card (PAR-3, the original's "dark full-screen
// overlays for win and fail"): light text on --stage, the orange "Level N". The buttons never sit under
// the banner band (UX-1, I18N-LAYOUT-1): the actions are sticky at the bottom of the scrolling overlay
// (clear of the reserve plus buttonClearancePx), and fit() compacts the hero in steps (data-fit 1–3)
// while the content is taller than the screen, so on short phones nothing needs a scroll. The event
// bar is named by its "3 / 21 solved" line (A11Y-NAME-1); static labels follow the language.
//
// Classes: .overlay[data-overlay=victory] > .victory[data-variant][data-banner]
//          > .victory__col(.victory__praise .victory__stage(.victory__rays .victory__art)
//            .victory__sub .victory__daily .victory__event(.victory__bar .victory__milestone)
//            .victory__reward(.victory__kept[data-count](.victory__fishes > .victory__fish[data-kept] .victory__plus .victory__period)
//              .victory__score(.victory__chip.victory__points .victory__chip.victory__streak))
//            .victory__actions(.victory__primary .victory__home))
import { cfg, type PeriodKind } from '../../app/config';
import type { Reward } from '../../game/events';
import { formatClock, formatDuration, formatNumber, formatShortDate, joinList, praise, t, tn, translate, type I18nKey } from '../../i18n';
import { illustration } from '../art/illustrations';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { fishKeptText, periodTotalText } from '../period-text';
import { createDelay, createOverlayShell, createTicker, makeButton, nextId, setButtonLabel, setGated, setTextKeepTogether } from './overlay-base';

/**
 * level: "Level {L+1}"; tutorial (first run): "You're ready!" + "Play Level 2"; tutorial_replay:
 * no fish, "Home"; daily: time, mistakes, hints, countdown, "Done"; event: progress + "Puzzle {i+1}"
 * or "Back to event" after the last (§2.5 Variants).
 */
export type VictoryVariant = 'level' | 'tutorial' | 'tutorial_replay' | 'daily' | 'event';

export interface VictoryDailyView {
  readonly dateKey: string;
  readonly ms: number;
  readonly mistakes: number;
  readonly hints: number;
  readonly kitties: number;
  /** Epoch ms of the next daily (countdown; daily.ready once passed). */
  readonly nextPuzzleAt: number;
}

export interface VictoryEventView {
  readonly nameKey: I18nKey;
  /** Puzzle just solved, 0-based (the UI shows index + 1). */
  readonly index: number;
  readonly total: number;
  /** The progress bar animates from solvedBefore to solvedAfter (400 ms, CSS). */
  readonly solvedBefore: number;
  readonly solvedAfter: number;
  /** "Event reward: +2 hints" when this win reached a milestone (already granted). */
  readonly reward: Reward | null;
  /** All puzzles solved: the button says "Back to event". */
  readonly last: boolean;
}

export interface VictoryProps {
  readonly variant: VictoryVariant;
  /** Index into PRAISE_KEYS (the app picks it). */
  readonly praise: number;
  /** The level just won (tutorial: 1); null for daily and event. */
  readonly level: number | null;
  /** The primary button's level ("Level 38"); 2 for the first-run tutorial; null otherwise. */
  readonly nextLevel: number | null;
  /** Level points: "+120 points"; null (or 0) when the win scores none (tutorial, not counted). */
  readonly pointsEarned: number | null;
  /** Phase 2c §2.7: "Perfect ×N" for a perfect win (N = streak after it, ≥ 1); null otherwise. */
  readonly streak: number | null;
  /**
   * Phase 2c §2.7: the fish-kept row (`fish` of `max` lives kept, "+`gained`", the period `total`
   * after the win); null when the win added no leaderboard points (tutorial, not counted, mode excluded).
   */
  readonly kept: { readonly fish: number; readonly max: number; readonly gained: number; readonly total: number; readonly kind: PeriodKind } | null;
  readonly daily: VictoryDailyView | null;
  readonly event: VictoryEventView | null;
  /** fx.winButtonDelayMs (600): the primary button turns active this long after open. */
  readonly buttonDelayMs: number;
  readonly reducedMotion: boolean;
  /** phase2b §3.2: reserve ads.banner.reservePx (+ safe bottom) under the buttons. */
  readonly bannerReserved: boolean;
  /** Clock for the daily countdown. */
  now(): number;
  /** The orange primary: next level / Play Level 2 / Home (replay) / Done (daily) / next puzzle or back to event. */
  onPrimary(): void;
  onHome(): void;
}

/** "+2 hints and +3 kitties" (§4.5 "Event reward: +2 hints"). Phase 2c: milestones grant no fish. */
export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.hints) parts.push(t('fish.plus', { count: tn('event.reward.hints', r.hints, { count: formatNumber(r.hints) }) }));
  if (r.kitties) parts.push(t('fish.plus', { count: tn('event.reward.kitties', r.kitties, { count: formatNumber(r.kitties) }) }));
  return joinList(parts);
}

/** The primary button's label per variant (§2.5). */
export function primaryLabel(p: Pick<VictoryProps, 'variant' | 'nextLevel' | 'event'>): string {
  switch (p.variant) {
    case 'level':
      return t('victory.next', { level: p.nextLevel ?? 1 });
    case 'tutorial':
      return t('win.tutorial.play', { level: p.nextLevel ?? 2 });
    case 'tutorial_replay':
      return t('common.home');
    case 'daily':
      return t('daily.done');
    case 'event':
      return p.event && !p.event.last ? t('event.play', { index: p.event.index + 2 }) : t('event.back');
  }
}

/** Countdown refresh period (minute resolution text). */
const REFRESH_MS = 1000;
/** Compaction steps of fit() (overlay-chunk.css .victory[data-fit]). */
export const FIT_LEVELS = 3;

/**
 * The compaction step that lets the content fit: the first of 0…FIT_LEVELS whose measured overflow
 * (`overflowAt(level)`, content height minus the screen) is ≤ 0, else the last step.
 */
export function fitLevel(overflowAt: (level: number) => number): number {
  for (let level = 0; level < FIT_LEVELS; level++) if (overflowAt(level) <= 1) return level;
  return FIT_LEVELS;
}

/** The kept-fish row's data, clamped; null when the row is hidden (no row, or no fish added). */
function keptRow(k: VictoryProps['kept'] | undefined): NonNullable<VictoryProps['kept']> | null {
  if (!k || !(k.gained > 0)) return null;
  const max = Math.max(1, Math.min(12, Math.floor(k.max)));
  return { ...k, max, fish: Math.max(0, Math.min(max, Math.floor(k.fish))) };
}

export function createVictoryScreen(): OverlayView<VictoryProps> {
  let props: VictoryProps | null = null;
  const shell = createOverlayShell({ id: 'victory', scrim: 'clear', panel: 'dialog' });
  const root = shell.panel;
  root.className = 'victory';
  const delay = createDelay();
  const ticker = createTicker();
  const barDelay = createDelay();

  const L = createLocaleText();
  const title = h('h2', { class: 'victory__praise', id: shell.titleId });
  const rays = h('div', { class: 'victory__rays', 'aria-hidden': 'true' });
  const winArt = L.attr(illustration('win', { label: t('a11y.illustration.win') }), 'aria-label', () => t('a11y.illustration.win'));
  const art = h('div', { class: 'victory__art' }, winArt);
  const sub = h('p', { class: 'victory__sub', id: shell.descId });

  // Daily: time, mistakes and hints, countdown.
  const dailyTime = h('p', { class: 'victory__time num' });
  const dailyStats = h('p', { class: 'victory__stats' });
  const dailyNext = h('p', { class: 'victory__next' });
  const daily = h('div', { class: 'victory__daily' }, dailyTime, dailyStats, dailyNext);

  // Reward block (Phase 2c §2.7), row 1: the fish kept ("[fish][fish][empty] +2 | This week: 42").
  const fishes = h('span', { class: 'victory__fishes', 'aria-hidden': 'true' });
  let fishFor = '';
  const plus = h('span', { class: 'victory__plus num', 'aria-hidden': 'true' });
  const periodLine = h('span', { class: 'victory__period', 'aria-hidden': 'true' });
  const keptId = nextId('victory-kept');
  const kept = h('div', { class: 'victory__kept', role: 'img', id: keptId }, fishes, plus, periodLine);
  // Row 2: level points and the perfect-streak chip.
  const pointsChip = h('span', { class: 'victory__chip victory__points num' });
  const streakChip = h('span', { class: 'victory__chip victory__streak', role: 'img' });
  const scoreId = nextId('victory-score');
  const score = h('div', { class: 'victory__score', id: scoreId }, pointsChip, streakChip);
  const reward = h('div', { class: 'victory__reward' }, kept, score);

  // Event: progress bar + milestone line. The bar's name is its visible "3 / 21 solved" line (A11Y-NAME-1).
  const eventLabelId = nextId('victory-event-label');
  const eventLabel = h('p', { class: 'victory__event-label', id: eventLabelId });
  const barFill = h('span', { class: 'victory__bar-fill' });
  const bar = h('div', { class: 'victory__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-labelledby': eventLabelId }, barFill);
  const milestone = h('p', { class: 'victory__milestone' });
  const eventId = nextId('victory-event');
  const event = h('div', { class: 'victory__event', id: eventId }, eventLabel, bar, milestone);

  const primary = makeButton({
    variant: 'primary',
    label: '',
    block: true,
    autofocus: true,
    className: 'btn--lg victory__primary',
    onPress: () => props?.onPrimary(),
  });
  const home = L.label(
    makeButton({ variant: 'ghost', label: '', icon: 'icon-house', className: 'victory__home', onPress: () => props?.onHome() }),
    () => t('common.home'),
  );

  const col = h(
    'div',
    { class: 'victory__col' },
    title,
    h('div', { class: 'victory__stage' }, rays, art),
    sub,
    daily,
    // Phase 2c §2.7: the daily's and the event's own lines sit above the reward block.
    event,
    reward,
    h('div', { class: 'victory__actions' }, primary, home),
  );
  root.append(col);
  root.style.setProperty('--rays-ms', `${cfg.fx.victoryRaysTurnMs}ms`);
  root.style.setProperty('--banner-reserve', `${cfg.ads.banner.reservePx}px`);
  root.style.setProperty('--banner-clear', `${cfg.ads.banner.buttonClearancePx}px`);

  const renderNext = (): void => {
    if (!props?.daily) return;
    const left = props.daily.nextPuzzleAt - props.now();
    setText(dailyNext, left <= 0 ? t('daily.ready') : t('daily.next', { time: formatDuration(left) }));
  };

  const setBar = (solved: number, totalCount: number): void => {
    const frac = totalCount > 0 ? Math.max(0, Math.min(1, solved / totalCount)) : 0;
    // A width (not a scale) so the fill starts at the inline start in RTL too (§6.5); CSS transitions it.
    barFill.style.width = `${(frac * 100).toFixed(2)}%`;
    bar.setAttribute('aria-valuenow', String(solved));
    bar.setAttribute('aria-valuemax', String(totalCount));
  };

  // ── fit (UX-1, I18N-LAYOUT-1): compact the hero while the content is taller than the screen ──
  const scroller = shell.el;
  /** data-fit = the step (1–3); data-tight marks steps 2 and 3 (overlay-chunk.css). */
  const setFit = (lv: number): void => {
    if (lv === 0) delete root.dataset.fit;
    else root.dataset.fit = String(lv);
    root.toggleAttribute('data-tight', lv >= 2);
  };
  const fit = (): void => {
    if (!shell.isOpen() || !scroller.isConnected) return;
    setFit(
      fitLevel((lv) => {
        setFit(lv);
        return scroller.scrollHeight - scroller.clientHeight;
      }),
    );
  };
  let fitRaf = 0;
  const win = (): Window | null => shell.el.ownerDocument.defaultView;
  /** fit() now (the screen is shown) and once more on the next frame (fonts, the pill, late layout). */
  const refit = (): void => {
    fit();
    const w = win();
    if (!w || typeof w.requestAnimationFrame !== 'function') return;
    w.cancelAnimationFrame(fitRaf);
    fitRaf = w.requestAnimationFrame(() => {
      fitRaf = 0;
      fit();
    });
  };
  const stopFit = (): void => {
    if (fitRaf) win()?.cancelAnimationFrame(fitRaf);
    fitRaf = 0;
  };

  const render = (p: VictoryProps, opening: boolean): void => {
    props = p;
    L.apply();
    root.dataset.variant = p.variant;
    root.toggleAttribute('data-banner', p.bannerReserved);
    root.toggleAttribute('data-reduced', p.reducedMotion);
    const tutorial = p.variant === 'tutorial' || p.variant === 'tutorial_replay';

    setText(title, tutorial ? t('win.tutorial.title') : praise(p.praise));
    if (p.variant === 'daily' && p.daily) {
      const date = formatShortDate(p.daily.dateKey);
      setTextKeepTogether(sub, t('daily.title', { date }), [date]);
    } else if (p.variant === 'event' && p.event) {
      setText(sub, t('event.title.game', { event: translate(p.event.nameKey), index: p.event.index + 1 }));
    } else if (tutorial) {
      setText(sub, t('win.tutorial.body'));
    } else {
      setText(sub, t('win.levelComplete', { level: p.level ?? 1 }));
    }

    daily.hidden = !(p.variant === 'daily' && p.daily);
    if (p.daily) {
      setText(dailyTime, t('daily.solvedIn', { time: formatClock(p.daily.ms) }));
      setText(dailyStats, t('daily.stats', { mistakes: p.daily.mistakes, hints: p.daily.hints }));
      renderNext();
    }

    // Row 1 (§2.7): hidden when the win added no leaderboard points; never on a tutorial.
    const k = tutorial ? null : keptRow(p.kept);
    kept.hidden = k === null;
    if (k) {
      kept.dataset.count = String(k.fish);
      const want = `${k.fish}/${k.max}`;
      if (want !== fishFor) {
        fishFor = want;
        fishes.textContent = '';
        for (let i = 0; i < k.max; i++) {
          const full = i < k.fish;
          const f = icon(full ? 'icon-fish' : 'icon-fish-empty', { class: 'victory__fish' });
          f.toggleAttribute('data-kept', full);
          fishes.appendChild(f);
        }
      }
      setText(plus, t('fish.plus', { count: formatNumber(k.gained) }));
      setText(periodLine, periodTotalText(k.kind, k.total));
      kept.setAttribute('aria-label', fishKeptText(k.kind, k.fish, k.total));
    } else {
      delete kept.dataset.count;
    }
    // Row 2: "+120 points" and the "Perfect ×4" chip (a perfect win only).
    const pts = tutorial ? null : p.pointsEarned;
    pointsChip.hidden = pts === null || pts <= 0;
    if (pts !== null && pts > 0) setText(pointsChip, t('victory.points', { points: formatNumber(pts) }));
    const streak = tutorial || p.streak === null || !(p.streak >= 1) ? null : Math.floor(p.streak);
    streakChip.hidden = streak === null;
    if (streak !== null) {
      setText(streakChip, t('victory.streak', { count: formatNumber(streak) }));
      streakChip.setAttribute('aria-label', tn('victory.streak.a11y', streak, { count: formatNumber(streak) }));
    }
    score.hidden = pointsChip.hidden && streakChip.hidden;
    reward.hidden = kept.hidden && score.hidden;

    event.hidden = !(p.variant === 'event' && p.event);
    if (p.event) {
      const e = p.event;
      setText(eventLabel, t('event.card.progress', { solved: formatNumber(e.solvedAfter), total: formatNumber(e.total) }));
      milestone.hidden = !e.reward;
      if (e.reward) setText(milestone, t('victory.eventReward', { reward: rewardText(e.reward) }));
      if (opening && !p.reducedMotion && e.solvedBefore !== e.solvedAfter) {
        // §4.5: the bar animates from the old to the new value (400 ms CSS transition), after it shows.
        root.classList.add('victory--bar-static');
        setBar(e.solvedBefore, e.total);
        barDelay.start(cfg.fx.overlayFadeMs, () => {
          root.classList.remove('victory--bar-static');
          setBar(e.solvedAfter, e.total);
        });
      } else if (!opening || p.reducedMotion) {
        setBar(e.solvedAfter, e.total);
      }
    }

    // The dialog's description (§7 screen reader): the result line, the fish kept ("You kept 2 fish.
    // Your total this week: 42."), the points and the streak, the event progress and milestone; only
    // what is shown.
    const described = [shell.descId];
    if (!kept.hidden) described.push(keptId);
    if (!score.hidden) described.push(scoreId);
    if (!event.hidden) described.push(eventId);
    root.setAttribute('aria-describedby', described.join(' '));

    setButtonLabel(primary, primaryLabel(p));
    // The ghost Home only where the primary does not already lead home (§2.5 Variants).
    home.hidden = p.variant === 'tutorial' || p.variant === 'tutorial_replay' || p.variant === 'daily';
    if (!opening) refit();
  };

  // A language switch while the screen is up relabels it (A11Y-I18N-1).
  L.watch(() => {
    if (props && shell.isOpen()) render(props, false);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p, true);
      setGated(primary, true);
      delay.start(p.buttonDelayMs, () => setGated(primary, false));
      if (p.daily) ticker.start(REFRESH_MS, renderNext);
      else ticker.stop();
      shell.show();
      refit();
      win()?.addEventListener('resize', refit);
      if (p.reducedMotion && typeof shell.el.animate === 'function') {
        try {
          shell.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cfg.fx.screenReducedMs, easing: 'linear' });
        } catch {
          // shows at once
        }
      }
    },
    update(p) {
      render(p, false);
    },
    close() {
      delay.cancel();
      barDelay.cancel();
      ticker.stop();
      stopFit();
      win()?.removeEventListener('resize', refit);
      shell.hide();
    },
    dismiss: () => false,
    destroy() {
      delay.cancel();
      barDelay.cancel();
      ticker.stop();
      stopFit();
      win()?.removeEventListener('resize', refit);
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
