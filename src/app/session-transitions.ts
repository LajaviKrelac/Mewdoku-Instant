// Owner: app
// Transitions out of a finished or failed attempt (02 §4.2, §10, §13; 04 §5.7): O4 Continue / Retry,
// O3 Next, O7 Done, Home (save or discard) and "I know how to play". Interstitials go through the
// pacing gate first, and the transition always goes ahead whatever the ad did.
import { canRevive } from '../game/reducer';
import { applyTutorialDone } from '../game/stats';
import type { Action, GameState, SaveDataV1 } from '../game/types';
import type { AnalyticsEvent } from './events';
import type { HelperFlows } from './helper-flows';
import type { SaveScheduler } from './saves';
import type { GameCommands } from './session-types';
import { withSlot } from './session-parts';
import type { SessionMeta, SessionRequest } from './store';
import type { FailOverlayProps } from '../ui/overlays/fail-overlay';

export interface TransitionHost {
  readonly saves: SaveScheduler;
  readonly helpers: HelperFlows;
  game(): GameState | null;
  meta(): SessionMeta | null;
  save(): SaveDataV1;
  updateSave(fn: (s: SaveDataV1) => SaveDataV1): void;
  busy(): boolean;
  runBusy(fn: (alive: () => boolean) => Promise<void>): Promise<void>;
  /** Increments on every start/teardown; a changed value means "this flow is stale". */
  generation(): number;
  disposed(): boolean;
  dispatch(a: Action): void;
  now(): number;
  log(e: AnalyticsEvent): void;
  /** 'next' keeps the store's game until start() replaces it; 'home'/'discard' clear it. */
  leave(reason: 'home' | 'next' | 'discard'): void;
  start(req: SessionRequest): Promise<void>;
  /** Board into its slot + saves.now(). */
  saveNow(): void;
  goHome(): void;
  slotFor(m: SessionMeta): 'level' | 'daily' | null;
  updateFail(patch: Partial<FailOverlayProps>): void;
  /** O4 is open (or queued for its chunk): only then does Home discard the attempt. */
  failOpen(): boolean;
  closeFail(): void;
  /** After RETRY: start events, board entry and START after fx.boardEntryMs. */
  restartEntry(): void;
}

export type TransitionCommands = Pick<
  GameCommands,
  'onContinue' | 'onRetry' | 'onNext' | 'onDailyDone' | 'onHome' | 'onSkipTutorial'
>;

const isReplay = (m: SessionMeta): boolean => m.request.mode === 'tutorial' && m.request.replay;

export function createTransitions(host: TransitionHost): TransitionCommands {
  const cmds: TransitionCommands = {
    async onContinue() {
      const s = host.game();
      if (!s || !canRevive(s) || host.busy()) return;
      await host.runBusy(async (alive) => {
        host.updateFail({ busy: true });
        const ok = await host.helpers.rewardedOrFallback('revive');
        if (!alive()) return;
        if (!ok) {
          host.updateFail({ busy: false, continueOffer: host.helpers.continueOffer() }); // stay on O4
          return;
        }
        host.closeFail();
        host.dispatch({ type: 'REVIVE', t: host.now() });
      });
    },

    async onRetry() {
      const s = host.game();
      if (!s || s.status !== 'lost' || host.busy()) return;
      await host.runBusy(async (alive) => {
        host.updateFail({ busy: true });
        await host.helpers.interstitial('retry');
        if (!alive()) return;
        host.closeFail();
        host.dispatch({ type: 'RETRY' });
        if (host.game()?.status === 'ready') host.restartEntry();
      });
    },

    async onNext() {
      const s = host.game();
      const m = host.meta();
      if (!s || !m || s.status !== 'won' || host.busy()) return;
      if (m.mode === 'tutorial') {
        // First-run tutorial: straight to Level 2, no gate (02 §10.1). A replay returns Home.
        if (isReplay(m)) return cmds.onHome();
        host.leave('next');
        return host.start({ mode: 'level', level: Math.max(2, host.save().progress.level) });
      }
      if (m.mode !== 'level') return;
      const mine = host.generation();
      await host.runBusy(() => host.helpers.interstitial('next_level'));
      if (host.generation() !== mine || host.disposed()) return;
      host.leave('next');
      await host.start({ mode: 'level', level: (m.level ?? host.save().progress.level - 1) + 1 });
    },

    async onDailyDone() {
      const s = host.game();
      const m = host.meta();
      if (!s || !m || m.mode !== 'daily' || s.status !== 'won' || host.busy()) return;
      const mine = host.generation();
      await host.runBusy(() => host.helpers.interstitial('daily_done'));
      if (host.generation() !== mine || host.disposed()) return;
      host.leave('home');
      host.goHome();
    },

    onHome() {
      const s = host.game();
      const m = host.meta();
      if (s && m) {
        if (s.status === 'lost' && host.failOpen()) {
          // O4 Home discards the attempt (02 §10.2). The top-bar Home in the fx.failOverlayDelayMs
          // before O4 shows saves the board like any other Home; a restore reopens O4 (02 §15 step 5).
          const slot = host.slotFor(m);
          if (slot) host.updateSave((sv) => withSlot(sv, slot, null));
          host.saves.now();
          host.leave('discard');
        } else {
          host.saveNow();
          host.leave('home');
        }
      }
      host.goHome();
    },

    onSkipTutorial() {
      const s = host.game();
      const m = host.meta();
      if (!m || m.mode !== 'tutorial' || isReplay(m) || host.save().tutorialDone) return;
      host.updateSave(applyTutorialDone); // 02 §4.2: the tutorial-win bookkeeping, without an overlay
      host.saves.critical();
      host.log({ name: 'tutorial_done', params: { ms: Math.round(s?.elapsedMs ?? 0), skipped: 1 } });
      host.leave('next');
      void host.start({ mode: 'level', level: 2 });
    },
  };
  return cmds;
}
