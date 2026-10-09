// Owner: B (Phase 2b); G2 (Phase 2c: milestone rewards are hints and kitties only)
// Event screen (new screen `event`, phase2b §4.4), in the lazy `events` chunk: header art (A's
// eventArt(def, 'header'): pattern + Tux with the accessory), name and tagline, "Ends in …", the
// milestone track (5 nodes on a bar; reached nodes filled with the reward icon), the primary
// "Play puzzle {i}", "Top list" (FB: the ranking panel for the event board; web: personal results)
// and "Home". The root carries data-event-theme={def.id} (tokens.css blocks, A) and, with
// bannerReserved, data-banner (phase2b §3.2). Tab order: header → play → top list → home (§7); the
// top bar keeps only the Gear (Home is the ghost button at the bottom).
//
// Review fixes (UX-1): the actions are a footer outside the scrolling body, so Play, Top list and
// Home are always on screen, with Play at least ads.banner.buttonClearancePx above the banner band;
// the header and the track scroll above them. The static labels follow the language (A11Y-I18N-1).
//
// Classes: .screen.screen--event[data-event-theme][data-banner] > header.top-bar + main.event__body
//          > .event__header(.event-art .event__name .event__tagline .event__ends[data-soon])
//            .event__track(.event__track-title .event__rail(.event__rail-fill) ol.event__nodes > li.event__node[data-reached])
//            .event__progress; then the footer .event__actions(.event__done .event__play .event__top .event__home)
import { cfg } from '../../app/config';
import type { EventDef, Milestone, Reward } from '../../game/events';
import { formatNumber, t, tn, translate } from '../../i18n';
import { eventArt } from '../art/event-art';
import { icon, type IconSymbol } from '../art/sprite';
import { clear, h, setText, type View } from '../dom';
import { createTopBar, type TopBarProps } from '../hud/top-bar';
import { createLocaleText } from '../locale-text';
import { makeButton, setButtonLabel } from '../overlays/overlay-base';
import { formatDaysHours } from './home-screen';

export interface EventTrackNodeView extends Milestone {
  readonly reached: boolean;
}

export interface EventScreenView {
  readonly def: EventDef;
  /** Device clock now and the event's end (epoch ms), for "Ends in 3 d 4 h" / "Ends soon!" (events.cardEndsSoonHours). */
  readonly now: number;
  readonly endsAt: number;
  readonly solved: number;
  /** def.puzzles.count. */
  readonly total: number;
  readonly track: readonly EventTrackNodeView[];
  /** Next puzzle to play, 0-based (the button shows index + 1); null when all are solved. */
  readonly nextIndex: number | null;
  readonly fbSafeZone: boolean;
  readonly reducedMotion: boolean;
  /** phase2b §3.2: the banner band is reserved on this screen. */
  readonly bannerReserved: boolean;
}

export interface EventScreenCallbacks {
  onPlay(): void;
  onTopList(): void;
  onHome(): void;
  onSettings(): void;
}

/** The milestone's reward as short text ("2 hints", "3 hints and 5 kitties"). Phase 2c: no fish. */
export function milestoneRewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.hints) parts.push(tn('event.reward.hints', r.hints, { count: formatNumber(r.hints) }));
  if (r.kitties) parts.push(tn('event.reward.kitties', r.kitties, { count: formatNumber(r.kitties) }));
  return parts.join(' + ');
}

/** The icon a milestone node shows: its first reward kind. */
function rewardIcon(r: Reward): IconSymbol {
  if (r.kitties) return 'icon-paw';
  return 'icon-bulb';
}

/** "Ends in 3 d 4 h", or "Ends soon!" in the last events.cardEndsSoonHours (§4.6). */
export function endsText(now: number, endsAt: number): { readonly text: string; readonly soon: boolean } {
  const left = endsAt - now;
  const soon = left <= cfg.events.cardEndsSoonHours * 3_600_000;
  return { text: soon ? t('event.card.endsSoon') : t('event.card.endsIn', { time: formatDaysHours(left) }), soon };
}

export function createEventScreen(view: EventScreenView, cb: EventScreenCallbacks): View<EventScreenView> {
  const topBarProps = (v: EventScreenView): TopBarProps => ({
    title: null,
    hard: false,
    showHome: false,
    showSettings: true,
    showTrophy: false,
    fbSafeZone: v.fbSafeZone,
  });
  const topBar = createTopBar(topBarProps(view), { onHome: () => cb.onHome(), onSettings: () => cb.onSettings(), onTrophy: () => undefined });

  const artHost = h('div', { class: 'event__art', 'aria-hidden': 'true' });
  const name = h('h1', { class: 'event__name' });
  const tagline = h('p', { class: 'event__tagline' });
  const ends = h('p', { class: 'event__ends' });
  const header = h('div', { class: 'event__header' }, artHost, name, tagline, ends);

  const railFill = h('span', { class: 'event__rail-fill' });
  const nodes = h('ol', { class: 'event__nodes' });
  const progress = h('p', { class: 'event__progress num' });
  const L = createLocaleText();
  const track = h(
    'section',
    { class: 'event__track', 'aria-labelledby': 'event-track-title' },
    L.text(h('h2', { class: 'event__track-title', id: 'event-track-title' }), () => t('event.track.title')),
    h('div', { class: 'event__rail', 'aria-hidden': 'true' }, railFill),
    nodes,
    progress,
  );

  const play = makeButton({ variant: 'primary', label: '', block: true, autofocus: true, className: 'btn--lg event__play', onPress: () => cb.onPlay() });
  const done = h('p', { class: 'event__done' });
  const top = L.label(
    makeButton({ variant: 'secondary', label: '', icon: 'icon-trophy', block: true, className: 'event__top', onPress: () => cb.onTopList() }),
    () => t('event.topList'),
  );
  const home = L.label(
    makeButton({ variant: 'ghost', label: '', icon: 'icon-house', className: 'event__home', onPress: () => cb.onHome() }),
    () => t('common.home'),
  );

  const el = h(
    'div',
    { class: 'screen screen--event' },
    topBar.el,
    h('main', { class: 'event__body' }, header, track),
    h('div', { class: 'event__actions' }, done, play, top, home),
  );

  let artFor: string | null = null;
  let trackKey = '';

  const renderTrack = (v: EventScreenView): void => {
    const total = Math.max(1, v.total);
    const key = v.track.map((n) => `${n.at}:${n.reached ? 1 : 0}`).join(',') + `|${total}`;
    if (key !== trackKey) {
      trackKey = key;
      clear(nodes);
      let prevAt = 0;
      for (const n of v.track) {
        const reward = milestoneRewardText(n.reward);
        // Each node spans the rail from the previous milestone to its own; its dot sits at the span's end.
        const seg = Math.min(1, Math.max(0, (n.at - prevAt) / total));
        prevAt = Math.max(prevAt, n.at);
        nodes.appendChild(
          h(
            'li',
            {
              class: 'event__node',
              'data-reached': n.reached,
              style: { '--seg': seg.toFixed(4) },
              'aria-label': n.reached ? t('event.track.reached', { at: n.at, reward }) : t('event.track.node', { at: n.at, reward }),
            },
            h('span', { class: 'event__node-dot', 'aria-hidden': 'true' }, icon(rewardIcon(n.reward), { class: 'event__node-icon' })),
            h('span', { class: 'event__node-at num', 'aria-hidden': 'true' }, formatNumber(n.at)),
          ),
        );
      }
    }
    // Widths, not scales: the rail and the node row follow the inline direction in RTL (§6.5).
    railFill.style.width = `${(Math.min(1, Math.max(0, v.solved / total)) * 100).toFixed(2)}%`;
    setText(progress, t('event.card.progress', { solved: formatNumber(v.solved), total: formatNumber(v.total) }));
  };

  let last = view;
  const render = (v: EventScreenView): void => {
    last = v;
    L.apply();
    topBar.update(topBarProps(v));
    el.dataset.eventTheme = v.def.id;
    el.toggleAttribute('data-banner', v.bannerReserved);
    el.style.setProperty('--banner-reserve', `${cfg.ads.banner.reservePx}px`);
    if (artFor !== v.def.id) {
      artFor = v.def.id;
      clear(artHost);
      try {
        artHost.appendChild(eventArt(v.def, 'header'));
      } catch {
        // Decorative: the screen works without it.
      }
    }
    setText(name, translate(v.def.nameKey));
    setText(tagline, translate(v.def.taglineKey));
    const e = endsText(v.now, v.endsAt);
    setText(ends, e.text);
    ends.toggleAttribute('data-soon', e.soon);
    renderTrack(v);
    const allDone = v.nextIndex === null;
    play.hidden = allDone;
    done.hidden = !allDone;
    setText(done, t('event.card.done'));
    if (!allDone) setButtonLabel(play, t('event.play', { index: (v.nextIndex ?? 0) + 1 }));
    // With everything solved, Top list takes the first focus.
    play.toggleAttribute('data-autofocus', !allDone);
    top.toggleAttribute('data-autofocus', allDone);
    el.toggleAttribute('data-reduced', v.reducedMotion);
  };
  render(view);
  // Settings → Language over the event screen (A11Y-I18N-1): the milestone labels are rebuilt too.
  L.watch(() => {
    trackKey = '';
    render(last);
  });

  return {
    el,
    update: render,
    destroy() {
      L.dispose();
      topBar.destroy();
      el.remove();
    },
  };
}
