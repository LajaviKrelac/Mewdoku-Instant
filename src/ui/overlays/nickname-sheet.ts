// Owner: G3 (Phase 2e). UI batch (2026-10-13): profile — rewritten as the profile sheet.
// The profile sheet (overlay `nickname`, spec §1.8, §2.7, §7.7, §9.4; CONTRACTS §8): the player types their ranking
// name and picks a picture, a frame and a background (the last two from the server's FRAME_COUNT / BACKGROUND_COUNT;
// some unlock by progress, the app says which). Opened from Home's profile picture and Settings → "Ranking name".
// Lazy `ladder` chunk. The name is the player's own text: rendered with textContent and dir="auto" only, never
// translated; the input never takes the first focus (a keyboard would cover the dialog in the Facebook webview),
// counts its limit in code points (maxlength counts UTF-16 units), uses 16 px text (iOS zooms below) and saves on
// Enter. The shape check is the app's (src/shared/nick-text.ts): the hint says what is wrong while typing; the
// server's verdicts come back as states. Pictures, frames and backgrounds never wait for the name's cooldown.
// States: idle; saving (Save busy, every control disabled); offline (Save disabled, "Connect to the internet…");
// rejected (a blocked name: "That name can't be used…"); invalid (the server's shape verdict); cooldown ("You can
// change your name again in 5 h 12 min."; said up front, a look-only change still saves).
// A11y: the name has a visible label and its hint as description; Picture · Frame · Background is a tab list
// (arrows move and select, RTL-aware); each panel is a radio group (look-grid.ts); the status line is polite.
// Classes: .overlay[data-overlay=nickname] > .overlay__panel--dialog.nickname[data-state]
//          > .overlay__head(.nickname__tag h2.overlay__title button.overlay__close)
//          .nickname__me(.nickname__avatar .nickname__field(label.nickname__label input.nickname__input .nickname__hint))
//          [role=tablist].nickname__tabs > button.nickname__tab[role=tab][data-tab]
//          [role=tabpanel].nickname__panel > [role=radiogroup].nickname__grid(.nickname__avatars|.nickname__frames|.nickname__bgs)
//          .nickname__unlock .nickname__status .overlay__actions(button.nickname__save button.nickname__cancel)
import type { NameProblem } from '../../shared/nick-text';
import { formatDuration, formatNumber, t } from '../../i18n';
import { mountLadderArt } from '../art/ladder-art';
import { avatarBadge, icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { createLookGrid } from './look-grid';
import { clipName, lockText, problemText, tidyName, type LookLock, type NameRules } from './profile-text';
import { arrowStep, closeButton, createOverlayShell, inlineDir, makeButton, nextId, setButtonLabel, setGated, setTextKeepTogether } from './overlay-base';
import '../../styles/ladder-chunk.css';

export interface ProfilePick {
  /** The name as typed (trimmed, inner white space as one space); the app and the server normalise it further. */
  readonly name: string;
  readonly avatarId: number;
  readonly frameId: number;
  readonly backgroundId: number;
}

export type { LookLock } from './profile-text';

export interface NicknameSheetProps {
  readonly current: ProfilePick;
  /** AVATAR_COUNT. */
  readonly avatarCount: number;
  /** One entry per frame / background id (FRAME_COUNT / BACKGROUND_COUNT); [] hides that tab (a server without them). */
  readonly frames: readonly LookLock[];
  readonly backgrounds: readonly LookLock[];
  /** rules.nickname.freeText: false keeps the name read-only (the looks still save). */
  readonly nameEditable: boolean;
  /** The limits the hints name (src/shared/nick-text.ts). */
  readonly nameRules: NameRules;
  /** The shape check of a typed name (the app passes src/shared/nick-text.ts: ui/ imports shared/ for types only). */
  checkName(raw: string): NameProblem | null;
  readonly state: 'idle' | 'saving' | 'offline' | 'rejected' | 'invalid' | 'cooldown';
  /** Device clock: the next allowed name change (state 'cooldown'). */
  readonly cooldownUntil: number | null;
  now(): number;
  onSave(pick: ProfilePick): void;
  onClose(): void;
}

type Tab = 'avatar' | 'frame' | 'bg';
const TABS: readonly Tab[] = ['avatar', 'frame', 'bg'];

export function createNicknameSheet(): OverlayView<NicknameSheetProps> {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  let props: NicknameSheetProps | null = null;
  let pick: ProfilePick = { name: '', avatarId: 0, frameId: 0, backgroundId: 0 };
  let opened: ProfilePick = pick;
  let tab: Tab = 'avatar';
  let edited = false;
  let unlockLine = '';
  const shell = createOverlayShell({ id: 'nickname', scrim: 'soft', panel: 'dialog', onScrimTap: () => void cancel() });
  shell.panel.classList.add('nickname');
  const L = createLocaleText();

  const title = L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('nick.title'));
  const close = L.attr(closeButton(() => props?.onClose()), 'aria-label', () => t('common.close'));
  const head = h('div', { class: 'overlay__head' }, h('span', { class: 'nickname__tag', 'aria-hidden': 'true' }, icon('nick-tag')), title, close);

  // Me: my picture as others will see it, and my name.
  const avatar = h('span', { class: 'nickname__avatar', 'aria-hidden': 'true' });
  const inputId = nextId('nick-name');
  const hintId = nextId('nick-hint');
  const input = h('input', {
    class: 'nickname__input',
    id: inputId,
    type: 'text',
    dir: 'auto',
    autocomplete: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'done',
    'aria-describedby': `${hintId} ${shell.descId}`,
  });
  const hint = h('p', { class: 'nickname__hint', id: hintId });
  const field = h('div', { class: 'nickname__field' }, L.text(h('label', { class: 'nickname__label', for: inputId }), () => t('nick.name')), input, hint);
  const me = h('div', { class: 'nickname__me' }, avatar, field);
  let avatarKey = '';

  // Picture · Frame · Background: one grid at a time.
  const tabIds: Record<Tab, string> = { avatar: nextId('nick-tab'), frame: nextId('nick-tab'), bg: nextId('nick-tab') };
  const panelId = nextId('nick-panel');
  const tabLabel: Record<Tab, () => string> = { avatar: () => t('nick.picture'), frame: () => t('nick.frame'), bg: () => t('nick.background') };
  const tabButtons = TABS.map((k) => {
    const b = L.text(h('button', { type: 'button', class: 'nickname__tab', role: 'tab', id: tabIds[k], 'aria-controls': panelId, dataset: { tab: k } }), tabLabel[k]);
    b.addEventListener('click', () => showTab(k));
    return b;
  });
  const tabs = h('div', { class: 'nickname__tabs', role: 'tablist' }, tabButtons);
  tabs.addEventListener('keydown', (ev) => {
    const step = arrowStep(ev.key, inlineDir(tabs) === 'rtl');
    if (!step) return;
    ev.preventDefault();
    const shown = TABS.filter((k) => !tabButtons[TABS.indexOf(k)]?.hidden);
    const next = shown[(shown.indexOf(tab) + step + shown.length) % shown.length] ?? 'avatar';
    showTab(next);
    tabButtons[TABS.indexOf(next)]?.focus();
  });
  const onLocked = (lock: LookLock): void => {
    unlockLine = lock ? lockText(lock) : '';
    renderState();
  };
  const setPick = (p: Partial<ProfilePick>): void => {
    pick = { ...pick, ...p };
    unlockLine = '';
    renderPick();
  };
  const grids: Record<Tab, ReturnType<typeof createLookGrid>> = {
    avatar: createLookGrid('nickname__avatars', 'avatar', tabIds.avatar, (id) => setPick({ avatarId: id }), () => undefined),
    frame: createLookGrid('nickname__frames', 'frame', tabIds.frame, (id) => setPick({ frameId: id }), (id) => onLocked(props?.frames[id] ?? null)),
    bg: createLookGrid('nickname__bgs', 'bg', tabIds.bg, (id) => setPick({ backgroundId: id }), (id) => onLocked(props?.backgrounds[id] ?? null)),
  };
  const unlock = h('p', { class: 'nickname__unlock', 'aria-live': 'polite' });
  const panel = h('div', { class: 'nickname__panel', role: 'tabpanel', id: panelId }, grids.avatar.el, grids.frame.el, grids.bg.el, unlock);
  const status = h('p', { class: 'nickname__status', role: 'status', 'aria-live': 'polite', id: shell.descId });
  const save = L.label(makeButton({ variant: 'primary', label: '', block: true, className: 'nickname__save', onPress: () => doSave() }), () => t('nick.save'));
  const cancelBtn = L.label(makeButton({ variant: 'ghost', label: '', className: 'nickname__cancel', onPress: () => void cancel() }), () => t('common.cancel'));
  shell.panel.append(head, me, tabs, panel, status, h('div', { class: 'overlay__actions overlay__actions--stack' }, save, cancelBtn));

  let typed = '';
  input.addEventListener('input', () => {
    // The limit stops a name from growing past it (a paste is clipped); a longer generated name ("Mischievous
    // Whisker 99") is never chopped, only shortened by the player (the hint says how long a name may be).
    const max = Math.max(props?.nameRules.maxChars ?? 16, [...typed].length);
    const clipped = clipName(input.value, max);
    if (clipped !== input.value) input.value = clipped;
    typed = input.value;
    edited = true;
    pick = { ...pick, name: tidyName(input.value) };
    renderState();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    doSave();
  });

  const busy = (): boolean => props?.state === 'saving';
  const nameChanged = (): boolean => pick.name !== opened.name;
  const looksChanged = (): boolean => pick.avatarId !== opened.avatarId || pick.frameId !== opened.frameId || pick.backgroundId !== opened.backgroundId;
  /** A name change waits for the cooldown; a picture, frame or background change never does (spec §1.8). */
  const cooling = (): boolean => !!props && props.state === 'cooldown' && props.cooldownUntil !== null && props.cooldownUntil > props.now();
  const problem = (): NameProblem | null => (props && nameChanged() ? props.checkName(input.value) : null);

  function showTab(k: Tab): void {
    if (tab === k) return;
    tab = k;
    unlockLine = '';
    renderPick();
  }

  function renderPick(): void {
    if (!props) return;
    const p = props;
    const key = `${pick.avatarId}/${pick.frameId}/${pick.backgroundId}`;
    if (key !== avatarKey) {
      avatarKey = key;
      avatar.textContent = '';
      avatar.appendChild(avatarBadge(pick.avatarId, pick.frameId, pick.backgroundId, { class: 'nickname__avatar-art' }));
    }
    const shown: Record<Tab, boolean> = { avatar: true, frame: p.frames.length > 0, bg: p.backgrounds.length > 0 };
    // Against a server without frames and backgrounds only the Picture tab shows (the grid's visible label).
    if (!shown[tab]) tab = 'avatar';
    TABS.forEach((k, i) => {
      const b = tabButtons[i] as HTMLButtonElement;
      b.hidden = !shown[k];
      b.setAttribute('aria-selected', String(k === tab));
      b.tabIndex = k === tab ? 0 : -1;
      grids[k].el.hidden = k !== tab;
    });
    panel.setAttribute('aria-labelledby', tabIds[tab]);
    const disabled = p.state === 'saving' || p.state === 'offline';
    const n = (id: number, count: number, key: 'nick.avatar.a11y' | 'nick.frame.a11y' | 'nick.background.a11y'): string =>
      t(key, { index: formatNumber(id + 1), count: formatNumber(count) });
    const label = (base: string, lock: LookLock): string => (lock ? t('nick.locked.a11y', { label: base, how: lockText(lock) }) : base);
    grids.avatar.render({
      count: Math.max(0, Math.floor(p.avatarCount)),
      selected: pick.avatarId,
      locked: [],
      artKey: `${pick.frameId}/${pick.backgroundId}`,
      art: (id) => avatarBadge(id, pick.frameId, pick.backgroundId, { class: 'nickname__pic-art' }),
      label: (id) => n(id, p.avatarCount, 'nick.avatar.a11y'),
      disabled,
      autofocus: tab === 'avatar',
    });
    grids.frame.render({
      count: p.frames.length,
      selected: pick.frameId,
      locked: p.frames.map((l) => l !== null),
      artKey: `${pick.avatarId}/${pick.backgroundId}`,
      art: (id) => avatarBadge(pick.avatarId, id, pick.backgroundId, { class: 'nickname__pic-art' }),
      label: (id) => label(n(id, p.frames.length, 'nick.frame.a11y'), p.frames[id] ?? null),
      disabled,
      autofocus: tab === 'frame',
    });
    grids.bg.render({
      count: p.backgrounds.length,
      selected: pick.backgroundId,
      locked: p.backgrounds.map((l) => l !== null),
      artKey: `${pick.avatarId}/${pick.frameId}`,
      art: (id) => avatarBadge(pick.avatarId, pick.frameId, id, { class: 'nickname__pic-art' }),
      label: (id) => label(n(id, p.backgrounds.length, 'nick.background.a11y'), p.backgrounds[id] ?? null),
      disabled,
      autofocus: tab === 'bg',
    });
    renderState();
  }

  function renderState(): void {
    if (!props) return;
    const p = props;
    shell.panel.dataset.state = p.state;
    let line = '';
    let time = '';
    if (p.state === 'offline') line = t('nick.offline');
    else if (p.state === 'rejected') line = t('nick.rejected');
    else if (p.state === 'invalid') line = t('nick.invalid');
    // Said up front (not only once the name changed): the player knows before typing; the looks still save.
    else if (cooling()) {
      time = formatDuration((p.cooldownUntil ?? 0) - p.now());
      line = t('nick.cooldown', { time });
    }
    // "5 h 12 min" on one line (UX-15)
    if (status.textContent !== line) setTextKeepTogether(status, line, [time]);
    status.hidden = line === '';
    const bad = problem();
    const hintText = !p.nameEditable ? t('nick.name.off') : bad && edited ? problemText(bad, p.nameRules) : '';
    setText(hint, hintText);
    hint.hidden = hintText === '';
    if (bad && edited) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    setText(unlock, unlockLine);
    unlock.hidden = unlockLine === '';
    const blocked = p.state === 'offline' || p.state === 'saving' || (cooling() && nameChanged()) || bad !== null || (!nameChanged() && !looksChanged());
    setGated(save, blocked);
    // aria-busy needs the value "true" (an empty value reads as false).
    if (p.state === 'saving') save.setAttribute('aria-busy', 'true');
    else save.removeAttribute('aria-busy');
    input.readOnly = !p.nameEditable;
    input.disabled = p.state === 'saving' || p.state === 'offline';
  }

  function doSave(): void {
    if (!props) return;
    edited = true;
    renderState();
    if (save.getAttribute('aria-disabled') === 'true') return;
    props.onSave(pick);
  }

  function cancel(): boolean {
    if (!props || !shell.isOpen()) return false;
    if (!busy()) props.onClose();
    return true;
  }

  const render = (p: NicknameSheetProps): void => {
    props = p;
    L.apply();
    setButtonLabel(save, t('nick.save'));
    renderPick();
  };

  L.watch(() => {
    if (props) render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      pick = { ...p.current };
      opened = pick;
      tab = 'avatar';
      edited = false;
      unlockLine = '';
      avatarKey = '';
      input.value = p.current.name;
      typed = input.value;
      render(p);
      shell.show();
    },
    update(p) {
      // A save that went through moves the baseline (the sheet may stay open on a later error).
      const c = p.current;
      const o = props?.current;
      if (!o || c.name !== o.name || c.avatarId !== o.avatarId || c.frameId !== o.frameId || c.backgroundId !== o.backgroundId) opened = { ...c };
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss: cancel,
    destroy() {
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
