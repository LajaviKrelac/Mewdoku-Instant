// Owner: B (Phase 2b)
// O5 settings (02 §5 O5, §14) with the "About & credits" sub-view (version, font licence, privacy link).
// Toggles call onChange(patch) at once; the app saves and re-renders through update(). Esc in a
// sub-view returns to the list; otherwise Esc, × and scrim taps call onClose.
// Phase 2b rows (§6.8, §8.5): Language (a sub-view listing "Automatic" and the endonyms of the
// locales this build contains, a radio group), Shop and Remove ads. Each is shown only when its prop
// is present (no look rows: one theme, §1.9).
//
// Classes: .overlay[data-overlay=settings] > .overlay__panel--dialog.settings[data-view=main|about|language]
//          .settings__view .overlay__head .settings__list .settings-row(--link) .settings-row__label
//          .settings-row__note .settings-row__value .switch(.switch__track .switch__knob .switch__state)
//          .segmented .segmented__opt .about__name .about__text .about__code .about__link
//          .lang-list > .lang-opt[aria-checked]
import type { LocaleId, ReduceMotionSetting, Settings } from '../../game/types';
import { t, translate, type I18nKey } from '../../i18n';
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
type SettingsView = 'main' | 'about' | 'language';

/** "Automatic" or the locale's endonym (locale.name.<id>, E's catalogue). */
export function languageName(id: 'auto' | LocaleId): string {
  return id === 'auto' ? t('settings.language.auto') : translate(`locale.name.${id}` as I18nKey);
}
const MOTION_OPTIONS: readonly ReduceMotionSetting[] = ['system', 'on', 'off'];

function motionLabel(v: ReduceMotionSetting): string {
  return v === 'system' ? t('settings.reduceMotion.system') : v === 'on' ? t('settings.reduceMotion.on') : t('settings.reduceMotion.off');
}

export function createSettingsModal(): OverlayView<SettingsProps> {
  let props: SettingsProps | null = null;
  let view: SettingsView = 'main';
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

  const linkRow = (label: string, onPress: () => void, cls: string, value?: HTMLElement): HTMLButtonElement =>
    makeButton({
      variant: 'ghost',
      label,
      className: `settings-row settings-row--link ${cls}`,
      trailing: [value ?? null, icon('icon-chevron', { class: 'btn__chev' })],
      onPress,
    });

  // ── phase2b rows ──
  const languageValue = h('span', { class: 'settings-row__value' });
  const languageLink = linkRow(t('settings.language'), () => showView('language'), 'settings__language-link', languageValue);
  const shopLink = linkRow(t('settings.shop'), () => props?.onShop?.(), 'settings__shop-link');
  const removeAdsLink = linkRow(t('settings.removeAds'), () => props?.onRemoveAds?.(), 'settings__removeads-link');

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
      languageLink,
      shopLink,
      removeAdsLink,
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
  // ── language view (§6.8): a radio group of "Automatic" + the build's locales ──
  const langTitleId = nextId('lang-title');
  const langBack = makeButton({
    variant: 'icon',
    icon: 'icon-chevron',
    ariaLabel: t('common.back'),
    className: 'overlay__back',
    onPress: () => showView('main'),
  });
  const langList = h('div', { class: 'lang-list', role: 'radiogroup', 'aria-labelledby': langTitleId });
  const langView = h(
    'div',
    { class: 'settings__view settings__view--language', hidden: true, role: 'group', 'aria-labelledby': langTitleId },
    h('div', { class: 'overlay__head' }, langBack, h('h2', { class: 'overlay__title', id: langTitleId }, t('settings.language')), closeButton(() => props?.onClose())),
    langList,
  );
  let langKey = '';
  const langOpts: HTMLButtonElement[] = [];
  const langIds: ('auto' | LocaleId)[] = [];
  const pickLanguage = (id: 'auto' | LocaleId): void => {
    const l = props?.language;
    if (l && l.current !== id) l.onPick(id);
  };
  langList.addEventListener('keydown', (ev) => {
    const step = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
    if (!step || langOpts.length === 0) return;
    ev.preventDefault();
    const i = langOpts.indexOf(ev.target as HTMLButtonElement);
    const next = (Math.max(0, i) + step + langOpts.length) % langOpts.length;
    langOpts[next]?.focus();
    const id = langIds[next];
    if (id) pickLanguage(id);
  });
  const renderLanguages = (l: NonNullable<SettingsProps['language']>): void => {
    const key = l.locales.join(',');
    if (key !== langKey) {
      langKey = key;
      langList.textContent = '';
      langOpts.length = 0;
      langIds.length = 0;
      for (const id of ['auto' as const, ...l.locales]) {
        const opt = h(
          'button',
          { type: 'button', class: 'lang-opt', role: 'radio', 'aria-checked': 'false', lang: id === 'auto' ? null : id, dataset: { locale: id } },
          h('span', { class: 'lang-opt__name' }, languageName(id)),
          h('span', { class: 'lang-opt__check', 'aria-hidden': 'true' }),
        );
        opt.addEventListener('click', () => pickLanguage(id));
        langOpts.push(opt);
        langIds.push(id);
        langList.appendChild(opt);
      }
    }
    langOpts.forEach((opt, i) => {
      const on = langIds[i] === l.current;
      opt.setAttribute('aria-checked', String(on));
      opt.tabIndex = on ? 0 : -1;
    });
  };

  shell.panel.append(mainView, aboutView, langView);

  function showView(v: SettingsView, moveFocus = true): void {
    const from = view;
    view = v;
    shell.panel.dataset.view = v;
    mainView.hidden = v !== 'main';
    aboutView.hidden = v !== 'about';
    langView.hidden = v !== 'language';
    shell.panel.setAttribute('aria-labelledby', v === 'main' ? shell.titleId : v === 'about' ? aboutTitleId : langTitleId);
    if (!moveFocus) return;
    if (v === 'about') back.focus();
    else if (v === 'language') (langOpts.find((o) => o.tabIndex === 0) ?? langBack).focus();
    else (from === 'language' ? languageLink : aboutLink).focus();
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
    languageLink.hidden = !p.language;
    if (p.language) {
      setText(languageValue, languageName(p.language.current));
      renderLanguages(p.language);
    }
    shopLink.hidden = !p.onShop;
    removeAdsLink.hidden = !p.onRemoveAds;
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
      if (view !== 'main') showView('main');
      else props.onClose();
      return true;
    },
    destroy() {
      props = null;
      shell.el.remove();
    },
  };
}
