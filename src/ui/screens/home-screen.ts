// Owner: B (Phase 2b)
// S1 Home (02 §5): top bar (Trophy*, Gear), wordmark + mascot, primary level button, daily card,
// stock readout. Phase 3 hook: extra cards array (02 §22).
// Phase 2b (B): the fish pill in the top bar's lead slot (§2.5), the event card above the Level
// button (§4.4: rendered in the extra-cards area as its event variant), data-banner (§3.2).
// The event card's art is A's eventArt(def, 'card'), which lives in the lazy `events` chunk: the app
// passes it in (HomeEventCardView.art) once that chunk has loaded; the card renders without it until then.
//
// Classes: .screen.screen--home[data-banner] > .home__body > .home__hero(.home__wordmark .home__tagline .home__mascot)
//          .home__actions(.home__cards > .event-card[data-state] .home__play .badge.badge--hard
//          .daily-card[data-state] .home-card) .home__stock(.stock__item); the top bar's lead slot holds .fish-pill
import { cfg } from '../../app/config';
import type { EventDef } from '../../game/events';
import type { DailyCardState } from '../../game/progression';
import { formatClock, formatDuration, formatShortDate, t, translate } from '../../i18n';
import { mascotIllustration } from '../art/mascot';
import { icon } from '../art/sprite';
import { clear, h, setText, type View } from '../dom';
import { createFishPill } from '../hud/pills';
import { createTopBar, type TopBarProps } from '../hud/top-bar';
import { setTextKeepTogether } from '../overlays/overlay-base';

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
  /** Wallet fish for the Home fish pill (phase2b §2.5). */
  readonly fish: number;
  /** The event card, or null when no event is active or teased (phase2b §4.4). */
  readonly event: HomeEventCardView | null;
  /** phase2b §3.2: the banner band is reserved (root data-banner). */
  readonly bannerReserved: boolean;
}

export interface HomeCallbacks {
  onPlay(): void;
  /** Any daily card tap; the app shows the "locked" toast, opens O7 when solved, or starts the daily. */
  onDaily(): void;
  onSettings(): void;
  onTrophy(): void;
  onCard(id: string): void;
  /** Fish pill "+" (phase2b §2.5, §8.5). */
  onShop(): void;
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
  });
  // phase2b §2.5: the fish pill (with "+", the shop) at the top bar's lead, after the FB safe zone.
  const fishPill = createFishPill({ count: view.fish, onPlus: () => cb.onShop() });
  const topBar = createTopBar(
    topBarProps(view),
    { onHome: () => undefined, onSettings: () => cb.onSettings(), onTrophy: () => cb.onTrophy() },
    { lead: fishPill.el },
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
  const hardBadge = h('span', { class: 'badge badge--hard' }, t('common.hard'));
  const play = h(
    'button',
    { type: 'button', class: 'btn btn--primary btn--block btn--lg home__play', on: { click: () => cb.onPlay() } },
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
  const hintsCount = h('span', { class: 'stock__count' });
  const kittiesCount = h('span', { class: 'stock__count' });
  const hintsItem = h('span', { class: 'stock__item stock__item--hints', role: 'img' }, icon('icon-bulb', { class: 'stock__icon' }), hintsCount);
  const kittiesItem = h('span', { class: 'stock__item stock__item--kitties', role: 'img' }, icon('icon-paw', { class: 'stock__icon' }), kittiesCount);

  const el = h(
    'div',
    { class: 'screen screen--home' },
    topBar.el,
    h(
      'main',
      { class: 'home__body' },
      h(
        'div',
        { class: 'home__hero' },
        h('h1', { class: 'home__wordmark' }, t('app.name')),
        h('p', { class: 'home__tagline' }, t('app.tagline')),
        h('div', { class: 'home__mascot' }, mascotIllustration('home', { label: t('a11y.mascot') })),
      ),
      h('div', { class: 'home__actions' }, eventCard, play, daily, cards),
      h('div', { class: 'home__stock stock' }, hintsItem, kittiesItem),
    ),
  );

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

  const render = (v: HomeView): void => {
    topBar.update(topBarProps(v));
    fishPill.update({ count: v.fish, onPlus: () => cb.onShop() });
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
  };
  render(view);

  return {
    el,
    update: render,
    destroy() {
      topBar.destroy();
      fishPill.destroy();
      el.remove();
    },
  };
}
