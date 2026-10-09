// Owner: B
// Victory screen (new overlay `victory`, phase2b §2.5; replaces O3 `win` and, for dailies, O7
// `daily_result`, which stay one release unopened). Full screen, opaque --page; 12 --accent-soft sun
// rays behind the cat turning once per fx.victoryRaysTurnMs (static with reduced motion). Top to
// bottom: praise word, the win pose, "Level 37 complete", the reward row (three fish, "+3", the total,
// a bonus chip, "+55 points"), the event milestone line; then the wide orange primary button
// (btn--primary btn--lg, enabled `buttonDelayMs` after open) and a ghost "Home". The fish pill (with
// "+") sits on this screen too, centred at the top (clear of the FB safe zone in the top-left corner).
// With `bannerReserved` the root gets data-banner (phase2b §3.2) and the column keeps the
// ads.banner.reservePx band free under the buttons.
// Esc and Enter: Enter presses the focused primary (autofocus); Esc is ignored (a choice is needed).
// Reduced motion: a crossfade of fx.screenReducedMs (WAAPI), static rays, no progress-bar fill.
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=victory] > .victory[data-variant][data-banner]
//          > .victory__top(.fish-pill) .victory__col(.victory__praise .victory__stage(.victory__rays .victory__art)
//            .victory__sub .victory__daily .victory__reward(.victory__fishes .victory__plus .victory__total)
//            .victory__chips(.victory__chip--bonus .victory__chip--points) .victory__event(.victory__bar .victory__milestone)
//            .victory__actions(.victory__primary .victory__home))
import { cfg } from '../../app/config';
import type { Reward } from '../../game/events';
import { formatClock, formatDuration, formatNumber, formatShortDate, joinList, praise, t, tn, translate, type I18nKey } from '../../i18n';
import { illustration } from '../art/illustrations';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createFishPill, type FishPillView } from '../hud/pills';
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
  /** "Event reward: +30 fish" when this win reached a milestone (already granted). */
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
  /** Fish of this win (base + bonus) and the wallet total after it; null = no fish (tutorial replay, restored board). */
  readonly fish: { readonly earned: number; readonly total: number } | null;
  /** Bonus chip "Hard level bonus +2" / "Daily bonus +2". */
  readonly bonus: { readonly kind: 'hard' | 'daily'; readonly count: number } | null;
  /** "+55 points"; null when the win scores none (tutorial). */
  readonly pointsEarned: number | null;
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
  /** The fish pill's "+": open the shop. */
  onShop(): void;
}

/** "+30 fish", "+2 hints and +3 kitties" (§4.5 "Event reward: +30 fish"). */
export function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.fish) parts.push(t('fish.plus', { count: tn('event.reward.fish', r.fish, { count: formatNumber(r.fish) }) }));
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
/** Three fish in the reward row, whatever the count (bonuses add a number, not more fish, §2.14). */
const ROW_FISH = 3;

export function createVictoryScreen(): OverlayView<VictoryProps> {
  let props: VictoryProps | null = null;
  const shell = createOverlayShell({ id: 'victory', scrim: 'clear', panel: 'dialog' });
  const root = shell.panel;
  root.className = 'victory';
  const delay = createDelay();
  const ticker = createTicker();
  const barDelay = createDelay();

  // Top: the fish pill (with "+").
  let pill: FishPillView | null = null;
  const top = h('div', { class: 'victory__top' });

  const title = h('h2', { class: 'victory__praise', id: shell.titleId });
  const rays = h('div', { class: 'victory__rays', 'aria-hidden': 'true' });
  const art = h('div', { class: 'victory__art' }, illustration('win', { label: t('a11y.illustration.win') }));
  const sub = h('p', { class: 'victory__sub', id: shell.descId });

  // Daily: time, mistakes and hints, countdown.
  const dailyTime = h('p', { class: 'victory__time num' });
  const dailyStats = h('p', { class: 'victory__stats' });
  const dailyNext = h('p', { class: 'victory__next' });
  const daily = h('div', { class: 'victory__daily' }, dailyTime, dailyStats, dailyNext);

  // Reward row: three fish, "+3", the total.
  const fishes = h('span', { class: 'victory__fishes', 'aria-hidden': 'true' });
  for (let k = 0; k < ROW_FISH; k++) fishes.appendChild(icon('icon-fish', { class: 'victory__fish' }));
  const plus = h('span', { class: 'victory__plus num', 'aria-hidden': 'true' });
  const total = h('span', { class: 'victory__total' });
  const rewardId = nextId('victory-reward');
  const reward = h('div', { class: 'victory__reward', role: 'group', id: rewardId }, fishes, plus, total);

  const bonusChip = h('span', { class: 'victory__chip victory__chip--bonus' });
  const pointsChip = h('span', { class: 'victory__chip victory__chip--points num' });
  const chipsId = nextId('victory-chips');
  const chips = h('div', { class: 'victory__chips', id: chipsId }, bonusChip, pointsChip);

  // Event: progress bar + milestone line.
  const eventLabel = h('p', { class: 'victory__event-label' });
  const barFill = h('span', { class: 'victory__bar-fill' });
  const bar = h('div', { class: 'victory__bar', role: 'progressbar', 'aria-valuemin': '0' }, barFill);
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
  const home = makeButton({ variant: 'ghost', label: t('common.home'), icon: 'icon-house', className: 'victory__home', onPress: () => props?.onHome() });

  const col = h(
    'div',
    { class: 'victory__col' },
    title,
    h('div', { class: 'victory__stage' }, rays, art),
    sub,
    daily,
    reward,
    chips,
    event,
    h('div', { class: 'victory__actions' }, primary, home),
  );
  root.append(top, col);
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

  const render = (p: VictoryProps, opening: boolean): void => {
    props = p;
    root.dataset.variant = p.variant;
    root.toggleAttribute('data-banner', p.bannerReserved);
    root.toggleAttribute('data-reduced', p.reducedMotion);
    const tutorial = p.variant === 'tutorial' || p.variant === 'tutorial_replay';

    // Fish pill: shown whenever this win has a wallet total.
    if (p.fish) {
      if (!pill) {
        pill = createFishPill({ count: p.fish.total, onPlus: () => props?.onShop() });
        top.appendChild(pill.el);
      } else {
        pill.update({ count: p.fish.total, onPlus: () => props?.onShop() });
      }
    }
    top.hidden = !p.fish;

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

    reward.hidden = !p.fish;
    if (p.fish) {
      setText(plus, t('fish.plus', { count: formatNumber(p.fish.earned) }));
      setText(total, tn('fish.count', p.fish.total, { count: formatNumber(p.fish.total) }));
      reward.setAttribute('aria-label', tn('a11y.fishEarned', p.fish.earned, { count: formatNumber(p.fish.earned), total: formatNumber(p.fish.total) }));
    }
    bonusChip.hidden = !p.bonus;
    if (p.bonus) {
      bonusChip.dataset.kind = p.bonus.kind;
      setText(bonusChip, p.bonus.kind === 'hard' ? t('victory.bonus.hard', { count: p.bonus.count }) : t('victory.bonus.daily', { count: p.bonus.count }));
    }
    pointsChip.hidden = p.pointsEarned === null || p.pointsEarned <= 0;
    if (p.pointsEarned !== null) setText(pointsChip, t('victory.points', { points: formatNumber(p.pointsEarned) }));
    chips.hidden = bonusChip.hidden && pointsChip.hidden;

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

    // The dialog's description (§7 screen reader): the result line, the fish ("You caught 3 fish. You
    // have 128."), the bonus and points, the event progress and milestone; only what is shown.
    const described = [shell.descId];
    if (!reward.hidden) described.push(rewardId);
    if (!chips.hidden) described.push(chipsId);
    if (!event.hidden) described.push(eventId);
    root.setAttribute('aria-describedby', described.join(' '));

    setButtonLabel(primary, primaryLabel(p));
    // The ghost Home only where the primary does not already lead home (§2.5 Variants).
    home.hidden = p.variant === 'tutorial' || p.variant === 'tutorial_replay' || p.variant === 'daily';
  };

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
      shell.hide();
    },
    dismiss: () => false,
    destroy() {
      delay.cancel();
      barDelay.cancel();
      ticker.stop();
      pill?.destroy();
      props = null;
      shell.el.remove();
    },
  };
}
