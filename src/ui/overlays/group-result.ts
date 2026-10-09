// Owner: B
// Group challenge result (new overlay `group_result`, phase2b §5.6), shown on the first launch after
// a challenge ended. Participation mode (default) says the challenge has FINISHED (group.finished),
// never that the player won. Offers "Take {count}" and, when a rewarded ad is available, "Watch a
// video for {count}" (4 in total, not 2 + 4). Rank mode (only if §14 G2 finds a standings API):
// rank 1 including ties wins kitties; others with ≥ 1 win get fish ("Thanks for playing: +10 fish").
// Esc takes the base reward (nothing is lost); the scrim ignores taps (a reward is waiting).
// Lazy overlay chunk.
//
// Classes: .overlay[data-overlay=group_result] > .overlay__panel--dialog.group-result[data-kind]
//          .group-result__icon .overlay__title .overlay__body .overlay__actions(.group-result__take .group-result__double)
import { formatNumber, t, tn } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { createOverlayShell, makeButton, setButtonLabel, setGated } from './overlay-base';

export type GroupResultOutcome =
  /** Participation mode: wins ≥ groups.minWinsForReward. */
  | { readonly kind: 'participation'; readonly kitties: number; readonly kittiesWithAd: number | null }
  /** Rank mode, place 1 (ties share it). */
  | { readonly kind: 'won'; readonly kitties: number; readonly kittiesWithAd: number | null }
  /** Rank mode, any other place: fish for taking part. */
  | { readonly kind: 'place'; readonly place: number; readonly count: number; readonly fish: number };

export interface GroupResultProps {
  readonly outcome: GroupResultOutcome;
  /** A grant or the video is in flight. */
  readonly busy: boolean;
  /** Take the base reward. */
  onTake(): void;
  /** Watch the `group_double` rewarded video (only when kittiesWithAd is not null). */
  onDouble(): void;
}

const kitties = (n: number): string => tn('event.reward.kitties', n, { count: formatNumber(n) });
const fish = (n: number): string => tn('fish.count', n, { count: formatNumber(n) });

/** The dialog's body text: participation never says "won" (§5.6). */
export function groupResultBody(o: GroupResultOutcome): string {
  switch (o.kind) {
    case 'participation':
      return t('group.finished');
    case 'won':
      return t('group.won');
    case 'place':
      return `${t('group.place', { place: formatNumber(o.place), count: formatNumber(o.count) })} ${t('group.participation', { count: formatNumber(o.fish) })}`;
  }
}

export function createGroupResult(): OverlayView<GroupResultProps> {
  let props: GroupResultProps | null = null;
  const shell = createOverlayShell({ id: 'group_result', scrim: 'soft', panel: 'dialog' });
  shell.panel.classList.add('group-result');

  const title = h('h2', { class: 'overlay__title', id: shell.titleId }, t('group.title'));
  const body = h('p', { class: 'overlay__body', id: shell.descId });
  const take = makeButton({ variant: 'primary', label: '', block: true, autofocus: true, className: 'group-result__take', onPress: () => props?.onTake() });
  const double = makeButton({
    variant: 'secondary',
    label: '',
    icon: 'icon-play-video',
    block: true,
    className: 'group-result__double',
    onPress: () => props?.onDouble(),
  });
  shell.panel.append(
    h('div', { class: 'group-result__icon', 'aria-hidden': 'true' }, icon('icon-users')),
    title,
    body,
    h('div', { class: 'overlay__actions overlay__actions--stack' }, take, double),
  );

  const render = (p: GroupResultProps): void => {
    props = p;
    const o = p.outcome;
    shell.panel.dataset.kind = o.kind;
    setText(body, groupResultBody(o));
    if (o.kind === 'place') {
      setButtonLabel(take, t('group.take', { count: fish(o.fish) }));
      double.hidden = true;
    } else {
      setButtonLabel(take, t('group.take', { count: kitties(o.kitties) }));
      double.hidden = o.kittiesWithAd === null;
      if (o.kittiesWithAd !== null) setButtonLabel(double, t('group.double', { count: kitties(o.kittiesWithAd) }));
    }
    setGated(take, p.busy);
    setGated(double, p.busy);
    shell.panel.setAttribute('aria-busy', String(p.busy));
  };

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
      if (!props || !shell.isOpen() || props.busy) return false;
      props.onTake();
      return true;
    },
    destroy() {
      props = null;
      shell.el.remove();
    },
  };
}
