// Owner: G3 (Phase 2e)
// The name sheet (overlay `nickname`, spec §1.8, §2.7, §7.7, §9.4; CONTRACTS §8): pick a ranking name from
// our word lists (first word, second word, number 1–99) and one of our 12 pictures. Opened from Settings →
// "Ranking name" and from the pencil on my row in the ranking sheet. Lazy `ladder` chunk.
// No free text (nickname.freeText off, D-2e-16): only our words, the same English words in every locale,
// rendered with textContent and dir="auto". The UI has no randomness: Shuffle asks the app (props.shuffle).
// States: idle; saving (Save busy, every control disabled); offline (Save disabled, "Connect to the internet
// to change your name."); rejected ("That name can't be used. Please pick another.", the sheet stays);
// cooldown ("You can change your name again in 5 h 12 min."; a picture-only change still saves: pictures
// have no cooldown, spec §1.8).
// A11y: the pictures are a radio group (arrow keys move and pick, roving tabindex, "Picture 3 of 12"); the
// pickers are native <select>s and a number <input> with visible labels; the status line is polite.
// Classes: .overlay[data-overlay=nickname] > .overlay__panel--dialog.nickname[data-state]
//          > .overlay__head(.nickname__tag h2.overlay__title button.overlay__close)
//          .nickname__preview(.nickname__avatar .nickname__name) .nickname__label [role=radiogroup].nickname__avatars > button.nickname__pic[role=radio]
//          .nickname__fields(label select.nickname__adj, label select.nickname__noun, label input.nickname__num)
//          button.nickname__shuffle .nickname__status .overlay__actions(button.nickname__save button.nickname__cancel)
import { formatDuration, formatNumber, t } from '../../i18n';
import { avatarSymbol, mountLadderArt } from '../art/ladder-art';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { arrowStep, closeButton, createOverlayShell, inlineDir, makeButton, nextId, setButtonLabel, setGated } from './overlay-base';
import '../../styles/ladder-chunk.css';

export interface NicknamePick {
  readonly adj: number;
  readonly noun: number;
  readonly num: number;
  readonly avatarId: number;
}

export interface NicknameSheetProps {
  /** NICK_WORDS_V1 (src/shared/nick-words.ts), passed by the app (ui/ imports shared/ for types only). */
  readonly words: { readonly adj: readonly string[]; readonly noun: readonly string[] };
  readonly current: NicknamePick;
  /** AVATAR_COUNT. */
  readonly avatarCount: number;
  readonly numMin: number;
  readonly numMax: number;
  readonly state: 'idle' | 'saving' | 'offline' | 'rejected' | 'cooldown';
  /** Device clock: the next allowed name change (state 'cooldown'). */
  readonly cooldownUntil: number | null;
  now(): number;
  /** A fresh random pick (the app's randomness; the UI has none). */
  shuffle(): NicknamePick;
  onSave(pick: NicknamePick): void;
  onClose(): void;
}

/** The rendered name: `${adj} ${noun} ${num}` (spec §1.8), "Cat {num}" when a word is missing. */
export function pickName(words: NicknameSheetProps['words'], p: NicknamePick): string {
  const adj = words.adj[p.adj];
  const noun = words.noun[p.noun];
  return adj && noun ? `${adj} ${noun} ${p.num}` : t('nick.fallback', { num: p.num });
}

/** Clamps a typed number into numMin … numMax (an empty or bad value keeps `fallback`). */
export function clampNum(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function createNicknameSheet(): OverlayView<NicknameSheetProps> {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  let props: NicknameSheetProps | null = null;
  let pick: NicknamePick = { adj: 0, noun: 0, num: 1, avatarId: 0 };
  let opened: NicknamePick = pick;
  const shell = createOverlayShell({ id: 'nickname', scrim: 'soft', panel: 'dialog', onScrimTap: () => void cancel() });
  shell.panel.classList.add('nickname');
  const L = createLocaleText();

  const title = L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('nick.title'));
  const close = L.attr(closeButton(() => props?.onClose()), 'aria-label', () => t('common.close'));
  const head = h('div', { class: 'overlay__head' }, h('span', { class: 'nickname__tag', 'aria-hidden': 'true' }, icon('nick-tag')), title, close);

  // The preview row: my picture and the name as other players will see it.
  const previewAvatar = h('span', { class: 'nickname__avatar', 'aria-hidden': 'true' });
  const previewName = h('span', { class: 'nickname__name', dir: 'auto' });
  const preview = h('p', { class: 'nickname__preview', id: shell.descId }, previewAvatar, previewName);
  let previewAvatarId = -1;

  // The pictures: a radio group of AVATAR_COUNT buttons.
  const picLabelId = nextId('nick-pic');
  const picLabel = L.text(h('p', { class: 'nickname__label', id: picLabelId }), () => t('nick.picture'));
  const pics = h('div', { class: 'nickname__avatars', role: 'radiogroup', 'aria-labelledby': picLabelId });
  let picButtons: HTMLButtonElement[] = [];

  // The pickers.
  const adjId = nextId('nick-adj');
  const nounId = nextId('nick-noun');
  const numId = nextId('nick-num');
  const adj = h('select', { class: 'nickname__adj', id: adjId });
  const noun = h('select', { class: 'nickname__noun', id: nounId });
  const num = h('input', { class: 'nickname__num num', id: numId, type: 'number', inputmode: 'numeric', step: '1' });
  const field = (id: string, label: () => string, control: HTMLElement): HTMLElement =>
    h('div', { class: 'nickname__field' }, L.text(h('label', { class: 'nickname__field-label', for: id }), label), control);
  const shuffle = L.label(
    makeButton({ variant: 'secondary', label: '', icon: 'icon-shuffle', className: 'nickname__shuffle', onPress: () => doShuffle() }),
    () => t('nick.shuffle'),
  );
  // A 2 × 2 grid: the two words, then the number and Shuffle.
  const fields = h(
    'div',
    { class: 'nickname__fields' },
    field(adjId, () => t('nick.first'), adj),
    field(nounId, () => t('nick.second'), noun),
    field(numId, () => t('nick.number'), num),
    shuffle,
  );
  const status = h('p', { class: 'nickname__status', role: 'status', 'aria-live': 'polite' });
  const save = L.label(
    makeButton({ variant: 'primary', label: '', block: true, className: 'nickname__save', onPress: () => doSave() }),
    () => t('nick.save'),
  );
  const cancelBtn = L.label(makeButton({ variant: 'ghost', label: '', className: 'nickname__cancel', onPress: () => void cancel() }), () => t('common.cancel'));
  shell.panel.append(head, preview, picLabel, pics, fields, status, h('div', { class: 'overlay__actions overlay__actions--stack' }, save, cancelBtn));

  let wordsKey = '';
  const fillWords = (p: NicknameSheetProps): void => {
    const key = `${p.words.adj.join('|')}#${p.words.noun.join('|')}`;
    if (key === wordsKey) return;
    wordsKey = key;
    for (const [sel, list] of [
      [adj, p.words.adj],
      [noun, p.words.noun],
    ] as const) {
      sel.textContent = '';
      list.forEach((w, i) => {
        // The words are ours and the same in every locale (glossary): textContent only.
        const o = h('option', { value: String(i), dir: 'auto' });
        o.textContent = w;
        sel.appendChild(o);
      });
    }
  };

  const fillPics = (count: number): void => {
    if (picButtons.length === count) return;
    pics.textContent = '';
    picButtons = [];
    for (let i = 0; i < count; i++) {
      const b = h('button', { type: 'button', class: 'nickname__pic', role: 'radio', 'aria-checked': 'false', dataset: { avatar: String(i) } }, icon(avatarSymbol(i), { class: 'nickname__pic-art' }));
      b.addEventListener('click', () => {
        if (busy()) return;
        setPick({ ...pick, avatarId: i });
      });
      picButtons.push(b);
      pics.appendChild(b);
    }
  };
  pics.addEventListener('keydown', (ev) => {
    const step = arrowStep(ev.key, inlineDir(pics) === 'rtl');
    if (!step || picButtons.length === 0 || busy()) return;
    ev.preventDefault();
    const next = (pick.avatarId + step + picButtons.length) % picButtons.length;
    setPick({ ...pick, avatarId: next });
    picButtons[next]?.focus();
  });

  adj.addEventListener('change', () => setPick({ ...pick, adj: Number(adj.value) }));
  noun.addEventListener('change', () => setPick({ ...pick, noun: Number(noun.value) }));
  const readNum = (): void => {
    if (!props) return;
    setPick({ ...pick, num: clampNum(num.value, props.numMin, props.numMax, pick.num) });
  };
  num.addEventListener('change', readNum);
  num.addEventListener('blur', readNum);

  const busy = (): boolean => props?.state === 'saving';
  const nameChanged = (): boolean => pick.adj !== opened.adj || pick.noun !== opened.noun || pick.num !== opened.num;
  const avatarChanged = (): boolean => pick.avatarId !== opened.avatarId;
  /** A name change waits for the cooldown; a picture-only change never does (spec §1.8). */
  const cooling = (): boolean => !!props && props.state === 'cooldown' && props.cooldownUntil !== null && props.cooldownUntil > props.now();

  function setPick(p: NicknamePick): void {
    pick = p;
    renderPick();
  }

  function renderPick(): void {
    if (!props) return;
    setText(previewName, pickName(props.words, pick));
    if (pick.avatarId !== previewAvatarId) {
      previewAvatarId = pick.avatarId;
      previewAvatar.textContent = '';
      previewAvatar.appendChild(icon(avatarSymbol(pick.avatarId), { class: 'nickname__avatar-art' }));
    }
    adj.value = String(pick.adj);
    noun.value = String(pick.noun);
    if (num.value !== String(pick.num)) num.value = String(pick.num);
    picButtons.forEach((b, i) => {
      const on = i === pick.avatarId;
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('aria-label', pictureLabel(i, picButtons.length));
      b.tabIndex = on ? 0 : -1;
      // The sheet opens on the chosen picture, the first control (Save starts gated: nothing changed yet).
      b.toggleAttribute('data-autofocus', on);
    });
    renderState();
  }

  function renderState(): void {
    if (!props) return;
    const p = props;
    shell.panel.dataset.state = p.state;
    let line = '';
    if (p.state === 'offline') line = t('nick.offline');
    else if (p.state === 'rejected') line = t('nick.rejected');
    // Said up front (not only once a word changed): the player knows before picking; pictures still save.
    else if (cooling()) line = t('nick.cooldown', { time: formatDuration((p.cooldownUntil ?? 0) - p.now()) });
    setText(status, line);
    status.hidden = line === '';
    const blocked = p.state === 'offline' || p.state === 'saving' || (cooling() && nameChanged()) || (!nameChanged() && !avatarChanged());
    setGated(save, blocked);
    // aria-busy needs the value "true" (an empty value reads as false).
    if (p.state === 'saving') save.setAttribute('aria-busy', 'true');
    else save.removeAttribute('aria-busy');
    const lock = p.state === 'saving';
    for (const c of [adj, noun, num] as const) c.disabled = lock || p.state === 'offline';
    setGated(shuffle, lock || p.state === 'offline');
    for (const b of picButtons) b.disabled = lock || p.state === 'offline';
  }

  function doShuffle(): void {
    if (!props || busy() || props.state === 'offline') return;
    const next = props.shuffle();
    setPick({ ...next, num: Math.max(props.numMin, Math.min(props.numMax, next.num)) });
  }

  function doSave(): void {
    if (!props) return;
    readNum();
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
    fillWords(p);
    fillPics(Math.max(0, Math.floor(p.avatarCount)));
    num.min = String(p.numMin);
    num.max = String(p.numMax);
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
      previewAvatarId = -1;
      render(p);
      shell.show();
    },
    update(p) {
      // A save that went through moves the baseline (the sheet may stay open on a later error).
      if (p.current.adj !== props?.current.adj || p.current.noun !== props?.current.noun || p.current.num !== props?.current.num || p.current.avatarId !== props?.current.avatarId) {
        opened = { ...p.current };
      }
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

/** "Picture 3 of 12" (radio names; exported for tests). */
export function pictureLabel(index: number, count: number): string {
  return t('nick.avatar.a11y', { index: formatNumber(index + 1), count: formatNumber(count) });
}
