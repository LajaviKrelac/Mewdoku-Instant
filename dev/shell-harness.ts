// Owner: B (Phase 2b; was ui-shell). Dev harness for screens and overlays: /dev/shell-harness.html?view=<name>.
// Options: &css=proposed (also inject dev/shell-styles.ts on top of src/styles, to try CSS changes
// before proposing them to ui-board), &motion=reduced, &patterns=1 (hint text with glyph names).
// A tiny router stand-in mounts overlays above the screen, traps focus for modal ones, makes the
// screen inert and sends Esc to dismiss(). Callbacks show a toast with their name.
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/board.css';
import '../src/styles/hud.css';
import '../src/styles/overlays.css';
import '../src/styles/fx.css';
// 2b integration: the overlays' rules load with the lazy overlay chunk in the app.
import '../src/styles/overlay-chunk.css';
import type { Settings } from '../src/game/types';
import { setInert, trapFocus } from '../src/ui/a11y/focus-trap';
import { mountSprite } from '../src/ui/art/sprite';
import type { OverlayView } from '../src/ui/dom';
import { applyMotion } from '../src/ui/fx/motion';
import { createCoach } from '../src/ui/overlays/coach';
import { createDailyResult } from '../src/ui/overlays/daily-result';
import { createFailOverlay } from '../src/ui/overlays/fail-overlay';
import { createHintCard } from '../src/ui/overlays/hint-card';
import { createHowToPlay } from '../src/ui/overlays/how-to-play';
import { createRewardedPrompt, type RewardedVariant } from '../src/ui/overlays/rewarded-prompt';
import { mountRotateNotice } from '../src/ui/overlays/rotate-notice';
import { createSettingsModal, type SettingsProps } from '../src/ui/overlays/settings-modal';
import { createToastLayer } from '../src/ui/overlays/toast';
import { createBootScreen } from '../src/ui/screens/boot-screen';
import { createGameScreen, type GameScreen, type GameView } from '../src/ui/screens/game-screen';
import { createHomeScreen } from '../src/ui/screens/home-screen';
import type { TutorialStepIndex } from '../src/game/tutorial';
import { tutorialStep } from '../src/game/tutorial';
import { gameView, hintFor, homeView, midGame, solved, tutorialView } from './shell-fixtures';
import { SHELL_CSS } from './shell-styles';

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'index';
if (params.get('css') === 'proposed') {
  const style = document.createElement('style');
  style.textContent = SHELL_CSS;
  document.head.appendChild(style);
}

mountSprite();
const app = document.getElementById('app') as HTMLElement;
applyMotion(app, params.get('motion') === 'reduced');
const toasts = createToastLayer();
document.body.appendChild(toasts.el);
const log = (name: string) => (): void => {
  console.info(`[harness] ${name}`);
  toasts.show(name, { durationMs: 1200 });
};

let screenEl: HTMLElement | null = null;
let top: OverlayView<never> | null = null;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && top) top.dismiss();
});

function mountScreen(el: HTMLElement): void {
  screenEl = el;
  app.appendChild(el);
}

/** Router stand-in: lazily mounted overlay, focus trap + inert background when modal. */
function openOverlay<P>(ov: OverlayView<P>, props: P): void {
  app.appendChild(ov.el);
  ov.open(props);
  top = ov as unknown as OverlayView<never>;
  if (ov.modal && screenEl) {
    setInert([screenEl], true);
    trapFocus(ov.el, { initialFocus: ov.el.querySelector<HTMLElement>('[data-autofocus]:not([hidden])') });
  }
}

const gameCallbacks = {
  onTap: log('onTap'),
  onDoubleTap: log('onDoubleTap'),
  onPaint: log('onPaint'),
  onBulb: log('onBulb'),
  onPaw: log('onPaw'),
  onHome: log('onHome'),
  onSettings: log('onSettings'),
  onMouse: log('onMouse'),
};

function game(v: GameView): GameScreen {
  const g = createGameScreen(v, gameCallbacks);
  mountScreen(g.el);
  g.playEntry();
  return g;
}

function settingsProps(): SettingsProps {
  let settings: Settings = { sound: true, haptics: true, patterns: false, reduceMotion: 'system' };
  const p: SettingsProps = {
    settings,
    showVibration: true,
    version: '0.1.0',
    fontLicenceUrl: '../src/assets/fonts/OFL.txt',
    onChange: (patch) => {
      settings = { ...settings, ...patch };
      modal.update({ ...p, settings });
    },
    onHowToPlay: log('onHowToPlay'),
    onClose: log('onClose'),
  };
  return p;
}
const modal = createSettingsModal();

function coachView(step: TutorialStepIndex): void {
  const g = game(tutorialView(step));
  const def = tutorialStep(step);
  const coach = createCoach();
  requestAnimationFrame(() =>
    openOverlay(coach, {
      step,
      hand: def.hand,
      showGotIt: def.gotIt,
      colorParam: def.colorParam,
      targetRects: () =>
        def.target === 'bulb'
          ? [g.toolRect('bulb')].filter((r): r is DOMRect => r !== null)
          : def.focusCells.map((c) => g.cellRect(c)).filter((r): r is DOMRect => r !== null),
      onGotIt: log('onGotIt'),
    }),
  );
}

function rewarded(variant: RewardedVariant, placement: 'hint' | 'kitty'): void {
  game(gameView(midGame(37), { hints: 0, inputLocked: true }));
  openOverlay(createRewardedPrompt(), {
    placement,
    variant,
    nextFreeAt: Date.now() + 7 * 60_000 + 42_000,
    now: () => Date.now(),
    onAccept: log('onAccept'),
    onDecline: log('onDecline'),
  });
}

const VIEWS: Record<string, () => void> = {
  boot: () => {
    const boot = createBootScreen();
    mountScreen(boot.el);
    boot.setProgress(62);
  },
  home: () => mountScreen(createHomeScreen(homeView(), { onPlay: log('onPlay'), onDaily: log('onDaily'), onSettings: log('onSettings'), onTrophy: log('onTrophy'), onCard: log('onCard'), onEvent: log('onEvent') }).el),
  'home-locked': () =>
    mountScreen(
      createHomeScreen(homeView({ level: 7, daily: { state: 'locked', dateKey: '2026-10-06', n: 8, solvedMs: null, unlockLevel: 20 } }), {
        onPlay: log('onPlay'), onDaily: log('onDaily'), onSettings: log('onSettings'), onTrophy: log('onTrophy'), onCard: log('onCard'), onEvent: log('onEvent'),
      }).el,
    ),
  'home-continue': () =>
    mountScreen(
      createHomeScreen(
        homeView({ level: 40, hard: true, continueLevel: true, hints: 0, daily: { state: 'solved', dateKey: '2026-10-07', n: 9, solvedMs: 252_000, unlockLevel: 20 } }),
        { onPlay: log('onPlay'), onDaily: log('onDaily'), onSettings: log('onSettings'), onTrophy: log('onTrophy'), onCard: log('onCard'), onEvent: log('onEvent') },
      ).el,
    ),
  game: () => void game(gameView(midGame(37))),
  'game-daily': () => void game(gameView(midGame(80, 0), { mode: 'daily', level: null, dateKey: '2026-10-06', hard: false })),
  hint: () => {
    const b = midGame(37, 0);
    const step = hintFor(b);
    const g = game(gameView(b, { status: 'hint', inputLocked: true, highlight: { kind: 'hint', step } }));
    openOverlay(createHintCard(), {
      step,
      n: b.puzzle.n,
      colors: b.colors,
      patterns: params.get('patterns') === '1',
      onApply: log('onApply'),
      onClose: log('onClose'),
      avoidRect: () => g.boardRect(),
    });
  },
  'rewarded-video': () => rewarded('video', 'hint'),
  'rewarded-free': () => rewarded('free', 'kitty'),
  'rewarded-countdown': () => rewarded('countdown', 'hint'),
  fail: () => {
    game(gameView(midGame(37, 3), { status: 'lost', inputLocked: true }));
    openOverlay(createFailOverlay(), { continueOffer: 'video', buttonDelayMs: 600, busy: false, onContinue: log('onContinue'), onRetry: log('onRetry'), onHome: log('onHome') });
  },
  'fail-free': () => {
    game(gameView(midGame(37, 3), { status: 'lost', inputLocked: true }));
    openOverlay(createFailOverlay(), { continueOffer: 'free', buttonDelayMs: 0, busy: false, onContinue: log('onContinue'), onRetry: log('onRetry'), onHome: log('onHome') });
  },
  settings: () => {
    game(gameView(midGame(37)));
    openOverlay(modal, settingsProps());
  },
  about: () => {
    game(gameView(midGame(37)));
    openOverlay(modal, settingsProps());
    modal.el.querySelector<HTMLElement>('.settings__about-link')?.click();
  },
  howto: () => {
    mountScreen(createHomeScreen(homeView(), { onPlay: log('onPlay'), onDaily: log('onDaily'), onSettings: log('onSettings'), onTrophy: log('onTrophy'), onCard: log('onCard'), onEvent: log('onEvent') }).el);
    openOverlay(createHowToPlay(), { showSkip: false, showReplay: true, onSkip: log('onSkip'), onReplay: log('onReplay'), onClose: log('onClose') });
  },
  'howto-skip': () => {
    game(tutorialView(1));
    openOverlay(createHowToPlay(), { showSkip: true, showReplay: false, onSkip: log('onSkip'), onReplay: log('onReplay'), onClose: log('onClose') });
  },
  'daily-result': () => {
    game(gameView(solved(80), { mode: 'daily', level: null, dateKey: '2026-10-06', hard: false, status: 'won', inputLocked: true }));
    const now = Date.now();
    openOverlay(createDailyResult(), { dateKey: '2026-10-06', ms: 252_000, mistakes: 1, hints: 0, kitties: 0, nextPuzzleAt: now + (7 * 60 + 48) * 60_000 + 20_000, now: () => Date.now(), onDone: log('onDone') });
  },
  'coach-1': () => coachView(1),
  'coach-2': () => coachView(2),
  'coach-3': () => coachView(3),
  'coach-5': () => coachView(5),
  toast: () => {
    game(gameView(midGame(37)));
    toasts.show('No videos right now — try again soon.', { durationMs: 600_000 });
  },
  rotate: () => {
    mountScreen(createHomeScreen(homeView(), { onPlay: log('onPlay'), onDaily: log('onDaily'), onSettings: log('onSettings'), onTrophy: log('onTrophy'), onCard: log('onCard'), onEvent: log('onEvent') }).el);
    mountRotateNotice(document.body);
  },
};

function index(): void {
  const list = document.createElement('ul');
  list.style.cssText = 'padding:24px 32px;font:16px/1.8 system-ui';
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

(VIEWS[view] ?? index)();
// Lets the screenshot script wait until the view is mounted.
document.documentElement.dataset.ready = 'true';
