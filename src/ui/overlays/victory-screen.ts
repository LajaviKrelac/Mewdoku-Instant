// Owner: B (Phase 2b); G2 (Phase 2c: the kept-fish row; Phase 2c.1: the level's points total); G3 (Phase 2e:
// the streak row and the daily reward line)
// Victory screen (new overlay `victory`, phase2b §2.5; replaces O3 `win` and, for dailies, O7
// `daily_result`, which stay one release unopened). Full screen, opaque --page; 12 --accent-soft sun
// rays behind the cat turning once per fx.victoryRaysTurnMs (static with reduced motion). Top to
// bottom: praise word, the win pose, "Level 37 complete", the praise lines, the reward block, the event
// milestone line; then the wide orange primary button (btn--primary btn--lg, enabled `buttonDelayMs`
// after open).
// Phase 2c (fish-lives-spec §2.7): no fish pill, no "+" (shop) and no bonus chip. Phase 2c.1 (§10.3):
// the reward block has two rows: first the LEVEL'S POINTS TOTAL (icon-points and "7,296 points" in a
// white pill; every scored variant whenever the total is > 0, counted or not; never the tutorial),
// then the FISH KEPT (maxHearts fish, the kept ones full and the lost ones as icon-fish-empty; hidden
// when the win added no leaderboard points). There is no streak chip any more (the 2c "Perfect ×N" went
// with the cross-level streak).
// UI batch (2026-10-13, the user: "remove fishes 'Your total: X' … +1/2/3 is surplus … remove access to home
// screen, let the default button be the next level … add praising and encouraging messages/statistics"): the
// kept-fish row shows the fish only (no "+2", no "Your total: 14" / "This week: 42", no "+3 waiting"); there is no
// Home button (the daily's primary is the next level too; the tutorial replay keeps its "Home" primary); one or two
// lines of praise or an approximate statistic (VictoryProps.lines, picked by app/victory-lines.ts, text in
// ./victory-line-text.ts) sit under the subtitle, in the daily under its time.
// With `bannerReserved` the root gets data-banner (phase2b §3.2) and the column keeps the
// ads.banner.reservePx band free under the buttons.
// Esc and Enter: Enter presses the focused primary (autofocus); Esc is ignored (a choice is needed).
// Reduced motion: a crossfade of fx.screenReducedMs (WAAPI), static rays, no progress-bar fill.
// update() re-renders in place (2026-10-12: the session sends a late ranking answer's kept-fish row this way);
// the opening's bar fill and streak fill run on through it (its refit's measuring leaves the fill's transition on:
// overlay-chunk.css).
// Lazy overlay chunk.
//
// Review fixes: a dark full-screen overlay like the fail card (PAR-3, the original's "dark full-screen
// overlays for win and fail"): light text on --stage, the orange "Level N". The buttons never sit under
// the banner band (UX-1, I18N-LAYOUT-1): the actions are sticky at the bottom of the scrolling overlay
// (clear of the reserve plus buttonClearancePx), and fit() compacts the hero in steps (data-fit 1–3)
// while the content is taller than the screen, so on short phones nothing needs a scroll. The event
// bar is named by its "3 / 21 solved" line (A11Y-NAME-1); static labels follow the language.
//
// Phase 2e (G3, spec §5.3, §6.1): on the day's first counted win a streak row "Streak: day 4 of 7" with the 7
// steps (today's step fills in; no animation with reduced motion) and, on the cycle's last day, "Streak
// reward: +2 hints and +2 kitties" (already granted and saved at t = 0); a "Daily reward: +1 hint" line when
// daily.reward is not zero (VictoryProps.dailyReward). Both are plain text in the dialog's description.
//
// Classes: .overlay[data-overlay=victory] > .victory[data-variant][data-banner]
//          > .victory__col(.victory__praise .victory__stage(.victory__rays .victory__art)
//            .victory__sub .victory__lines(.victory__line[data-line]) .victory__daily(.victory__time [.victory__lines]
//            .victory__stats .victory__next) .victory__event(.victory__bar .victory__milestone)
//            .victory__daily-reward .victory__streak[data-day](.victory__streak-text .streak-steps .victory__streak-reward)
//            .victory__reward(.victory__points(.victory__points-icon .victory__points-text)
//              .victory__kept[data-count](.victory__fishes > .victory__fish[data-kept]))
//            .victory__actions(.victory__primary))
import { cfg } from '../../app/config';
import type { Reward } from '../../game/events';
import { formatClock, formatDuration, formatNumber, formatShortDate, joinList, praise, t, tn, translate, type I18nKey } from '../../i18n';
import { illustration } from '../art/illustrations';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { renderStreakSteps, streakStepKinds } from '../hud/streak-strip';
import { createLocaleText } from '../locale-text';
import { createDelay, createOverlayShell, createTicker, makeButton, nextId, setButtonLabel, setGated, setTextKeepTogether } from './overlay-base';
import { victoryLineText, type VictoryLine } from './victory-line-text';

/**
 * level: "Level {L+1}"; tutorial (first run): "You're ready!" + "Play Level 2"; tutorial_replay:
 * no fish, "Home"; daily: time, mistakes, hints, countdown, "Level {N}" (UI batch: the next level, was
 * "Done"); event: progress + "Puzzle {i+1}" or "Back to event" after the last (§2.5 Variants).
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
  /** The primary button's level ("Level 38"); 2 for the first-run tutorial; the next level after a daily; null otherwise. */
  readonly nextLevel: number | null;
  /**
   * Phase 2c.1 §10.3: the level's points total (GameState.levelPoints at WON), counted or not:
   * "7,296 points". null or 0 hides the row (the tutorial, a mode outside levelPoints.modes).
   */
  readonly pointsEarned: number | null;
  /**
   * Phase 2c §2.7: the fish-kept row (`fish` of `max` lives kept; UI batch: the fish alone, no "+N" and no total);
   * null when the win added no leaderboard points (tutorial, not counted, mode excluded).
   */
  readonly kept: { readonly fish: number; readonly max: number } | null;
  readonly daily: VictoryDailyView | null;
  readonly event: VictoryEventView | null;
  /** fx.winButtonDelayMs (600): the primary button turns active this long after open. */
  readonly buttonDelayMs: number;
  readonly reducedMotion: boolean;
  /** phase2b §3.2: reserve ads.banner.reservePx (+ safe bottom) under the buttons. */
  readonly bannerReserved: boolean;
  /** Clock for the daily countdown. */
  now(): number;
  // ── Phase 2e (spec §5.3, §6.1; optional until I-3) ──
  /**
   * The streak row, on the day's first counted win only: day `day` of `total` (today's step fills in) and the
   * cycle reward when this win paid it (already granted). Absent or null: no row (the tutorial, a second win
   * the same day, a restored board, the daily result reopened from Home). null: no row. Required since I-3.
   */
  readonly streak: { readonly day: number; readonly total: number; readonly reward: Reward | null } | null;
  /** "Daily reward: +1 hint" (daily.reward, already granted); shown only when not null and not zero. Required since I-3. */
  readonly dailyReward: Reward | null;
  /**
   * UI batch (victory): the praise and statistic lines under the subtitle (≤ config victory.maxLines, already
   * picked); absent or empty: none.
   */
  readonly lines?: readonly VictoryLine[];
  /** The orange primary: next level (also after a daily) / Play Level 2 / Home (replay) / next puzzle or back to event. */
  onPrimary(): void;
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
      // UI batch (victory): the next level, as after a level ("Done" and Home are gone).
      return t('victory.next', { level: p.nextLevel ?? 2 });
    case 'event':
      return p.event && !p.event.last ? t('event.play', { index: p.event.index + 2 }) : t('event.back');
  }
}

/** Countdown refresh period (minute resolution text). */
const REFRESH_MS = 1000;
/**
 * Compaction steps of fit() (overlay-chunk.css .victory[data-fit]). Step 4 (audit B1): the daily victory on a
 * streak's day 7 at 320 × 568 (the streak row and its reward line on top of the daily's lines) still ran under
 * the sticky Done; step 4 drops the hero art (decorative, aria-hidden) and tightens the streak row. Step 5 (UI batch,
 * victory: that daily with the banner band and two praise lines) keeps the first praise line only.
 */
export const FIT_LEVELS = 5;
/** UI batch (victory): from this step only the first praise line shows (and is described). */
const ONE_LINE_STEP = 5;

/**
 * The compaction step that lets the content fit: the first of 0…FIT_LEVELS whose measured overflow
 * (`overflowAt(level)`, content height minus the screen) is ≤ 0, else the last step.
 */
export function fitLevel(overflowAt: (level: number) => number): number {
  for (let level = 0; level < FIT_LEVELS; level++) if (overflowAt(level) <= 1) return level;
  return FIT_LEVELS;
}

/** The kept-fish row's data, clamped; null when the row is hidden. */
function keptRow(k: VictoryProps['kept'] | undefined): NonNullable<VictoryProps['kept']> | null {
  if (!k) return null;
  const max = Math.max(1, Math.min(12, Math.floor(k.max)));
  return { max, fish: Math.max(0, Math.min(max, Math.floor(k.fish))) };
}

export function createVictoryScreen(): OverlayView<VictoryProps> {
  let props: VictoryProps | null = null;
  const shell = createOverlayShell({ id: 'victory', scrim: 'clear', panel: 'dialog' });
  const root = shell.panel;
  root.className = 'victory';
  const delay = createDelay();
  const ticker = createTicker();
  const barDelay = createDelay();
  /** The opening's event-bar fill is still waiting for barDelay (2026-10-12: a re-render leaves the bar alone then). */
  let barPending = false;

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

  // UI batch (victory): the praise and statistic lines. One <p> each (created as needed, reused); the box sits under
  // the subtitle, and in the daily under its time (the statistic is about that time).
  const linesBox = h('div', { class: 'victory__lines' });
  const lineEls: HTMLElement[] = [];
  const renderLines = (ls: readonly VictoryLine[]): string[] => {
    while (lineEls.length < ls.length) {
      const el = h('p', { class: 'victory__line', id: nextId('victory-line') });
      lineEls.push(el);
      linesBox.append(el);
    }
    const shown: string[] = [];
    lineEls.forEach((el, i) => {
      const l = ls[i];
      el.hidden = !l;
      if (l) {
        el.dataset.line = l.id;
        setText(el, victoryLineText(l));
        shown.push(el.id);
      } else delete el.dataset.line;
    });
    linesBox.hidden = shown.length === 0;
    return shown;
  };

  // Reward block (Phase 2c.1 §10.3), row 1: the level's points total ("[sparkle] 7,296 points"); its
  // accessible name is the visible text.
  const pointsText = h('span', { class: 'victory__points-text num' });
  const pointsId = nextId('victory-points');
  const pointsRow = h('div', { class: 'victory__points', id: pointsId }, icon('icon-points', { class: 'victory__points-icon' }), pointsText);
  // Row 2: the fish kept ("[fish][fish][empty]"; UI batch: no "+2" and no total, the user's "surplus").
  const fishes = h('span', { class: 'victory__fishes', 'aria-hidden': 'true' });
  let fishFor = '';
  const keptId = nextId('victory-kept');
  const kept = h('div', { class: 'victory__kept', role: 'img', id: keptId }, fishes);
  const reward = h('div', { class: 'victory__reward' }, pointsRow, kept);

  // Event: progress bar + milestone line. The bar's name is its visible "3 / 21 solved" line (A11Y-NAME-1).
  const eventLabelId = nextId('victory-event-label');
  const eventLabel = h('p', { class: 'victory__event-label', id: eventLabelId });
  const barFill = h('span', { class: 'victory__bar-fill' });
  const bar = h('div', { class: 'victory__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-labelledby': eventLabelId }, barFill);
  const milestone = h('p', { class: 'victory__milestone' });
  const eventId = nextId('victory-event');
  const event = h('div', { class: 'victory__event', id: eventId }, eventLabel, bar, milestone);

  // Phase 2e (§6.1, §5.3): the daily reward line and the streak row.
  const dailyRewardId = nextId('victory-daily-reward');
  const dailyReward = h('p', { class: 'victory__daily-reward', id: dailyRewardId, hidden: true });
  const streakId = nextId('victory-streak');
  const streakText = h('p', { class: 'victory__streak-text' });
  const streakSteps = h('span', { class: 'streak-steps', 'aria-hidden': 'true' });
  const streakReward = h('p', { class: 'victory__streak-reward' });
  const streak = h('div', { class: 'victory__streak', id: streakId, hidden: true }, streakText, streakSteps, streakReward);

  const primary = makeButton({
    variant: 'primary',
    label: '',
    block: true,
    autofocus: true,
    className: 'btn--lg victory__primary',
    onPress: () => props?.onPrimary(),
  });

  const col = h(
    'div',
    { class: 'victory__col' },
    title,
    h('div', { class: 'victory__stage' }, rays, art),
    sub,
    linesBox,
    daily,
    // Phase 2c §2.7: the daily's and the event's own lines sit above the reward block.
    event,
    dailyReward,
    streak,
    reward,
    h('div', { class: 'victory__actions' }, primary),
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
  /** data-fit = the step (1–5); data-tight marks steps 2 to 5 (overlay-chunk.css). */
  const setFit = (lv: number): void => {
    if (lv === 0) delete root.dataset.fit;
    else root.dataset.fit = String(lv);
    root.toggleAttribute('data-tight', lv >= 2);
  };
  /**
   * The dialog's description (§7 screen reader): the result line, the praise lines (UI batch: only the first one at
   * the one-line fit step, as shown), then the rest; only what is shown, in the order shown.
   */
  let describedLines: readonly string[] = [];
  let describedRest: readonly string[] = [];
  const applyDescribed = (): void => {
    const one = Number(root.dataset.fit ?? '0') >= ONE_LINE_STEP;
    root.setAttribute('aria-describedby', [shell.descId, ...(one ? describedLines.slice(0, 1) : describedLines), ...describedRest].join(' '));
  };
  const fit = (): void => {
    if (!shell.isOpen() || !scroller.isConnected) return;
    // Measured with transitions off (data-measuring): with reduced motion every property transitions for 150 ms
    // (fx.css), so a step measured at once still had the last step's sizes and the fit ran to its last step.
    root.setAttribute('data-measuring', '');
    try {
      setFit(
        fitLevel((lv) => {
          setFit(lv);
          return scroller.scrollHeight - scroller.clientHeight;
        }),
      );
    } finally {
      root.removeAttribute('data-measuring');
    }
    applyDescribed();
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

    // Row 1 (§10.3): the level's total, counted or not; never on a tutorial.
    const pts = tutorial || p.pointsEarned === null || !(p.pointsEarned > 0) ? null : Math.floor(p.pointsEarned);
    pointsRow.hidden = pts === null;
    if (pts !== null) setText(pointsText, tn('points.count', pts, { count: formatNumber(pts) }));
    // Row 2 (§2.7): hidden when the win added no leaderboard points; never on a tutorial.
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
      // The row's name: "2 of 3 fish left" (the lives pill's own words).
      kept.setAttribute('aria-label', t('game.hearts.a11y', { hearts: formatNumber(k.fish), max: formatNumber(k.max) }));
    } else {
      delete kept.dataset.count;
    }
    reward.hidden = kept.hidden && pointsRow.hidden;

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
        barPending = true;
        barDelay.start(cfg.fx.overlayFadeMs, () => {
          barPending = false;
          root.classList.remove('victory--bar-static');
          setBar(e.solvedAfter, e.total);
        });
      } else if (p.reducedMotion || (!opening && !barPending)) {
        // 2026-10-12: a re-render (a late ladder answer, session.ts) never cuts the opening's bar fill short.
        setBar(e.solvedAfter, e.total);
      }
    }

    // Phase 2e: the daily reward line and the streak row (never on a tutorial).
    const dr = tutorial ? null : (p.dailyReward ?? null);
    const drOn = dr !== null && ((dr.hints ?? 0) > 0 || (dr.kitties ?? 0) > 0);
    dailyReward.hidden = !drOn;
    if (drOn) setText(dailyReward, t('victory.dailyReward', { reward: rewardText(dr) }));
    const st = tutorial || !p.streak || typeof p.streak !== 'object' ? null : p.streak;
    streak.hidden = st === null;
    if (st) {
      const total = Math.max(1, Math.floor(st.total));
      const day = Math.max(1, Math.min(total, Math.floor(st.day)));
      streak.dataset.day = String(day);
      setText(streakText, t('victory.streakDay', { day: formatNumber(day), total: formatNumber(total) }));
      const key = `${day}/${total}`;
      if (streakSteps.dataset.key !== key) {
        streakSteps.dataset.key = key;
        renderStreakSteps(streakSteps, streakStepKinds(total, day, day, 0));
      }
      // Today's step fills in once on open (CSS; none with reduced motion). 2026-10-12: set on open only, so a
      // re-render during the fill (a late ladder answer, session.ts) does not cut it short.
      if (opening) streak.toggleAttribute('data-fill', !p.reducedMotion);
      const sr = st.reward;
      streakReward.hidden = !(sr && ((sr.hints ?? 0) > 0 || (sr.kitties ?? 0) > 0));
      if (sr && !streakReward.hidden) setText(streakReward, t('victory.streakReward', { reward: rewardText(sr) }));
      // Audit B6: the reward is paid → the last step shows the open chest (as the Home strip does).
      streak.toggleAttribute('data-reward', !streakReward.hidden);
    } else {
      delete streak.dataset.day;
      streak.removeAttribute('data-reward');
    }

    // UI batch (victory): the lines, under the subtitle, or in the daily under its time (moved only when that changes).
    const lineIds = renderLines(tutorial ? [] : (p.lines ?? []));
    if (p.variant === 'daily') {
      if (linesBox.parentNode !== daily) daily.insertBefore(linesBox, dailyStats);
    } else if (linesBox.parentNode !== col) col.insertBefore(linesBox, daily);

    // The dialog's description (§7 screen reader): the result line, the praise lines, the level's points
    // ("7,296 points"), the fish kept ("2 of 3 fish left"), the event progress and milestone; only what is
    // shown, in the order shown (applyDescribed; fit() applies it again at its step).
    const rest: string[] = [];
    if (!pointsRow.hidden) rest.push(pointsId);
    if (!kept.hidden) rest.push(keptId);
    if (!event.hidden) rest.push(eventId);
    if (!dailyReward.hidden) rest.push(dailyRewardId);
    if (!streak.hidden) rest.push(streakId);
    describedLines = lineIds;
    describedRest = rest;
    applyDescribed();

    setButtonLabel(primary, primaryLabel(p));
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
      barPending = false;
      ticker.stop();
      stopFit();
      win()?.removeEventListener('resize', refit);
      shell.hide();
    },
    dismiss: () => false,
    destroy() {
      delay.cancel();
      barDelay.cancel();
      barPending = false;
      ticker.stop();
      stopFit();
      win()?.removeEventListener('resize', refit);
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
