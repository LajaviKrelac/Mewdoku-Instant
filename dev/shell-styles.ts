// Owner: B (Phase 2b; was ui-shell). PROPOSED CSS for the ui-shell DOM (screens S0–S2, overlays O1–O10).
// All CSS files belong to ui-board (CONTRACTS §1). ui-board adopted every rule below into
// src/styles/overlays.css and hud.css (2026-10-07), so the harness no longer injects this by
// default; load it with /dev/shell-harness.html?css=proposed&view=… to try further changes here
// before proposing them. Uses ui-board's tokens (tokens.css) and button vocabulary (base.css).
// Browser baseline (04 §1): no flex `gap`, no `inset`, no `dvh`, no `:has()`.
export const SHELL_CSS = String.raw`
/* ── Overlays: root, scrims, panels (02 §5, §17.5 overlay fade 200 ms) ── */
.overlay { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 40; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: calc(16px + var(--safe-top)) 16px calc(16px + var(--safe-bottom));
  animation: mw-fade-in var(--t-overlay) ease both; }
.overlay__scrim { position: absolute; top: 0; right: 0; bottom: 0; left: 0; }
.overlay__scrim--clear { background: transparent; }
.overlay__scrim--soft { background: var(--scrim-soft); }
.overlay__scrim--dark { background: var(--scrim); }
.overlay__panel { position: relative; width: 100%; max-height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain; outline: none; }
.overlay__panel--dialog { max-width: 400px; padding: 24px 20px 20px; border-radius: var(--radius-xl); background: var(--card);
  box-shadow: var(--shadow-3); text-align: center; animation: mw-pop-in 220ms var(--ease-out) both; }
.overlay__panel--stage { max-width: 360px; color: #fff; text-align: center; animation: mw-pop-in 260ms var(--ease-out) both; }
.overlay__panel--sheet { max-width: 480px; margin-top: auto; padding: 16px; border-radius: var(--radius-xl); background: var(--card);
  box-shadow: var(--shadow-3); animation: mw-sheet-in 220ms var(--ease-out) both; }
.overlay__head { display: flex; align-items: center; margin: -4px -4px 8px 0; text-align: left; }
.overlay__head .overlay__title { flex: 1; min-width: 0; }
.overlay__title { color: var(--ink); font-size: var(--fs-xxl); line-height: 1.15; }
.overlay__body { margin-top: 8px; color: var(--ink-2); font-size: var(--fs-l); line-height: 1.4; }
.overlay__actions { display: flex; align-items: center; justify-content: center; margin-top: 20px; }
.overlay__actions--stack { flex-direction: column; align-items: stretch; }
.overlay__actions--stack > * + * { margin-top: 12px; }
.overlay__actions--stack > .btn--ghost { align-self: center; }
.overlay__close, .overlay__back { width: 40px; height: 40px; min-height: 40px; background: var(--page-2); box-shadow: none; flex: none; }
.overlay__back { margin-right: 8px; }
.overlay__back .btn__icon { transform: rotate(180deg); }
.overlay__art { display: flex; justify-content: center; margin: 8px auto; }
.overlay__art > svg { width: 168px; height: 168px; }

/* O1 hint card: none here. Phase 2d.1 rebuilt O1 as a modal walkthrough anchored to the board (overlay-chunk.css);
   the Phase 2 bottom-sheet proposal and its 2b top placement were retired at 2d.1 I-3. */

/* O2 rewarded prompt */
.rewarded__icon { display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; margin: 0 auto 12px;
  border-radius: 50%; background: var(--accent-soft); color: var(--accent-deep); }
.rewarded__icon .icon { width: 40px; height: 40px; }
.rewarded[data-placement='hint'] .rewarded__icon { background: #fff6d6; color: var(--gold-deep); }

/* O3 win / O4 fail: content on the dark scrim */
.overlay[data-overlay='win'] .overlay__title, .overlay[data-overlay='fail'] .overlay__title { color: #fff; font-size: 2.25rem;
  text-shadow: 0 2px 0 rgba(30, 22, 36, 0.35); }
.win__praise { color: var(--gold) !important; }
.win__art > svg { width: 210px; height: 210px; }
.win__sub { margin-top: 2px; color: rgba(255, 255, 255, 0.88); font-family: var(--font-display); font-weight: 600; font-size: var(--fs-l); }
.win__confetti { position: absolute; top: 0; right: 0; bottom: 0; left: 0; overflow: hidden; pointer-events: none; }
.win .overlay__actions, .fail .overlay__actions { margin-top: 24px; }
.win__home, .fail__home { color: rgba(255, 255, 255, 0.9); }
.win__home.btn--primary { color: #fff; }
.fail__art > svg { width: 170px; height: 170px; }
.fail__body { max-width: 300px; margin: 4px auto 0; color: rgba(255, 255, 255, 0.82); font-size: var(--fs-m); }
.fail__continue .btn__badge { margin-left: 10px; background: rgba(255, 255, 255, 0.24); }
.fail__continue .btn__badge .icon { width: 1.1em; height: 1.1em; margin-left: 3px; color: #fff; --icon-fill: #fff; }
.fail__retry { color: var(--ink); }

/* O5 settings + About */
.settings, .howto { text-align: left; }
.settings__list { margin-top: 4px; }
.settings-row { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 56px; padding: 6px 2px;
  border-top: 1px solid var(--line); }
.settings__list > .settings-row:first-child { border-top: 0; }
.settings-row__label { flex: 1; min-width: 0; padding-right: 12px; color: var(--ink); font-family: var(--font-display); font-weight: 600;
  font-size: var(--fs-l); cursor: pointer; }
.settings-row__note { display: block; margin-top: 2px; color: var(--ink-2); font-family: var(--font-body); font-weight: 400; font-size: var(--fs-s); }
.settings-row--link.btn { min-height: 56px; padding: 0 2px; border-radius: 0; background: transparent; color: var(--ink); font-size: var(--fs-l);
  justify-content: space-between; }
.settings-row--link .btn__label { flex: 1; text-align: left; }
.settings-row--link .btn__chev { color: var(--ink-3); }
.settings-row--motion { flex-wrap: wrap; }
.switch { display: inline-flex; align-items: center; min-height: 44px; padding: 4px 0; border: 0; background: none; cursor: pointer; }
.switch__state { min-width: 2.2em; margin-right: 8px; color: var(--ink-2); font-size: var(--fs-s); font-weight: 600; text-align: right; }
.switch__track { position: relative; width: 52px; height: 32px; border-radius: 16px; background: var(--line-2); transition: background-color 150ms ease; }
.switch__knob { position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(30, 22, 36, 0.3); transition: transform 150ms var(--ease-out); }
.switch[aria-checked='true'] .switch__track { background: var(--accent); }
.switch[aria-checked='true'] .switch__knob { transform: translateX(20px); }
.segmented { display: inline-flex; padding: 3px; border-radius: var(--radius-pill); background: var(--page-2); }
.segmented__opt { min-height: 38px; padding: 0 12px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-2);
  font-family: var(--font-display); font-weight: 600; font-size: var(--fs-s); cursor: pointer; }
.segmented__opt[aria-checked='true'] { background: var(--card); color: var(--ink); box-shadow: var(--shadow-1); }
.about__name { margin-top: 8px; color: var(--accent-deep); font-family: var(--font-display); font-weight: 600; font-size: var(--fs-xl); }
.about__version { color: var(--ink-2); font-size: var(--fs-s); }
.about__text { margin-top: 12px; color: var(--ink); font-size: var(--fs-m); line-height: 1.45; }
.about__link { color: var(--accent-deep); font-weight: 600; }

/* O6 how to play */
.howto__rules { margin: 0; padding: 0; list-style: none; }
.howto-rule { display: flex; align-items: center; padding: 10px 0; }
.howto-rule + .howto-rule { border-top: 1px solid var(--line); }
.howto-rule__art { flex: none; width: 76px; height: 76px; margin-right: 14px; filter: drop-shadow(0 1px 2px rgba(59, 48, 68, 0.16)); }
.howto-rule__text { color: var(--ink); font-size: var(--fs-m); font-weight: 500; line-height: 1.4; }
.howto__notes { margin-top: 10px; padding: 12px 14px; border-radius: var(--radius-l); background: var(--page-2); }
.howto__notes p { display: flex; align-items: flex-start; color: var(--ink-2); font-size: var(--fs-s); line-height: 1.45; }
.howto__notes p + p { margin-top: 8px; }
.howto__note-icon { width: 20px; height: 20px; margin: 0 10px 0 0; color: var(--accent); }
.howto__note-icon--fish { color: var(--fish-deep); }
.howto__note-icon--bulb { color: var(--gold-deep); }
.howto__extra { flex-direction: column; align-items: stretch; margin-top: 16px; }
.howto__extra > * + * { margin-top: 10px; }

/* O7 daily result */
.daily-result__art > svg { width: 140px; height: 140px; }
.daily-result__time { color: var(--ink); font-family: var(--font-display); font-weight: 600; font-size: var(--fs-xxl); }
.daily-result__stats { margin-top: 4px; color: var(--ink-2); }
.daily-result__next { display: inline-block; margin-top: 14px; padding: 6px 14px; border-radius: var(--radius-pill); background: var(--accent-soft);
  color: var(--accent-deep); font-weight: 600; font-size: var(--fs-s); }

/* O8 tutorial coach (non-modal: only the card takes pointer events) */
.coach { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 30; pointer-events: none; animation: mw-fade-in var(--t-overlay) ease both; }
.coach__dim { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.coach__dim-fill { fill: rgba(30, 22, 36, 0.4); }
.coach__rings, .coach__ring { position: absolute; }
.coach__ring { border-radius: 50%; animation: mw-coach-pulse 1.3s ease-in-out infinite; }
.coach__hand { position: absolute; width: 48px; height: 48px; filter: drop-shadow(0 3px 4px rgba(30, 22, 36, 0.35));
  animation: mw-hand-tap 1.3s ease-in-out infinite; }
.coach[data-hand='double_tap'] .coach__hand { animation-name: mw-hand-double; }
.coach[data-hand='swipe'] .coach__hand { animation: mw-hand-swipe 1.9s ease-in-out infinite; }
.coach__card { position: absolute; left: 16px; right: 16px; max-width: 440px; margin: 0 auto; padding: 16px 18px; border-radius: var(--radius-xl);
  background: var(--card); box-shadow: var(--shadow-3); text-align: center; pointer-events: auto; animation: mw-pop-in 220ms var(--ease-out) both; }
.coach__text { color: var(--ink); font-size: var(--fs-l); font-weight: 500; line-height: 1.4; }
.coach__gotit { margin-top: 12px; min-width: 140px; }

/* O9 toast, O10 rotate notice */
.toast-layer { position: fixed; left: 0; right: 0; bottom: calc(104px + var(--safe-bottom)); z-index: 60; display: flex; justify-content: center;
  padding: 0 16px; pointer-events: none; }
.toast { max-width: 420px; padding: 10px 18px; border-radius: var(--radius-l); background: var(--ink); color: #fff; font-weight: 600;
  text-align: center; box-shadow: var(--shadow-2); animation: mw-pop-in 200ms var(--ease-out) both; }
.rotate-notice { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 100; display: flex; flex-direction: column; align-items: center;
  justify-content: center; padding: 24px; background: var(--page); color: var(--ink); text-align: center; }
.rotate-notice__art { width: 72px; height: 72px; }
.rotate-notice__title { margin-top: 12px; font-family: var(--font-display); font-weight: 600; font-size: var(--fs-xl); }
.rotate-notice__body { margin-top: 4px; color: var(--ink-2); }

/* ── S0 boot ── */
.screen--boot { justify-content: center; }
.boot__center { display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 320px; padding: 0 24px; }
.boot__wordmark { color: var(--accent); font-size: var(--fs-hero); }
.boot__art { margin: 8px 0; }
.boot__art > svg { width: 180px; height: 180px; }
.boot__progress { display: flex; align-items: center; width: 100%; margin-top: 12px; }
.boot__bar { flex: 1; height: 12px; overflow: hidden; border-radius: 6px; background: var(--page-2); box-shadow: inset 0 1px 2px rgba(59, 48, 68, 0.1); }
.boot__fill { height: 100%; border-radius: 6px; background: var(--accent); transform-origin: left center; transition: transform 200ms ease; }
.boot__pct { min-width: 3.2em; margin-left: 12px; color: var(--ink-2); font-family: var(--font-display); font-weight: 600; text-align: right; }
.boot__label { margin-top: 10px; color: var(--ink-2); font-size: var(--fs-s); }

/* ── S1 home ── */
.screen--home > :first-child, .screen--game > :first-child { width: 100%; flex: none; }
.home__body { display: flex; flex: 1; flex-direction: column; width: 100%; max-width: 512px; min-height: 0; padding: 0 16px 16px; }
.home__hero { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; min-height: 0; text-align: center; }
.home__wordmark { color: var(--accent); font-size: 3rem; line-height: 1; }
.home__tagline { margin-top: 6px; color: var(--ink-2); }
.home__mascot { margin-top: 12px; }
.home__mascot > svg { width: 210px; height: 210px; max-height: 28vh; }
.home__actions > * + * { margin-top: 14px; }
.home__play { position: relative; }
.home__play .btn__chev { position: absolute; right: 22px; top: 50%; margin-top: -0.55em; }
.daily-card, .home-card { display: flex; align-items: center; width: 100%; min-height: 72px; padding: 12px 16px; border: 0; border-radius: var(--radius-l);
  background: var(--card); color: var(--ink); font: inherit; text-align: left; cursor: pointer; box-shadow: 0 3px 0 var(--line-2), var(--shadow-1); }
.daily-card:active, .home-card:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--line-2), var(--shadow-1); }
.daily-card__icon { display: flex; flex: none; align-items: center; justify-content: center; width: 46px; height: 46px; margin-right: 12px;
  border-radius: 14px; background: var(--accent-soft); color: var(--accent-deep); }
.daily-card__icon .icon { width: 28px; height: 28px; }
.home-card { flex-direction: column; align-items: flex-start; justify-content: center; }
.daily-card__text { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.daily-card__title, .home-card__title { font-family: var(--font-display); font-weight: 600; font-size: var(--fs-l); }
.daily-card__sub, .home-card__sub { margin-top: 2px; color: var(--ink-2); font-size: var(--fs-s); }
.daily-card__chev { width: 20px; height: 20px; color: var(--ink-3); }
.daily-card[data-state='locked'] { background: var(--page-2); color: var(--ink-2); box-shadow: none; }
.daily-card[data-state='locked'] .daily-card__icon { background: var(--line); color: var(--ink-3); }
.daily-card[data-state='in_progress'] .daily-card__sub { color: var(--gold-deep); font-weight: 600; }
.daily-card[data-state='solved'] .daily-card__sub { color: var(--accent-deep); font-weight: 600; }
.home__stock { display: flex; justify-content: center; margin-top: 18px; }
.stock__item { display: inline-flex; align-items: center; margin: 0 6px; padding: 6px 16px 6px 10px; border-radius: var(--radius-pill);
  background: var(--card); box-shadow: var(--shadow-1); font-family: var(--font-display); font-weight: 600; font-size: var(--fs-l); }
.stock__icon { width: 28px; height: 28px; margin-right: 6px; }

/* S2 game column layout (.game__col/.game__hud/.game__stage/.game__tools) is styled by ui-board in overlays.css. */

/* ── Requested ui-board fix (hud.css): with no title (Home) the actions must stay in the right column. ── */
.top-bar__actions { grid-column: 3; }

@keyframes mw-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mw-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes mw-sheet-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes mw-coach-pulse { 0%, 100% { box-shadow: 0 0 0 3px var(--gold), 0 0 0 6px rgba(255, 212, 92, 0.45); }
  50% { box-shadow: 0 0 0 3px var(--gold), 0 0 0 14px rgba(255, 212, 92, 0); } }
@keyframes mw-hand-tap { 0%, 100% { transform: translate(8px, 12px); } 45%, 60% { transform: translate(0, 0) scale(0.9); } }
@keyframes mw-hand-double { 0%, 100% { transform: translate(8px, 12px); } 22% { transform: translate(0, 0) scale(0.9); }
  34% { transform: translate(3px, 5px); } 46% { transform: translate(0, 0) scale(0.9); } 62% { transform: translate(8px, 12px); } }
@keyframes mw-hand-swipe { 0% { opacity: 0; transform: translate(0, 0); } 12% { opacity: 1; transform: translate(0, 0); }
  70% { opacity: 1; transform: translate(var(--dx, 0), var(--dy, 0)); } 85%, 100% { opacity: 0; transform: translate(var(--dx, 0), var(--dy, 0)); } }

/* Narrow phones (320–359 px) and short screens (compact, < 640 px high, 02 §19). */
@media (max-width: 359px) {
  .home__play.btn--lg { font-size: var(--fs-l); }
  .home__play .btn__chev { display: none; }
  .daily-card__title { font-size: var(--fs-m); }
}
@media (max-height: 639px) {
  .overlay__art > svg, .win__art > svg, .fail__art > svg { width: 120px; height: 120px; }
  .overlay[data-overlay='win'] .overlay__title, .overlay[data-overlay='fail'] .overlay__title { font-size: var(--fs-xxl); }
  .hint-card { padding: 12px; }
  .hint-card__text { font-size: var(--fs-m); }
  .hint-card__icon { width: 36px; height: 36px; padding: 6px; }
  .hint-card__actions { margin-top: 10px; }
  .home__wordmark { font-size: 2.5rem; }
  .home__mascot > svg { width: 150px; height: 150px; }
}

/* Reduced motion (02 §17.5): fades only, ≤ 150 ms; the coach hand stays still. */
[data-motion='reduced'] .overlay__panel, [data-motion='reduced'] .coach__card, [data-motion='reduced'] .toast { animation: mw-fade-in 150ms ease both; }
[data-motion='reduced'] .coach__hand, [data-motion='reduced'] .coach__ring { animation: none; }
[data-motion='reduced'] .coach__ring { box-shadow: 0 0 0 3px var(--gold); }
@media (prefers-reduced-motion: reduce) { .coach__hand { animation: none; } }
`;
