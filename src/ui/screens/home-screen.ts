// Owner: ui-shell
// S1 Home (02 §5): top bar (Trophy*, Gear), wordmark + mascot, primary level button, daily card,
// stock readout. Phase 3 hook: extra cards array (02 §22).
//
// Classes: .screen.screen--home > .home__body > .home__hero(.home__wordmark .home__tagline .home__mascot)
//          .home__actions(.home__play .badge.badge--hard .daily-card[data-state] .home__cards .home-card)
//          .home__stock(.stock__item)
import type { DailyCardState } from '../../game/progression';
import { formatClock, formatShortDate, t } from '../../i18n';
import { mascotIllustration } from '../art/mascot';
import { icon } from '../art/sprite';
import { clear, h, setText, type View } from '../dom';
import { createTopBar, type TopBarProps } from '../hud/top-bar';

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
}

export interface HomeCallbacks {
  onPlay(): void;
  /** Any daily card tap; the app shows the "locked" toast, opens O7 when solved, or starts the daily. */
  onDaily(): void;
  onSettings(): void;
  onTrophy(): void;
  onCard(id: string): void;
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
  const topBar = createTopBar(topBarProps(view), { onHome: () => undefined, onSettings: () => cb.onSettings(), onTrophy: () => cb.onTrophy() });

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
      h('div', { class: 'home__actions' }, play, daily, cards),
      h('div', { class: 'home__stock stock' }, hintsItem, kittiesItem),
    ),
  );

  let lastCards: readonly HomeCardView[] | null = null;
  let iconState: 'lock' | 'cal' | null = null;

  const render = (v: HomeView): void => {
    topBar.update(topBarProps(v));
    setText(playLabel, v.continueLevel ? t('home.continue', { level: v.level }) : t('home.play', { level: v.level }));
    hardBadge.hidden = !v.hard;
    play.dataset.hard = String(v.hard);

    const d = v.daily;
    const date = formatShortDate(d.dateKey);
    const size = t('home.daily.size', { n: d.n });
    const status = dailyStatusText(d);
    daily.dataset.state = d.state;
    setText(dailyTitle, t('home.daily.title', { date }));
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
      el.remove();
    },
  };
}
