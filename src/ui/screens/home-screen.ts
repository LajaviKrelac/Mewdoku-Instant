// Owner: B (Phase 2b); G2 (Phase 2c: the period pill replaces the fish pill); G3 (Phase 2d: the settings dot)
// S1 Home (02 §5): top bar (Trophy*, Gear), wordmark + mascot, primary level button, daily card,
// stock readout. Phase 3 hook: extra cards array (02 §22).
// Phase 2b (B): the event card above the Level
// button (§4.4: rendered in the extra-cards area as its event variant), data-banner (§3.2).
// Phase 2c (G2, fish-lives-spec §2.8): the top bar's lead slot shows the PERIOD PILL (icon-trophy and
// this period's leaderboard points, "42 fish this week"), not a button; Home has no shop entry.
// The event card's art is A's eventArt(def, 'card'), which lives in the lazy `events` chunk: the app
// passes it in (HomeEventCardView.art) once that chunk has loaded; the card renders without it until then.
//
// Classes: .screen.screen--home[data-banner] > .home__body > .home__hero(.home__wordmark .home__tagline .home__mascot)
//          .home__actions(.home__cards > .event-card[data-state] .home__play .badge.badge--hard
//          .daily-card[data-state] .home-card) .home__stock(.stock__item); the top bar's lead slot holds .period-pill
// Review fixes: the hero never overlaps the top bar or the cards below it (UX-2, I18N-LAYOUT-2): it is
// centred with auto margins (overflow can only go down), and fitHero() shrinks the mascot (then
// drops the tagline) until the hero fits the space the event card, the banner reserve and the
// localized text leave. The static texts follow the language (A11Y-I18N-1).
import { cfg, type PeriodKind } from '../../app/config';
import type { EventDef } from '../../game/events';
import type { DailyCardState } from '../../game/progression';
import { formatClock, formatDuration, formatShortDate, onLocaleChanged, t, translate } from '../../i18n';
import { mascotIllustration } from '../art/mascot';
import { icon } from '../art/sprite';
import { clear, h, setText, type View } from '../dom';
import { createPeriodPill } from '../hud/pills';
import { createTopBar, type TopBarProps } from '../hud/top-bar';
import { createLocaleText } from '../locale-text';
import { setTextKeepTogether } from '../overlays/overlay-base';

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
  /** capabilities().leaderboards (hidden in Phase 2). */
  readonly showTrophy: boolean;
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
}

export interface HomeCallbacks {
  onPlay(): void;
  /** Any daily card tap; the app shows the "locked" toast, opens O7 when solved, or starts the daily. */
  onDaily(): void;
  onSettings(): void;
  onTrophy(): void;
  onCard(id: string): void;
  /** Event card tap (active, locked or done; a teaser is not tappable), phase2b §4.4. */
  onEvent(): void;
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
    showTrophy: v.showTrophy,
    fbSafeZone: v.fbSafeZone,
    // Phase 2d §1.15, §2.2: the red dot on the gear (something in Settings not seen yet).
    settingsDot: v.settingsDot,
  });
  // Phase 2c §2.8: the period pill at the top bar's lead, after the FB safe zone (not a button).
  const periodOf = (v: HomeView): { readonly kind: PeriodKind; readonly total: number } => v.period ?? { kind: cfg.period.kind, total: 0 };
  const periodPill = createPeriodPill(periodOf(view));
  const topBar = createTopBar(
    topBarProps(view),
    { onHome: () => undefined, onSettings: () => cb.onSettings(), onTrophy: () => cb.onTrophy() },
    { lead: periodPill.el },
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

  const L = createLocaleText();
  // Primary level button.
  const playLabel = h('span', { class: 'btn__label' });
  const hardBadge = L.text(h('span', { class: 'badge badge--hard' }), () => t('common.hard'));
  const play = h(
    'button',
    // A11Y-FOCUS-1: the router lands focus here after a screen change (not the wordmark or the first chip).
    { type: 'button', class: 'btn btn--primary btn--block btn--lg home__play', 'data-autofocus': '', on: { click: () => cb.onPlay() } },
    playLabel,
    hardBadge,
    icon('icon-chevron', { class: 'btn__chev' }),
  );

  // Daily card.
  const dailyIcon = h('span', { class: 'daily-card__icon', 'aria-hidden': 'true' });
  const dailyTitle = h('span', { class: 'daily-card__title' });
  const dailySub = h('span', { class: 'daily-card__sub' });
  const daily = h(
    'button',
    { type: 'button', class: 'daily-card', on: { click: () => cb.onDaily() } },
    dailyIcon,
    h('span', { class: 'daily-card__text' }, dailyTitle, dailySub),
    icon('icon-chevron', { class: 'daily-card__chev' }),
  );

  const cards = h('div', { class: 'home__cards' });
  const hintsCount = h('span', { class: 'stock__count num' });
  const kittiesCount = h('span', { class: 'stock__count num' });
  const hintsItem = h('span', { class: 'stock__item stock__item--hints', role: 'img' }, icon('icon-bulb', { class: 'stock__icon' }), hintsCount);
  const kittiesItem = h('span', { class: 'stock__item stock__item--kitties', role: 'img' }, icon('icon-paw', { class: 'stock__icon' }), kittiesCount);

  const mascot = L.attr(mascotIllustration('home', { label: t('a11y.mascot') }), 'aria-label', () => t('a11y.mascot'));
  const mascotBox = h('div', { class: 'home__mascot' }, mascot);
  const tagline = L.text(h('p', { class: 'home__tagline' }), () => t('app.tagline'));
  const hero = h('div', { class: 'home__hero' }, L.text(h('h1', { class: 'home__wordmark' }), () => t('app.name')), tagline, mascotBox);
  const el = h(
    'div',
    { class: 'screen screen--home' },
    topBar.el,
    h(
      'main',
      { class: 'home__body' },
      hero,
      h('div', { class: 'home__actions' }, eventCard, play, daily, cards),
      h('div', { class: 'home__stock stock' }, hintsItem, kittiesItem),
    ),
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

  let last = view;
  const render = (v: HomeView): void => {
    last = v;
    L.apply();
    topBar.update(topBarProps(v));
    periodPill.update(periodOf(v));
    renderEvent(v.event);
    el.toggleAttribute('data-banner', v.bannerReserved);
    el.style.setProperty('--banner-reserve', `${cfg.ads.banner.reservePx}px`);
    setText(playLabel, v.continueLevel ? t('home.continue', { level: v.level }) : t('home.play', { level: v.level }));
    hardBadge.hidden = !v.hard;
    play.dataset.hard = String(v.hard);

    const d = v.daily;
    const date = formatShortDate(d.dateKey);
    const size = t('home.daily.size', { n: d.n });
    const status = dailyStatusText(d);
    daily.dataset.state = d.state;
    // The date never breaks between day and month ("Wed 7" / "Oct", UX-15).
    const title = t('home.daily.title', { date });
    if (dailyTitle.textContent !== title) setTextKeepTogether(dailyTitle, title, [date]);
    setText(dailySub, d.state === 'locked' ? status : t('home.daily.sub', { size, status }));
    daily.setAttribute('aria-label', t('home.daily.a11y', { date, size, status }));
    const wanted = d.state === 'locked' ? 'lock' : 'cal';
    if (wanted !== iconState) {
      iconState = wanted;
      clear(dailyIcon);
      dailyIcon.appendChild(icon(wanted === 'lock' ? 'icon-lock' : 'icon-calendar'));
    }

    setText(hintsCount, String(v.hints));
    setText(kittiesCount, String(v.kitties));
    hintsItem.setAttribute('aria-label', t('home.stock.hints', { count: v.hints }));
    kittiesItem.setAttribute('aria-label', t('home.stock.kitties', { count: v.kitties }));

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
      w0?.removeEventListener('resize', scheduleFit);
      if (fitRaf) win()?.cancelAnimationFrame(fitRaf);
      topBar.destroy();
      periodPill.destroy();
      el.remove();
    },
  };
}
