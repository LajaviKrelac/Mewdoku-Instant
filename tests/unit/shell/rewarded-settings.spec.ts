// Owner: B (Phase 2b; was ui-shell); G3 (Phase 2d: the mouse). O2 rewarded prompt variants (02 §13.3) and O5 settings callbacks (02 §14).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../src/game/types';
import { countdownText, createRewardedPrompt, type RewardedPromptProps } from '../../../src/ui/overlays/rewarded-prompt';
import { createSettingsModal, type SettingsProps } from '../../../src/ui/overlays/settings-modal';

const q = <E extends Element = HTMLElement>(root: ParentNode, sel: string): E => {
  const el = root.querySelector<E>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const press = (el: Element): void => void (el as HTMLElement).click();
const visible = (el: HTMLElement): boolean => !el.hidden;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.textContent = '';
});
afterEach(() => vi.useRealTimers());

describe('O2 rewarded prompt', () => {
  const props = (over: Partial<RewardedPromptProps> = {}): RewardedPromptProps => ({
    placement: 'hint',
    variant: 'video',
    nextFreeAt: 0,
    now: () => 0,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    ...over,
  });

  it('video variant: Watch video + Not now', () => {
    const o2 = createRewardedPrompt();
    document.body.append(o2.el);
    const p = props();
    o2.open(p);
    expect(q(o2.el, '.overlay__title').textContent).toBe('Out of hints');
    expect(q(o2.el, '.overlay__body').textContent).toBe('Watch a short video for 1 hint?');
    const accept = q(o2.el, '.rewarded__accept');
    expect(accept.textContent).toBe('Watch video');
    expect(accept.querySelector('.icon-play-video')).not.toBeNull();
    expect(visible(q(o2.el, '.rewarded__decline'))).toBe(true);
    expect(visible(q(o2.el, '.rewarded__ok'))).toBe(false);
    press(accept);
    press(q(o2.el, '.rewarded__decline'));
    expect(p.onAccept).toHaveBeenCalledTimes(1);
    expect(p.onDecline).toHaveBeenCalledTimes(1);
    expect(o2.dismiss()).toBe(true);
    press(q(o2.el, '.overlay__scrim'));
    expect(p.onDecline).toHaveBeenCalledTimes(3);
  });

  it('Phase 2d §1.12: the mouse — "Call the mouse?", its video, free and countdown lines, and the helpers\' own art', () => {
    const o2 = createRewardedPrompt();
    document.body.append(o2.el);
    o2.open(props({ placement: 'mouse', variant: 'video' }));
    expect(q(o2.el, '.overlay__title').textContent).toBe('Call the mouse?');
    expect(q(o2.el, '.overlay__body').textContent).toBe('Watch a short video and the mouse crosses out 3 tiles that have no cat.');
    expect(q(o2.el, '.rewarded').dataset.placement).toBe('mouse');
    expect(q(o2.el, '.rewarded__icon use').getAttribute('href')).toBe('#tool-mouse');
    o2.update(props({ placement: 'mouse', variant: 'free' }));
    expect(q(o2.el, '.overlay__body').textContent).toBe('The mouse is free this time.');
    expect(q(o2.el, '.rewarded__accept').textContent).toBe('Take it');
    o2.update(props({ placement: 'mouse', variant: 'countdown', nextFreeAt: 65_000 }));
    expect(q(o2.el, '.overlay__body').textContent).toBe('The mouse is back in 1:05');
    // Phase 2d: every placement shows its helper's full-colour art.
    o2.update(props({ placement: 'hint' }));
    expect(q(o2.el, '.rewarded__icon use').getAttribute('href')).toBe('#tool-bulb');
    o2.update(props({ placement: 'kitty' }));
    expect(q(o2.el, '.rewarded__icon use').getAttribute('href')).toBe('#tool-kitty');
    o2.destroy();
  });

  it('free fallback variant for the kitty: Take it + Not now, no video icon', () => {
    const o2 = createRewardedPrompt();
    document.body.append(o2.el);
    o2.open(props({ placement: 'kitty', variant: 'free' }));
    expect(q(o2.el, '.overlay__title').textContent).toBe('Out of kitties');
    expect(q(o2.el, '.overlay__body').textContent).toBe("Here's a free kitty.");
    const accept = q(o2.el, '.rewarded__accept');
    expect(accept.textContent).toBe('Take it');
    expect(accept.querySelector('.icon-play-video')).toBeNull();
    expect(visible(q(o2.el, '.rewarded__decline'))).toBe(true);
  });

  it('countdown variant: live m:ss and OK only', () => {
    let now = 1_000_000;
    const p = props({ variant: 'countdown', nextFreeAt: now + 9 * 60_000 + 59_500, now: () => now });
    const o2 = createRewardedPrompt();
    document.body.append(o2.el);
    o2.open(p);
    const body = q(o2.el, '.overlay__body');
    expect(body.textContent).toBe('Next free hint in 10:00');
    expect(visible(q(o2.el, '.rewarded__accept'))).toBe(false);
    expect(visible(q(o2.el, '.rewarded__decline'))).toBe(false);
    const ok = q(o2.el, '.rewarded__ok');
    expect(visible(ok)).toBe(true);
    expect(ok.hasAttribute('data-autofocus')).toBe(true);
    now += 61_000;
    vi.advanceTimersByTime(250);
    expect(body.textContent).toBe('Next free hint in 8:59');
    press(ok);
    expect(p.onDecline).toHaveBeenCalledTimes(1);
    expect(p.onAccept).not.toHaveBeenCalled();
    // Switching to another variant stops the countdown.
    o2.update(props({ variant: 'video' }));
    now += 5_000;
    vi.advanceTimersByTime(1000);
    expect(body.textContent).toBe('Watch a short video for 1 hint?');
  });

  it('formats the countdown rounded up, never negative', () => {
    expect(countdownText(10_000, 0)).toBe('0:10');
    expect(countdownText(10_000, 9_001)).toBe('0:01');
    expect(countdownText(10_000, 10_000)).toBe('0:00');
    expect(countdownText(10_000, 20_000)).toBe('0:00');
    expect(countdownText(600_000, 0)).toBe('10:00');
  });
});

describe('O5 settings', () => {
  const base: Settings = { sound: true, haptics: true, patterns: false, reduceMotion: 'system' };
  const props = (over: Partial<SettingsProps> = {}): SettingsProps => ({
    settings: base,
    showVibration: true,
    version: '0.1.0',
    onChange: vi.fn(),
    onHowToPlay: vi.fn(),
    onClose: vi.fn(),
    ...over,
  });
  const sw = (root: HTMLElement, key: string): HTMLElement => q(root, `.settings-row[data-setting="${key}"] [role="switch"]`);

  it('switches report their state and toggle through onChange', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    const p = props();
    modal.open(p);
    expect(sw(modal.el, 'sound').getAttribute('aria-checked')).toBe('true');
    expect(sw(modal.el, 'patterns').getAttribute('aria-checked')).toBe('false');
    expect(sw(modal.el, 'sound').textContent).toContain('On');
    press(sw(modal.el, 'sound'));
    expect(p.onChange).toHaveBeenLastCalledWith({ sound: false });
    press(sw(modal.el, 'haptics'));
    expect(p.onChange).toHaveBeenLastCalledWith({ haptics: false });
    press(sw(modal.el, 'patterns'));
    expect(p.onChange).toHaveBeenLastCalledWith({ patterns: true });
    // The app re-renders with the saved settings.
    modal.update(props({ settings: { ...base, sound: false, patterns: true } }));
    expect(sw(modal.el, 'sound').getAttribute('aria-checked')).toBe('false');
    expect(sw(modal.el, 'sound').textContent).toContain('Off');
    expect(sw(modal.el, 'patterns').getAttribute('aria-checked')).toBe('true');
  });

  it('clicking a row label toggles its switch', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    const p = props();
    modal.open(p);
    press(q(modal.el, '.settings-row[data-setting="patterns"] label'));
    expect(p.onChange).toHaveBeenLastCalledWith({ patterns: true });
  });

  it('hides Vibration when the platform cannot vibrate', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    modal.open(props({ showVibration: false }));
    expect(q(modal.el, '.settings-row[data-setting="haptics"]').hidden).toBe(true);
  });

  it('reduce motion is a System / On / Off radio group with arrow keys', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    const p = props();
    modal.open(p);
    const radios = Array.from(modal.el.querySelectorAll<HTMLElement>('[role="radio"]'));
    expect(radios.map((r) => r.textContent)).toEqual(['System', 'On', 'Off']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    press(radios[2] as HTMLElement);
    expect(p.onChange).toHaveBeenLastCalledWith({ reduceMotion: 'off' });
    press(radios[0] as HTMLElement); // already selected: no change
    expect(p.onChange).toHaveBeenCalledTimes(1);
    q(modal.el, '[role="radiogroup"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(p.onChange).toHaveBeenLastCalledWith({ reduceMotion: 'on' });
    q(modal.el, '[role="radiogroup"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(p.onChange).toHaveBeenLastCalledWith({ reduceMotion: 'off' });
  });

  it('How to play, close, and Esc / scrim', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    const p = props();
    modal.open(p);
    press(q(modal.el, '.settings__howto-link'));
    expect(p.onHowToPlay).toHaveBeenCalledTimes(1);
    press(q(modal.el, '.settings__view--main .overlay__close'));
    expect(modal.dismiss()).toBe(true);
    press(q(modal.el, '.overlay__scrim'));
    expect(p.onClose).toHaveBeenCalledTimes(3);
  });

  it('About & credits: version, font licence credit, privacy note; Esc goes back first', () => {
    const modal = createSettingsModal();
    document.body.append(modal.el);
    const p = props({ fontLicenceUrl: 'assets/OFL.txt' });
    modal.open(p);
    const about = q(modal.el, '.settings__view--about');
    expect(about.hidden).toBe(true);
    press(q(modal.el, '.settings__about-link'));
    expect(about.hidden).toBe(false);
    expect(q(modal.el, '.settings__view--main').hidden).toBe(true);
    expect(document.activeElement).toBe(q(modal.el, '.overlay__back'));
    expect(about.textContent).toContain('Version 0.1.0');
    expect(about.textContent).toContain('SIL Open Font License 1.1');
    expect(q<HTMLAnchorElement>(about, '.about__link').getAttribute('href')).toBe('assets/OFL.txt');
    expect(about.textContent).toContain('Our privacy policy will be linked here.');
    expect(modal.dismiss()).toBe(true); // back to the list, not closed
    expect(p.onClose).not.toHaveBeenCalled();
    expect(about.hidden).toBe(true);
    expect(modal.dismiss()).toBe(true);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    // Re-opening always starts on the list; without a URL the licence link is hidden.
    press(q(modal.el, '.settings__about-link'));
    modal.open(props({ privacyUrl: 'https://example.invalid/privacy' }));
    expect(about.hidden).toBe(true);
    expect(q(about, '.about__link').hidden).toBe(true);
    expect(q<HTMLAnchorElement>(about, '.about__privacy a').getAttribute('href')).toBe('https://example.invalid/privacy');
  });
});
