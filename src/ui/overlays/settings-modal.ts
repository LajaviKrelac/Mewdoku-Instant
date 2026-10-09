// Owner: B (Phase 2b)
// O5 settings (02 §5 O5, §14) with the "About & credits" sub-view (version, font licence, privacy link).
// Toggles call onChange(patch) at once; the app saves and re-renders through update(). Esc in the
// About view returns to the list; otherwise Esc, × and scrim taps call onClose.
//
// Classes: .overlay[data-overlay=settings] > .overlay__panel--dialog.settings[data-view=main|about]
//          .settings__view .overlay__head .settings__list .settings-row(--link) .settings-row__label
//          .settings-row__note .switch(.switch__track .switch__knob .switch__state)
//          .segmented .segmented__opt .about__name .about__text .about__code .about__link
import type { LocaleId, ReduceMotionSetting, Settings } from '../../game/types';
import { t } from '../../i18n';
import { icon } from '../art/sprite';
import { h, setText, type OverlayView } from '../dom';
import { closeButton, createOverlayShell, makeButton, nextId } from './overlay-base';
// Vite's MIT notice for the one third-party helper in the bundle (LEGAL-3; docs/provenance.md §6).
import viteLicenceUrl from './licences/vite-MIT.txt?url';

export interface SettingsProps {
  readonly settings: Settings;
  /** capabilities().haptics; false hides "Vibration". */
  readonly showVibration: boolean;
  /** __APP_VERSION__. */
  readonly version: string;
  /** URL of the bundled OFL.txt (the app imports it with `?url`); the link is hidden when absent. */
  readonly fontLicenceUrl?: string;
  /** Privacy policy (Phase 4); "will be linked here" text when absent. */
  readonly privacyUrl?: string;
  /** Applied at once by the app (save 'touch'). */
  onChange(patch: Partial<Settings>): void;
  onHowToPlay(): void;
  onClose(): void;
  // ── phase2b rows (F0: typed and optional; B renders them, C passes them) ──
  /** Language row (§6.8): the saved override ('auto' = Automatic) and the locales this build contains (i18n buildLocales()). */
  readonly language?: { readonly current: 'auto' | LocaleId; readonly locales: readonly LocaleId[]; onPick(id: 'auto' | LocaleId): void };
  /** Shop row (§8.5). */
  onShop?(): void;
  /** Remove ads row: FB, payments ready, No Ads not owned (§8.5). Absent = row hidden. */
  onRemoveAds?(): void;
}

type SwitchKey = 'sound' | 'haptics' | 'patterns';
const MOTION_OPTIONS: readonly ReduceMotionSetting[] = ['system', 'on', 'off'];

function motionLabel(v: ReduceMotionSetting): string {
  return v === 'system' ? t('settings.reduceMotion.system') : v === 'on' ? t('settings.reduceMotion.on') : t('settings.reduceMotion.off');
}

export function createSettingsModal(): OverlayView<SettingsProps> {
  let props: SettingsProps | null = null;
  let view: 'main' | 'about' = 'main';
  const shell = createOverlayShell({ id: 'settings', scrim: 'soft', panel: 'dialog', onScrimTap: () => props?.onClose() });
  shell.panel.classList.add('settings');

  // ── main view ──
  const switches = new Map<SwitchKey, HTMLButtonElement>();
  const switchRow = (key: SwitchKey, label: string, note?: string): HTMLElement => {
    const id = nextId(`set-${key}`);
    const sw = h(
      'button',
      { type: 'button', class: 'switch', role: 'switch', id, 'aria-checked': 'false', dataset: { key } },
      h('span', { class: 'switch__state', 'aria-hidden': 'true' }),
      h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__knob' })),
    );
    sw.addEventListener('click', () => {
      if (!props) return;
      props.onChange({ [key]: !props.settings[key] } as Partial<Settings>);
    });
    switches.set(key, sw);
    return h(
      'div',
      { class: 'settings-row', dataset: { setting: key } },
      h('label', { class: 'settings-row__label', for: id }, label, note ? h('span', { class: 'settings-row__note' }, note) : null),
      sw,
    );
  };

  const motionLabelId = nextId('set-motion');
  const motionOpts = MOTION_OPTIONS.map((v) => {
    const opt = h('button', { type: 'button', class: 'segmented__opt', role: 'radio', 'aria-checked': 'false', dataset: { value: v } }, motionLabel(v));
    opt.addEventListener('click', () => {
      if (props && props.settings.reduceMotion !== v) props.onChange({ reduceMotion: v });
    });
    return opt;
  });
  const segmented = h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': motionLabelId }, motionOpts);
  segmented.addEventListener('keydown', (ev) => {
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!step || !props) return;
    ev.preventDefault();
    const i = MOTION_OPTIONS.indexOf(props.settings.reduceMotion);
    const nextIndex = (i + step + MOTION_OPTIONS.length) % MOTION_OPTIONS.length;
    const v = MOTION_OPTIONS[nextIndex] ?? 'system';
    motionOpts[nextIndex]?.focus();
    props.onChange({ reduceMotion: v });
  });

  const linkRow = (label: string, onPress: () => void, cls: string): HTMLButtonElement =>
    makeButton({
      variant: 'ghost',
      label,
      className: `settings-row settings-row--link ${cls}`,
      trailing: icon('icon-chevron', { class: 'btn__chev' }),
      onPress,
    });

  const vibrationRow = switchRow('haptics', t('settings.vibration'));
  const aboutLink = linkRow(t('settings.about'), () => showView('about'), 'settings__about-link');
  const mainView = h(
    'div',
    { class: 'settings__view settings__view--main' },
    h('div', { class: 'overlay__head' }, h('h2', { class: 'overlay__title', id: shell.titleId }, t('settings.title')), closeButton(() => props?.onClose())),
    h(
      'div',
      { class: 'settings__list', id: shell.descId },
      switchRow('sound', t('settings.sound')),
      vibrationRow,
      switchRow('patterns', t('settings.patterns'), t('settings.patterns.note')),
      h('div', { class: 'settings-row settings-row--motion' }, h('span', { class: 'settings-row__label', id: motionLabelId }, t('settings.reduceMotion')), segmented),
      linkRow(t('settings.howToPlay'), () => props?.onHowToPlay(), 'settings__howto-link'),
      aboutLink,
    ),
  );

  // ── about view ──
  const aboutTitleId = nextId('about-title');
  const version = h('p', { class: 'about__version' });
  const licence = h('a', { class: 'about__link', target: '_blank', rel: 'noopener noreferrer' }, t('about.fontLicence'));
  const privacy = h('p', { class: 'about__text about__privacy' });
  const back = makeButton({
    variant: 'icon',
    icon: 'icon-chevron',
    ariaLabel: t('common.back'),
    className: 'overlay__back',
    onPress: () => showView('main'),
  });
  const aboutView = h(
    'div',
    { class: 'settings__view settings__view--about', hidden: true, role: 'group', 'aria-labelledby': aboutTitleId },
    h('div', { class: 'overlay__head' }, back, h('h2', { class: 'overlay__title', id: aboutTitleId }, t('about.title')), closeButton(() => props?.onClose())),
    h('p', { class: 'about__name' }, t('app.name')),
    version,
    // The product name has one source, 'app.name' (LEGAL-1).
    h('p', { class: 'about__text' }, t('about.madeBy', { name: t('app.name') })),
    h('p', { class: 'about__text' }, t('about.font'), ' ', licence),
    h(
      'p',
      { class: 'about__text about__code' },
      t('about.code'),
      ' ',
      h('a', { class: 'about__link', href: viteLicenceUrl, target: '_blank', rel: 'noopener noreferrer' }, t('about.codeLicence')),
    ),
    privacy,
  );
  shell.panel.append(mainView, aboutView);

  function showView(v: 'main' | 'about', moveFocus = true): void {
    view = v;
    shell.panel.dataset.view = v;
    mainView.hidden = v !== 'main';
    aboutView.hidden = v !== 'about';
    shell.panel.setAttribute('aria-labelledby', v === 'main' ? shell.titleId : aboutTitleId);
    if (moveFocus) (v === 'about' ? back : aboutLink).focus();
  }

  const render = (p: SettingsProps): void => {
    props = p;
    for (const [key, sw] of switches) {
      const on = p.settings[key];
      sw.setAttribute('aria-checked', String(on));
      const state = sw.querySelector('.switch__state');
      if (state) setText(state, on ? t('common.on') : t('common.off'));
    }
    vibrationRow.hidden = !p.showVibration;
    motionOpts.forEach((opt, i) => {
      const checked = MOTION_OPTIONS[i] === p.settings.reduceMotion;
      opt.setAttribute('aria-checked', String(checked));
      opt.tabIndex = checked ? 0 : -1;
    });
    setText(version, t('about.version', { version: p.version }));
    if (p.fontLicenceUrl) licence.setAttribute('href', p.fontLicenceUrl);
    licence.hidden = !p.fontLicenceUrl;
    privacy.textContent = '';
    if (p.privacyUrl) {
      privacy.appendChild(h('a', { class: 'about__link', href: p.privacyUrl, target: '_blank', rel: 'noopener noreferrer' }, t('about.privacy')));
    } else {
      privacy.textContent = t('about.privacySoon');
    }
  };

  return {
    el: shell.el,
    modal: true,
    open(p) {
      render(p);
      showView('main', false);
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
      if (view === 'about') showView('main');
      else props.onClose();
      return true;
    },
    destroy() {
      props = null;
      shell.el.remove();
    },
  };
}
