// Owner: B (Phase 2b); G2 (Phase 2c: the period pill replaces the fish pill); G3 (Phase 2d: the settings dot;
// Phase 2e: the ranking chip and the streak strip)
// S1 Home (02 §5): top bar (Trophy*, Gear), wordmark + mascot, primary level button, daily card,
// stock readout. Phase 3 hook: extra cards array (02 §22).
// Phase 2b (B): the event card above the Level
// button (§4.4: rendered in the extra-cards area as its event variant), data-banner (§3.2).
// Phase 2c (G2, fish-lives-spec §2.8): the top bar's lead slot shows the PERIOD PILL (icon-trophy and
// this period's leaderboard points, "42 fish this week"), not a button; Home has no shop entry.
// The event card's art is A's eventArt(def, 'card'), which lives in the lazy `events` chunk: the app
// passes it in (HomeEventCardView.art) once that chunk has loaded; the card renders without it until then.
//
// Phase 2e (G3, spec §2.5, §5.3): with HomeView.ladder the lead slot holds the ranking CHIP (a button that
// opens the ranking sheet, hud/ladder-chip.ts) instead of the period pill; null keeps the period pill.
// HomeView.streak shows the streak strip (hud/streak-strip.ts) under the Play button, above the daily card; null
// hides it (first run, dayStreak.showOnHome off).
// Phase 2e I-4 (lead, spec §7.9): the chip and the strip come with the lazy overlay chunk (./home-extras.ts); until
// it lands Home shows the period pill and keeps the strip's row (.streak-strip--pending, invisible), then renders
// both in place.
//
// Home layout (2026-10-11, measured from the user's iPhone screenshot of the original's Home): the profile picture at
// the top left (the top bar's lead slot, after the FB safe zone), the streak pill at the top centre, the gear at the top
// right; the wordmark under the bar; the ranking button floating at the left edge halfway down the hero; the Play pill
// and the daily pill (with its status tab hanging below) low on the screen, about 70 % of the width. The streak strip
// left Home: the pill carries the run, and a tap tells the strip's sentence (HomeCallbacks.onStreak).
// Classes: .screen.screen--home[data-banner][data-streak?] > .home__body (+ .home__bg, the scrolling board, last) > .home__hero(.home__wordmark .home__tagline .home__mascot)
//          .home__actions(.home__cards > .event-card[data-state] .home__play .badge.badge--hard
//          .daily-card[data-state] .home-card); the top bar's lead slot
//          holds button.home__profile; its centre slot .home__streak > button.streak-pill | .streak-pill--pending;
//          .home__hero > .home__rank > .period-pill | button.ladder-chip; .daily-card > .daily-card__icon
//          .daily-card__title .daily-card__tab(.daily-card__sub)
// Review fixes: the hero never overlaps the top bar or the cards below it (UX-2, I18N-LAYOUT-2): it is
// centred with auto margins (overflow can only go down), and fitHero() shrinks the mascot (then
// drops the tagline) until the hero fits the space the event card, the banner reserve and the
// localized text leave. The static texts follow the language (A11Y-I18N-1).
import { cfg, type PeriodKind } from '../../app/config';
import type { EventDef } from '../../game/events';
import type { DailyCardState } from '../../game/progression';
import { formatClock, formatDuration, formatShortDate, onLocaleChanged, t, translate } from '../../i18n';
import { homeBoardUrl } from '../art/home-board';
import { mascotIllustration } from '../art/mascot';
import { icon, type AvatarSymbol } from '../art/sprite';
import { clear, h, setText, type View } from '../dom';
import type { LadderChipView, createLadderChip } from '../hud/ladder-chip';
import { createPeriodPill } from '../hud/pills';
import type { StreakStripView, createStreakPill } from '../hud/streak-strip';
import { homeExtras, whenHomeExtras } from './home-extras';
import { createTopBar, splitTitle, type TopBarProps } from '../hud/top-bar';
import { createLocaleText } from '../locale-text';
import { formatCountdown } from '../time-text';

/** The smallest Home mascot (CSS px) before the tagline, and then the mascot, give way (fitHero). */
export const MASCOT_MIN_PX = 64;

/**
 * The mascot size that makes the hero fit: `size` shrunk by the overflow below the hero's bottom,
 * or null when even MASCOT_MIN_PX does not fit (the caller drops the tagline, then the mascot).
 */
export function fittedMascot(size: number, overflowPx: number): number | null {
  if (overflowPx <= 0.5) return size;
  const next = Math.floor(size - overflowPx);
  return next >= MASCOT_MIN_PX ? next : null;
}

export interface DailyCardView {
  readonly state: DailyCardState;
  /** Today, YYYY-MM-DD (formatted with i18n formatShortDate). */
  readonly dateKey: string;
  /** Board size from the weekday table. */
  readonly n: number;
  /** Solve time when state === 'solved'. */
  readonly solvedMs: number | null;
  /** daily.unlockAfterLevel, for "Unlocks after level 20". */
  readonly unlockLevel: number;
  /** When today's puzzle ends (the next day start, epoch ms): the tab counts down to it until it is solved. */
  readonly endsAt?: number;
}

/**
 * The Home event card (phase2b §4.4): 72 px, A's eventArt(def, 'card') behind it, the title and a
 * status line: active "Ends in 3 d 4 h · 7 / 21 solved" (+ "Ends soon!" in the last
 * events.cardEndsSoonHours), teaser "Starts in 2 d" (not tappable), locked "Opens after level 10",
 * done "All solved!". A 4 px --accent progress bar. A button labelled with its status line.
 */
export interface HomeEventCardView {
  readonly def: EventDef;
  readonly state: 'active' | 'teaser' | 'locked' | 'done';
  /** Device clock now, and the event's start and end (epoch ms). */
  readonly now: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly solved: number;
  readonly total: number;
  /** def.unlockAfterLevel, for "Opens after level 10". */
  readonly unlockLevel: number;
  /** In the last events.cardEndsSoonHours. */
  readonly endsSoon: boolean;
  /**
   * A's eventArt(def, 'card') from the lazy `events` chunk (pattern + the 48 px pose with the
   * accessory), passed by the app once the chunk has loaded. Optional (phase2b B addition); the card
   * shows without art until it is there. Called again only when the event changes.
   */
  readonly art?: ((def: EventDef, kind: 'card') => HTMLElement) | null;
}

/** Phase 3 entry points (events, calendar…). Empty in Phase 2. */
export interface HomeCardView {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
}

export interface HomeView {
  /** Next level to play. */
  readonly level: number;
  readonly hard: boolean;
  /** inProgress.level holds a board → "Continue · Level L". */
  readonly continueLevel: boolean;
  readonly daily: DailyCardView;
  readonly hints: number;
  readonly kitties: number;
  readonly fbSafeZone: boolean;
  readonly extraCards: readonly HomeCardView[];
  /** Phase 2c §2.8: this period's leaderboard points for the Home period pill (periodTotal(save, now); 0 after a rollover). */
  readonly period: { readonly kind: PeriodKind; readonly total: number };
  /** The event card, or null when no event is active or teased (phase2b §4.4). */
  readonly event: HomeEventCardView | null;
  /** phase2b §3.2: the banner band is reserved (root data-banner). */
  readonly bannerReserved: boolean;
  /** Phase 2d §1.15: the gear's red dot (save.ext.settingsSeen < cfg.settingsDot.version). */
  readonly settingsDot: boolean;
  // ── Phase 2e (spec §2.5, §5.3; required since I-3) ──
  /**
   * The ranking chip (the floating .home__rank button; replaces the period pill; its `records` state carries the pill's
   * content). null: the 2c period pill (not a button).
   */
  readonly ladder: LadderChipView | null;
  /** The streak pill at the top centre (it was the strip under the Play button); null: hidden. */
  readonly streak: StreakStripView | null;
  /** The profile picture (save.ladder.me's avatar); absent or null: our default cat head. */
  readonly avatarId?: number | null;
}

export interface HomeCallbacks {
  onPlay(): void;
  /** Any daily card tap; the app shows the "locked" toast, opens O7 when solved, or starts the daily. */
  onDaily(): void;
  onSettings(): void;
  onCard(id: string): void;
  /** Event card tap (active, locked or done; a teaser is not tappable), phase2b §4.4. */
  onEvent(): void;
  /** Phase 2e §2.5: the ranking chip (opens the ranking sheet, overlay `ladder`). Required since I-3. */
  onLadder(): void;
  /** 2026-10-12: the chip's visible countdown reached 00:00:00 (the app refreshes the chip; once per end time). */
  onLadderEnded?(): void;
  /** The profile picture at the top left (the name sheet when there is a ranking name, else Settings). */
  onProfile?(): void;
  /** The streak pill: the strip's sentence ("Day 3 of 7 · Today counts!") to show as a toast. */
  onStreak?(text: string): void;
}

/** "3 d 4 h" for a day or more, else "7 h 48 min" / "12 min" (event countdowns, phase2b §4.4). */
export function formatDaysHours(ms: number): string {
  const left = Math.max(0, ms);
  const d = Math.floor(left / 86_400_000);
  if (d < 1) return formatDuration(left);
  return t('time.daysHours', { d, h: Math.floor((left % 86_400_000) / 3_600_000) });
}

/** The event card's status line (phase2b §4.4): "Ends in 3 d 4 h · 7 / 21 solved", "Starts in 2 d", … */
export function eventStatusText(e: HomeEventCardView): string {
  switch (e.state) {
    case 'teaser':
      return t('event.card.startsIn', { time: formatDaysHours(e.startsAt - e.now) });
    case 'locked':
      return t('event.card.locked', { level: e.unlockLevel });
    case 'done':
      return t('event.card.done');
    case 'active': {
      const ends = e.endsSoon ? t('event.card.endsSoon') : t('event.card.endsIn', { time: formatDaysHours(e.endsAt - e.now) });
      return `${ends} · ${t('event.card.progress', { solved: e.solved, total: e.total })}`;
    }
  }
}

/** The daily tab's countdown: "07:48:12" (2026-10-12: it lives in ../time-text, shared with the ranking chip). */
export { formatCountdown };

/** The daily card's status line ("Not played yet", "Solved 4:12", "Unlocks after level 20"). */
export function dailyStatusText(d: DailyCardView): string {
  switch (d.state) {
    case 'locked':
      return t('home.daily.locked', { level: d.unlockLevel });
    case 'not_played':
      return t('home.daily.notPlayed');
    case 'in_progress':
      return t('home.daily.inProgress');
    case 'solved':
      return t('home.daily.solved', { time: formatClock(d.solvedMs ?? 0) });
  }
}

export function createHomeScreen(view: HomeView, cb: HomeCallbacks): View<HomeView> {
  const topBarProps = (v: HomeView): TopBarProps => ({
    title: null,
    hard: false,
    showHome: false,
    showSettings: true,
    fbSafeZone: v.fbSafeZone,
    // Phase 2d §1.15, §2.2: the red dot on the gear (something in Settings not seen yet).
    settingsDot: v.settingsDot,
  });
  // Phase 2c §2.8: the period pill (not a button) in the ranking button's place until the chip arrives.
  const periodOf = (v: HomeView): { readonly kind: PeriodKind; readonly total: number } => v.period ?? { kind: cfg.period.kind, total: 0 };
  const periodPill = createPeriodPill(periodOf(view));
  const L = createLocaleText();
  // Phase 2e §2.5: the ranking chip takes the pill's place when the app passes HomeView.ladder.
  let chip: ReturnType<typeof createLadderChip> | null = null;
  // Phase 2e I-4: the factories arrive with the overlay chunk; one re-render when they do.
  let offExtras: (() => void) | null = null;
  const awaitExtras = (): void => {
    offExtras ??= whenHomeExtras(() => {
      offExtras = null;
      render(last);
    });
  };
  // The ranking button floats at the left edge, halfway down the hero (the original's place for its leaderboard).
  const lead = h('div', { class: 'home__rank' }, periodPill.el);
  // The profile picture: our cat head under the avatar, which draws once the ranking art is mounted.
  const avatarUse = h('span', { class: 'home__avatar', 'aria-hidden': 'true' });
  let avatarShown: number | null = null;
  const profile = L.attr(
    h(
      'button',
      { type: 'button', class: 'home__profile', on: { click: () => (cb.onProfile ? cb.onProfile() : cb.onSettings()) } },
      icon('cat-head-flat', { class: 'home__avatar-base' }),
      avatarUse,
    ),
    'aria-label',
    () => t('home.profile'),
  );
  const streakSlot = h('div', { class: 'home__streak' });
  const topBar = createTopBar(
    topBarProps(view),
    { onHome: () => undefined, onSettings: () => cb.onSettings() },
    { lead: profile, center: streakSlot },
  );

  // phase2b §4.4 event card (above the Level button): art, title, status line, 4 px progress bar.
  const eventArtHost = h('span', { class: 'event-card__art', 'aria-hidden': 'true' });
  const eventTitle = h('span', { class: 'event-card__title' });
  const eventStatus = h('span', { class: 'event-card__sub' });
  const eventFill = h('span', { class: 'event-card__fill' });
  const eventCard = h(
    'button',
    {
      type: 'button',
      class: 'event-card',
      hidden: true,
      on: {
        click: () => {
          if (eventCard.getAttribute('aria-disabled') !== 'true') cb.onEvent();
        },
      },
    },
    eventArtHost,
    h('span', { class: 'event-card__text' }, eventTitle, eventStatus),
    h('span', { class: 'event-card__bar', 'aria-hidden': 'true' }, eventFill),
    icon('icon-chevron', { class: 'event-card__chev' }),
  );
  let artFor: { id: string; fn: NonNullable<HomeEventCardView['art']> } | null = null;

  // Primary level button.
  const playLabel = h('span', { class: 'btn__label' });
  const hardBadge = L.text(h('span', { class: 'badge badge--hard' }), () => t('common.hard'));
  const play = h(
    'button',
    // A11Y-FOCUS-1: the router lands focus here after a screen change (not the wordmark or the first chip).
    { type: 'button', class: 'btn btn--primary btn--block btn--lg home__play', 'data-autofocus': '', on: { click: () => cb.onPlay() } },
    playLabel,
    hardBadge,
  );

  // Daily card.
  const dailyIcon = h('span', { class: 'daily-card__icon', 'aria-hidden': 'true' });
  const dailyTitle = h('span', { class: 'daily-card__title' });
  const dailySub = h('span', { class: 'daily-card__sub num' });
  const dailyCheck = h('span', { class: 'daily-card__check', 'aria-hidden': 'true', hidden: true });
  // The original's daily pill: icon, title, and a tab hanging below with the status (size, solve time, lock).
  const daily = h(
    'button',
    { type: 'button', class: 'daily-card', on: { click: () => cb.onDaily() } },
    dailyIcon,
    dailyTitle,
    h('span', { class: 'daily-card__tab' }, dailyCheck, dailySub),
  );

  const cards = h('div', { class: 'home__cards' });
  // The streak pill (created on the first view that carries one).
  let strip: ReturnType<typeof createStreakPill> | null = null;
  /** I-4: the pill's box while its factory is on its way (same box, invisible, hidden from assistive tech). */
  let pendingStrip: HTMLElement | null = null;

  const mascot = L.attr(mascotIllustration('home', { label: t('a11y.mascot') }), 'aria-label', () => t('a11y.mascot'));
  const mascotBox = h('div', { class: 'home__mascot' }, mascot);
  const tagline = L.text(h('p', { class: 'home__tagline' }), () => t('app.tagline'));
  const hero = h('div', { class: 'home__hero' }, L.text(h('h1', { class: 'home__wordmark' }), () => t('app.name')), tagline, mascotBox, lead);
  // Home redesign: a new random board on every Home visit (art/home-board.ts), drawn here, no image file.
  const bg = h('div', { class: 'home__bg', 'aria-hidden': 'true' });
  bg.style.backgroundImage = homeBoardUrl(Math.floor(Math.random() * 0x7fffffff));
  const el = h(
    'div',
    { class: 'screen screen--home' },
    topBar.el,
    h(
      'main',
      { class: 'home__body' },
      hero,
      h('div', { class: 'home__actions' }, eventCard, play, daily, cards),
    ),
    // Home redesign: the scrolling board behind everything (screens.css .home__bg); last, so the top bar stays first.
    bg,
  );

  // ── fitHero (UX-2, I18N-LAYOUT-2) ──
  /**
   * Measures the hero after layout and shrinks the mascot by what overflows below the hero (the
   * cards start there), then drops the tagline, then the mascot. Reads, then writes once per step;
   * runs on the next frame after a render and on resize. A no-op without layout (tests).
   */
  const fitHero = (): void => {
    if (!el.isConnected) return;
    mascot.style.removeProperty('width');
    mascot.style.removeProperty('height');
    el.removeAttribute('data-tight');
    const heroBottom = (): number => hero.getBoundingClientRect().bottom;
    const over = (): number => mascotBox.getBoundingClientRect().bottom - heroBottom();
    const natural = mascot.getBoundingClientRect().height;
    if (natural <= 0) return;
    let size = fittedMascot(natural, over());
    if (size === null) {
      el.setAttribute('data-tight', '1'); // no tagline (screens.css)
      size = fittedMascot(natural, over());
    }
    if (size === null) {
      el.setAttribute('data-tight', '2'); // no mascot either: the wordmark alone
      return;
    }
    if (size < natural - 0.5) {
      mascot.style.width = `${size}px`;
      mascot.style.height = `${size}px`;
    }
  };
  let fitRaf = 0;
  const win = (): Window | null => el.ownerDocument.defaultView;
  const scheduleFit = (): void => {
    const w = win();
    if (!w || typeof w.requestAnimationFrame !== 'function') return;
    w.cancelAnimationFrame(fitRaf);
    fitRaf = w.requestAnimationFrame(() => {
      fitRaf = 0;
      fitHero();
    });
  };
  const w0 = win();
  w0?.addEventListener('resize', scheduleFit);

  let lastCards: readonly HomeCardView[] | null = null;

  /** Phase 2e §2.5: the chip when the app passes one, else the period pill. */
  const renderLead = (v: LadderChipView | null): void => {
    const x = homeExtras();
    if (!v || (!chip && !x)) {
      periodPill.el.hidden = false;
      if (chip) chip.el.hidden = true; // a hidden chip stops its countdown tick (the next update starts it again)
      if (v) awaitExtras();
      return;
    }
    if (!chip) {
      chip = (x as NonNullable<typeof x>).createLadderChip(v, { onPress: () => cb.onLadder(), onEnded: () => cb.onLadderEnded?.() });
      lead.appendChild(chip.el);
    } else chip.update(v);
    chip.el.hidden = false;
    periodPill.el.hidden = true;
  };

  /** The streak pill in the top bar's centre slot. */
  const renderStreak = (v: StreakStripView | null): void => {
    el.toggleAttribute('data-streak', v !== null);
    if (!v) {
      if (strip) strip.el.hidden = true;
      if (pendingStrip) pendingStrip.hidden = true;
      return;
    }
    const x = homeExtras();
    if (!strip && !x) {
      pendingStrip ??= h('div', { class: 'streak-pill streak-pill--pending', 'aria-hidden': 'true' });
      if (!pendingStrip.isConnected) streakSlot.appendChild(pendingStrip);
      pendingStrip.hidden = false;
      awaitExtras();
      return;
    }
    if (!strip) {
      strip = (x as NonNullable<typeof x>).createStreakPill(v, { onPress: (text) => cb.onStreak?.(text) });
      streakSlot.appendChild(strip.el);
      pendingStrip?.remove();
      pendingStrip = null;
    } else strip.update(v);
    strip.el.hidden = false;
  };

  const renderAvatar = (id: number | null): void => {
    if (id === avatarShown) return;
    avatarShown = id;
    clear(avatarUse);
    if (id !== null) avatarUse.appendChild(icon(`avatar-${id}` as AvatarSymbol));
  };
  let iconState: 'lock' | 'cal' | null = null;

  const renderEvent = (e: HomeEventCardView | null): void => {
    eventCard.hidden = e === null;
    // Short screens make room for the card (screens.css: a smaller mascot, no tagline).
    el.toggleAttribute('data-event', e !== null);
    if (!e) return;
    const name = translate(e.def.nameKey);
    const status = eventStatusText(e);
    eventCard.dataset.state = e.state;
    eventCard.toggleAttribute('data-ends-soon', e.state === 'active' && e.endsSoon);
    // A teaser is not tappable (§4.4): aria-disabled keeps it readable without a dead button press.
    if (e.state === 'teaser') eventCard.setAttribute('aria-disabled', 'true');
    else eventCard.removeAttribute('aria-disabled');
    setText(eventTitle, name);
    setText(eventStatus, status);
    // The card is a button labelled with its status line (§7).
    eventCard.setAttribute('aria-label', `${name}. ${status}`);
    const frac = e.total > 0 ? Math.min(1, Math.max(0, e.solved / e.total)) : 0;
    // A width (not a scale) so the fill starts at the inline start in RTL too (§6.5).
    eventFill.style.width = `${(frac * 100).toFixed(2)}%`;
    const fn = e.art ?? null;
    if (!fn) {
      if (artFor) clear(eventArtHost);
      artFor = null;
    } else if (!artFor || artFor.id !== e.def.id || artFor.fn !== fn) {
      artFor = { id: e.def.id, fn };
      clear(eventArtHost);
      try {
        eventArtHost.appendChild(fn(e.def, 'card'));
      } catch {
        // The art is decorative: the card still works without it.
      }
    }
  };

  // The daily tab: a once-a-second countdown to the next puzzle while today's is not solved.
  let tick = 0;
  let tabEndsAt: number | null = null;
  const stopTick = (): void => {
    if (tick) win()?.clearInterval(tick);
    tick = 0;
  };
  const showCountdown = (): void => {
    if (tabEndsAt === null) return;
    const left = tabEndsAt - Date.now();
    setText(dailySub, formatCountdown(left));
    if (left <= 0) stopTick();
  };
  const renderTab = (d: DailyCardView, status: string): void => {
    dailyCheck.hidden = d.state !== 'solved';
    if (d.state === 'locked' || d.state === 'solved' || d.endsAt === undefined) {
      stopTick();
      tabEndsAt = null;
      setText(dailySub, d.state === 'solved' ? formatClock(d.solvedMs ?? 0) : d.state === 'locked' ? status : '');
      return;
    }
    tabEndsAt = d.endsAt;
    showCountdown();
    const w = win();
    if (!tick && w && tabEndsAt > Date.now()) tick = w.setInterval(showCountdown, 1000);
  };

  let last = view;
  const render = (v: HomeView): void => {
    last = v;
    L.apply();
    topBar.update(topBarProps(v));
    periodPill.update(periodOf(v));
    renderLead(v.ladder);
    renderStreak(v.streak);
    renderAvatar(v.avatarId ?? null);
    renderEvent(v.event);
    el.toggleAttribute('data-banner', v.bannerReserved);
    el.style.setProperty('--banner-reserve', `${cfg.ads.banner.reservePx}px`);
    // Home cleanup (2026-10-12): always "Level 38", also with a board in progress (Play resumes it).
    setText(playLabel, t('home.play', { level: v.level }));
    hardBadge.hidden = !v.hard;
    play.dataset.hard = String(v.hard);

    const d = v.daily;
    const date = formatShortDate(d.dateKey);
    const size = t('home.daily.size', { n: d.n });
    const status = dailyStatusText(d);
    daily.dataset.state = d.state;
    // The date never breaks between day and month ("Wed 7" / "Oct", UX-15).
    const title = t('home.daily.title', { date });
    // The pill shows the title's name ("Daily puzzle"); the date stays in its accessible name.
    setText(dailyTitle, splitTitle(title).name);
    // Home cleanup (2026-10-12): the tab shows the lock line, a check and the solve time, or the time left today.
    renderTab(d, status);
    daily.setAttribute('aria-label', t('home.daily.a11y', { date, size, status }));
    const wanted = d.state === 'locked' ? 'lock' : 'cal';
    if (wanted !== iconState) {
      iconState = wanted;
      clear(dailyIcon);
      dailyIcon.appendChild(icon(wanted === 'lock' ? 'icon-lock' : 'icon-calendar'));
    }

    if (v.extraCards !== lastCards) {
      lastCards = v.extraCards;
      clear(cards);
      for (const c of v.extraCards) {
        cards.appendChild(
          h(
            'button',
            { type: 'button', class: 'home-card', dataset: { card: c.id }, on: { click: () => cb.onCard(c.id) } },
            h('span', { class: 'home-card__title' }, c.title),
            h('span', { class: 'home-card__sub' }, c.subtitle),
          ),
        );
      }
      cards.hidden = v.extraCards.length === 0;
    }
    scheduleFit();
  };
  render(view);
  // Settings → Language over Home (A11Y-I18N-1): every text follows, also while a dialog is open.
  const offLocale = onLocaleChanged(() => render(last));

  return {
    el,
    update: render,
    destroy() {
      offLocale();
      L.dispose();
      stopTick();
      w0?.removeEventListener('resize', scheduleFit);
      if (fitRaf) win()?.cancelAnimationFrame(fitRaf);
      topBar.destroy();
      periodPill.destroy();
      chip?.destroy();
      strip?.destroy();
      offExtras?.();
      offExtras = null;
      el.remove();
    },
  };
}
