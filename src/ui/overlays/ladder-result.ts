// Owner: G3 (Phase 2e)
// The end-of-ranking result card (overlay `ladder_result`, spec §2.6, §9.4; CONTRACTS §8). Opens on Home
// (never during play, over another modal or in the tutorial), one card per Home visit. Lazy `ladder` chunk.
//   paid:    "Ranking results" · "You finished #2 of 37." · "Your reward: +1 hint and +1 kitty"
//            · ▶ Collect ×2 (primary; only with rules.doubleByVideo and rewarded videos) · Collect
//   too_few: "You finished #1 of 3." · "Not enough players took part for rewards this time." · OK
//   none:    "You finished #12 of 37." · "Thanks for playing! The top 3 win hints and kitties." · OK
// Honesty (H-4): the place, the count and the reward are the server's frozen final standings; "the top 3"
// is rules.places.length (C-5). There is no free ×2: without rewarded videos the button is absent.
// While a claim or the video runs (`busy`) every button is disabled. Esc means "later" (onClose); a tap on
// the scrim does nothing (a choice is needed, and a stray tap must not drop a reward card).
// Classes: .overlay[data-overlay=ladder_result][data-case=paid|too_few|none] > .overlay__panel--dialog.ladder-result
//          > .ladder-result__art h2.overlay__title .ladder-result__place .ladder-result__line
//            .overlay__actions(button.ladder-result__double button.ladder-result__collect button.ladder-result__ok)
import type { Reward } from '../../game/events';
import { formatNumber, joinList, t, tn } from '../../i18n';
import { mountLadderArt } from '../art/ladder-art';
import { icon, type SymbolId } from '../art/sprite';
import { clear, h, setText, type OverlayView } from '../dom';
import { createLocaleText } from '../locale-text';
import { createOverlayShell, makeButton, setButtonLabel, setGated } from './overlay-base';
import '../../styles/ladder-chunk.css';

export interface LadderResultProps {
  readonly case: 'paid' | 'too_few' | 'none';
  /** My final rank (the server's). */
  readonly place: number;
  /** Visible members at finalisation (the server's final_members). */
  readonly members: number;
  /** The base grant ("Your reward: +1 hint and +1 kitty"); null unless paid. */
  readonly reward: { readonly hints: number; readonly kitties: number } | null;
  /** rules.doubleByVideo && rewarded videos supported. */
  readonly canDouble: boolean;
  /** rules.places.length: "The top {count} …" in the 'none' case (critic pass C-5). */
  readonly paidPlaces: number;
  /** A claim or the video in flight: every button disabled. */
  readonly busy: boolean;
  onCollect(): void;
  onDouble(): void;
  /** OK / Esc ("later"). */
  onClose(): void;
}

/** "+1 hint and +1 kitty" (the victory's reward phrase, kept here so the ladder chunk does not pull the victory in). */
export function grantText(r: Reward): string {
  const parts: string[] = [];
  if (r.hints) parts.push(t('fish.plus', { count: tn('event.reward.hints', r.hints, { count: formatNumber(r.hints) }) }));
  if (r.kitties) parts.push(t('fish.plus', { count: tn('event.reward.kitties', r.kitties, { count: formatNumber(r.kitties) }) }));
  return joinList(parts);
}

/** The card's second line per case (spec §2.6 table). */
export function resultLine(p: Pick<LadderResultProps, 'case' | 'reward' | 'paidPlaces'>): string {
  switch (p.case) {
    case 'paid':
      return p.reward ? t('ladder.result.reward', { reward: grantText(p.reward) }) : '';
    case 'too_few':
      return t('ladder.result.tooFew');
    case 'none':
      return tn('ladder.result.none', Math.max(1, p.paidPlaces), { count: formatNumber(Math.max(1, p.paidPlaces)) });
  }
}

export function createLadderResult(): OverlayView<LadderResultProps> {
  mountLadderArt(typeof document === 'undefined' ? undefined : document);
  let props: LadderResultProps | null = null;
  // Scrim taps are ignored on purpose (see the header); Esc is dismiss() → onClose ("later").
  const shell = createOverlayShell({ id: 'ladder_result', scrim: 'soft', panel: 'dialog' });
  shell.panel.classList.add('ladder-result');
  const L = createLocaleText();

  const art = h('div', { class: 'ladder-result__art', 'aria-hidden': 'true' });
  let artFor = '';
  const title = L.text(h('h2', { class: 'overlay__title', id: shell.titleId }), () => t('ladder.result.title'));
  const place = h('p', { class: 'ladder-result__place' });
  const line = h('p', { class: 'ladder-result__line' });
  const desc = h('div', { class: 'ladder-result__desc', id: shell.descId }, place, line);

  const double = makeButton({
    variant: 'primary',
    label: '',
    icon: 'icon-play-video',
    block: true,
    className: 'ladder-result__double',
    onPress: () => props?.onDouble(),
  });
  const collect = makeButton({ variant: 'secondary', label: '', block: true, className: 'ladder-result__collect', onPress: () => props?.onCollect() });
  const ok = makeButton({ variant: 'primary', label: '', block: true, className: 'ladder-result__ok', onPress: () => props?.onClose() });
  shell.panel.append(art, title, desc, h('div', { class: 'overlay__actions overlay__actions--stack' }, double, collect, ok));

  const setArt = (p: LadderResultProps): void => {
    const sym: SymbolId = p.case === 'paid' ? 'reward-chest' : p.place >= 1 && p.place <= 3 ? (`medal-${p.place}` as SymbolId) : 'icon-trophy';
    if (sym === artFor) return;
    artFor = sym;
    clear(art);
    art.appendChild(icon(sym, { class: 'ladder-result__art-icon' }));
  };

  const render = (p: LadderResultProps): void => {
    props = p;
    L.apply();
    shell.el.dataset.case = p.case;
    shell.panel.dataset.case = p.case;
    setArt(p);
    setText(place, t('ladder.result.place', { rank: formatNumber(p.place), count: formatNumber(p.members) }));
    setText(line, resultLine(p));
    const paid = p.case === 'paid' && p.reward !== null;
    double.hidden = !(paid && p.canDouble);
    collect.hidden = !paid;
    ok.hidden = paid;
    // Collect is the primary when there is no ×2 (orange); with ×2 it is the secondary under it.
    collect.classList.toggle('btn--primary', paid && !p.canDouble);
    collect.classList.toggle('btn--secondary', !(paid && !p.canDouble));
    setButtonLabel(double, t('ladder.collectDouble'));
    double.setAttribute('aria-label', t('ladder.collectDouble.a11y'));
    setButtonLabel(collect, t('ladder.collect'));
    setButtonLabel(ok, t('common.ok'));
    for (const b of [double, collect, ok]) {
      setGated(b, p.busy);
      if (p.busy) b.setAttribute('aria-busy', 'true');
      else b.removeAttribute('aria-busy');
    }
    // The router focuses [data-autofocus] on open: the first visible action.
    const first = !double.hidden ? double : !collect.hidden ? collect : ok;
    for (const b of [double, collect, ok]) b.toggleAttribute('data-autofocus', b === first);
  };

  L.watch(() => {
    if (props) render(props);
  });

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      shell.show();
    },
    update(p) {
      render(p);
    },
    close() {
      shell.hide();
    },
    dismiss() {
      if (!props || !shell.isOpen()) return false;
      // While a claim or the video runs, Esc waits (the card closes when the claim settles).
      if (!props.busy) props.onClose();
      return true;
    },
    destroy() {
      L.dispose();
      props = null;
      shell.el.remove();
    },
  };
}
