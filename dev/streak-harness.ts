// UI batch (2026-10-13): streak — dev harness (not shipped) for the Daily Streak screen and Home's streak pill.
// /dev/streak-harness.html?view=<name>&lang=<id>&rm=1&banner=1 (no view: the index). The screen's data comes from
// the real selector (app/streak-screen-flow.ts selectStreakScreen) over a synthetic save.dayStreak, so the week row
// shows real weekdays around today. Run `npx vite --port 5193 --strictPort`.
import '../src/i18n/en-lazy';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
import '../src/styles/art.css';
import '../src/styles/screens.css';
import '../src/styles/i18n.css';
import '../src/styles/overlay-chunk.css';
import { selectStreakScreen } from '../src/app/streak-screen-flow';
import { initialAppState } from '../src/app/store';
import { streakStripOf } from '../src/app/views';
import { dateKeyOfDay, dayNumber, streakView } from '../src/game/day-streak';
import type { Reward } from '../src/game/events';
import { dailyDateKey } from '../src/game/progression';
import { defaults } from '../src/game/save';
import type { DayStreakRecord } from '../src/game/types';
import { setLocale } from '../src/i18n/index';
import { setInert, trapFocus } from '../src/ui/a11y/focus-trap';
import { mountSprite } from '../src/ui/art/sprite';
import { mountStreakArt } from '../src/ui/art/streak-art';
import { applyMotion } from '../src/ui/fx/motion';
import { createLadderChip } from '../src/ui/hud/ladder-chip';
import { createStreakPill } from '../src/ui/hud/streak-strip';
import { createStreakScreen } from '../src/ui/overlays/streak-screen';
import { createHomeScreen } from '../src/ui/screens/home-screen';
import { provideHomeExtras } from '../src/ui/screens/home-extras';
import { homeView } from './shell-fixtures';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'index';
const lang = q.get('lang') ?? 'en';
const reduced = q.get('rm') === '1';
const banner = q.get('banner') === '1';

const NOW = Date.now();
const TODAY = dailyDateKey(NOW);
/** A run of `days` counted days ending `endsAgo` days before today, best `best`. */
function run(days: number, endsAgo: number, best = days, paidToday = false): DayStreakRecord {
  const end = dayNumber(TODAY) - endsAgo;
  return {
    dates: Array.from({ length: days }, (_, i) => dateKeyOfDay(end - (days - 1 - i))),
    run: days,
    best,
    paid: paidToday ? [`${TODAY}|2|2`] : [],
  };
}

mountSprite();
mountStreakArt();
provideHomeExtras({ createLadderChip, createStreakPill });
const app = document.getElementById('app') as HTMLElement;
applyMotion(app, reduced);

function home(ds: DayStreakRecord): HTMLElement {
  const v = streakView(ds, TODAY);
  const el = createHomeScreen(homeView({ streak: streakStripOf(v), bannerReserved: banner }), {
    onPlay: () => undefined,
    onDaily: () => undefined,
    onSettings: () => undefined,
    onCard: () => undefined,
    onEvent: () => undefined,
    onLadder: () => undefined,
    onStreak: () => screen(ds, 'home'),
  }).el;
  app.appendChild(el);
  return el;
}

function screen(ds: DayStreakRecord, mode: 'home' | 'win', reward: Reward | null = null): void {
  const state = initialAppState({ ...defaults(NOW), tutorialDone: true, dayStreak: ds });
  const data = selectStreakScreen({ ...state, ui: { ...state.ui, bannerReserved: banner, reducedMotion: reduced } }, NOW, mode, reward);
  const ov = createStreakScreen();
  app.appendChild(ov.el);
  ov.open({ ...data, onDone: () => ov.close() });
  const under = app.querySelector<HTMLElement>('.screen');
  if (under) setInert([under], true);
  trapFocus(ov.el, { initialFocus: ov.el.querySelector<HTMLElement>('[data-autofocus]:not([hidden])') });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ov.dismiss();
  });
}

const VIEWS: Record<string, () => void> = {
  // Home: the pill faded (today not counted yet) and lit (counted).
  home: () => void home(run(9, 1)),
  'home-done': () => void home(run(10, 0)),
  // The screen from Home before today counts (run 9, two days of this cycle solved), and with no streak at all.
  'screen-home': () => (home(run(9, 1)), screen(run(9, 1), 'home')),
  'screen-none': () => (home({ dates: [], run: 0, best: 4, paid: [] }), screen({ dates: [], run: 0, best: 4, paid: [] }, 'home')),
  // After the day's first counted win: run 10 (day 3 of the cycle) and the cycle's reward day.
  'screen-win': () => screen(run(10, 0, 12), 'win'),
  'screen-day7': () => screen(run(7, 0, 7, true), 'win', { hints: 2, kitties: 2 }),
};

function index(): void {
  const list = document.createElement('ul');
  list.style.cssText = 'padding:24px 32px;font:16px/1.8 system-ui;margin:0';
  for (const name of Object.keys(VIEWS)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `?view=${name}`;
    a.textContent = name;
    li.appendChild(a);
    list.appendChild(li);
  }
  app.appendChild(list);
}

void (async () => {
  if (lang !== 'en') await setLocale(lang, { override: lang } as never).catch((e: unknown) => console.error(e));
  (VIEWS[view] ?? index)();
  await document.fonts?.ready;
  setTimeout(() => {
    document.documentElement.dataset.ready = 'true';
  }, 1200);
})();
