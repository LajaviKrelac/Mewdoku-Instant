// Owner: lead (preview link, 2026-10-11). The preview build's pieces other than the sample server: the seeded saves
// (valid as stored saves: the load's validation repairs nothing), the menu's operations on storage, ?preview=<op>,
// the fetch route to the sample origin, the mock store (catalogue, confirm sheet, unconsumed until consume), the ad
// presenter (an interstitial closable after 2 s, a video that grants after 3 s or is skipped), the mock ads' seams in
// src/platform/web/mock-ads.ts, the "sample players" lines and the menu.
import { describe, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../../src/app/clock';
import { cfg } from '../../../src/app/config';
import { DEVICE_KEY } from '../../../src/app/ladder-client';
import { ROWS_KEY } from '../../../src/app/ladder-flow';
import { RC_KEY } from '../../../src/app/remote-config';
import { streakView, countWin } from '../../../src/game/day-streak';
import { dailyCardState, dailyDateKey, isDailyUnlocked } from '../../../src/game/progression';
import { migrateReport } from '../../../src/game/save';
import { createMockAds, createMockBanner } from '../../../src/platform/web/mock-ads';
import { createPreviewAds, previewPresenter } from '../../../preview/ads';
import { labelSamples, watchSampleLabels } from '../../../preview/labels';
import { confirmSheet, createPreviewPayments, PREVIEW_CATALOG, PURCHASES_KEY } from '../../../preview/payments';
import { APP_KEYS, applyOp, opUrl, readUi, routeSampleFetch, takeOp, UI_KEY } from '../../../preview/platform';
import { mountRibbon, PREVIEW_OPS } from '../../../preview/ribbon';
import { loadState, SAMPLE_STATE_KEY } from '../../../preview/sample-state';
import { outOfHelpersSave, RETURNING, returningSave } from '../../../preview/scenarios';
import { PREVIEW_MARKERS, S } from '../../../preview/strings';
import { drain, MemoryStorage, track } from '../platform/helpers';

const NOW = new Date(2026, 9, 11, 15, 30).getTime(); // a local afternoon

describe('the seeded saves (preview/scenarios.ts)', () => {
  it('the returning player is a valid stored save: level 37, 36 done, 3 hints, 2 kitties, 26 fish this week; nothing repaired', () => {
    const s = returningSave(NOW);
    const r = migrateReport(JSON.parse(JSON.stringify(s)), NOW);
    expect(r.outcome).toBe('ok');
    expect(r.repairedFields).toEqual([]);
    expect(s).toMatchObject({ tutorialDone: true, progress: { level: 37, completed: 36 }, stock: { hints: 3, kitties: 2 } });
    expect(s.period.total).toBe(RETURNING.weekFish);
  });

  it('the streak is on day 6 of 7 with today open, so the next win counts day 7 and pays 2 hints + 2 kitties', () => {
    const s = returningSave(NOW);
    const today = dailyDateKey(NOW);
    expect(streakView(s.dayStreak, today)).toMatchObject({ day: 6, total: 7, todayDone: false, alive: true });
    const next = countWin(s.dayStreak, today);
    expect(next).toMatchObject({ counted: true, day: 7, reward: { hints: 2, kitties: 2 } });
  });

  it('the daily is unlocked and today’s is not played yet', () => {
    const s = returningSave(NOW);
    expect(isDailyUnlocked(s)).toBe(true);
    expect(dailyCardState(s, dailyDateKey(NOW))).toBe('not_played');
  });

  it('out of helpers: the current save with 0 hints and 0 kitties; a first-run save becomes the returning player first', () => {
    const cur = { ...returningSave(NOW), progress: { level: 50, completed: 49, best: {} } };
    expect(outOfHelpersSave(cur, NOW)).toMatchObject({ progress: { level: 50 }, stock: { hints: 0, kitties: 0 } });
    const fresh = outOfHelpersSave(null, NOW);
    expect(fresh).toMatchObject({ tutorialDone: true, progress: { level: 37 }, stock: { hints: 0, kitties: 0 } });
    expect(migrateReport(JSON.parse(JSON.stringify(fresh)), NOW).repairedFields).toEqual([]);
  });
});

describe('the menu operations (preview/platform.ts applyOp)', () => {
  const filled = (): MemoryStorage => {
    const st = new MemoryStorage();
    st.setItem(cfg.save.storageKey, JSON.stringify(returningSave(NOW - 86_400_000)));
    st.setItem(DEVICE_KEY, '{"id":"x","secret":"y"}');
    st.setItem(ROWS_KEY, '{}');
    st.setItem(PURCHASES_KEY, '[]');
    st.setItem(RC_KEY, '{}');
    st.setItem('other.app.key', 'kept');
    return st;
  };

  it('the app keys it clears are the app’s own (DEVICE_KEY, ROWS_KEY, RC_KEY)', () => {
    expect(APP_KEYS).toEqual({ device: DEVICE_KEY, rows: ROWS_KEY, remote: RC_KEY });
  });

  it('New player: no save (the tutorial), a new device for the sample server, no purchases; the override starts it fresh', () => {
    const st = filled();
    const r = applyOp('new', st, NOW, null);
    expect(r.load).toEqual({ save: null });
    expect(st.getItem(cfg.save.storageKey)).toBeNull();
    expect(st.getItem(DEVICE_KEY)).toBeNull();
    expect(st.getItem(PURCHASES_KEY)).toBeNull();
    expect(loadState(st).pending).toEqual({ returning: false, endDay: false });
    expect(r.ui).toMatchObject({ scenario: 'new', dayEnded: false });
  });

  it('Returning player: the seeded save written and handed to the load; the sample server seeds the next new player', () => {
    const st = filled();
    const r = applyOp('returning', st, NOW, { v: 1, open: false, scenario: 'new', dayEnded: false });
    expect(r.load?.save?.progress.level).toBe(37);
    expect(JSON.parse(st.getItem(cfg.save.storageKey) as string).progress.level).toBe(37);
    expect(st.getItem(DEVICE_KEY)).toBeNull();
    expect(loadState(st).pending.returning).toBe(true);
    expect(r.ui).toEqual({ v: 1, open: false, scenario: 'returning', dayEnded: false });
  });

  it('Out of helpers keeps the player (and the ranking) and empties the stock', () => {
    const st = filled();
    const r = applyOp('outOfHelpers', st, NOW, null);
    expect(r.load?.save?.stock).toEqual({ hints: 0, kitties: 0 });
    expect(st.getItem(DEVICE_KEY)).not.toBeNull();
    expect(loadState(st).pending.returning).toBe(false);
  });

  it('End ranking day: only the sample server’s queued op (and the rows cache); the save is untouched', () => {
    const st = filled();
    const before = st.getItem(cfg.save.storageKey);
    const r = applyOp('endDay', st, NOW, { v: 1, open: true, scenario: 'returning', dayEnded: false });
    expect(r.load).toBeNull();
    expect(st.getItem(cfg.save.storageKey)).toBe(before);
    expect(st.getItem(ROWS_KEY)).toBeNull();
    expect(loadState(st).pending.endDay).toBe(true);
    expect(r.ui).toMatchObject({ scenario: 'returning', dayEnded: true });
  });

  it('Reset clears every mewdoku.* key (never another app’s) and starts as the first visit: the returning player, menu open', () => {
    const st = filled();
    st.setItem(UI_KEY, JSON.stringify({ v: 1, open: false, scenario: 'new', dayEnded: true }));
    const r = applyOp('reset', st, NOW, readUi(st));
    expect(st.getItem('other.app.key')).toBe('kept');
    expect(st.getItem(RC_KEY)).toBeNull();
    expect(st.getItem(UI_KEY)).toBeNull();
    expect(r.load?.save?.progress.level).toBe(37);
    expect(r.ui).toEqual({ v: 1, open: true, scenario: 'returning', dayEnded: false });
    expect(loadState(st).pending.returning).toBe(true);
  });

  it('without storage (a blocked localStorage) the ops still hand the load its save and the sample server its state', () => {
    const ret = applyOp('returning', null, NOW, null);
    expect(ret.load?.save?.progress.level).toBe(37);
    expect(ret.rank.pending).toEqual({ returning: true, endDay: false });
    expect(applyOp('new', null, NOW, null).load).toEqual({ save: null });
    // Nothing survived the reload: the day ends for the first visit's returning player.
    const end = applyOp('endDay', null, NOW, null);
    expect(end.load?.save?.progress.level).toBe(37);
    expect(end.rank.pending).toEqual({ returning: true, endDay: true });
    expect(end.ui).toMatchObject({ scenario: 'returning', dayEnded: true });
    expect(applyOp('outOfHelpers', null, NOW, null).rank.pending.returning).toBe(true);
  });
});

describe('?preview=<op> and the sample origin', () => {
  it('takeOp reads a known op once and drops it from the address (other parameters kept)', () => {
    const replaced: string[] = [];
    const win = { location: { href: 'https://host/game/index.html?ads=ok&preview=endDay#x' }, history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => void replaced.push(url) } };
    expect(takeOp(win as unknown as Window)).toBe('endDay');
    expect(replaced).toEqual(['/game/index.html?ads=ok#x']);
    expect(takeOp({ location: { href: 'https://h/?preview=bogus' }, history: win.history } as unknown as Window)).toBeNull();
    expect(takeOp({ location: { href: 'https://h/' }, history: win.history } as unknown as Window)).toBeNull();
    expect(opUrl('https://host/p/?ads=nofill', 'new')).toBe('https://host/p/?ads=nofill&preview=new');
    for (const op of PREVIEW_OPS) expect(new URL(opUrl('https://h/', op)).searchParams.get('preview')).toBe(op);
  });

  it('routeSampleFetch sends the origin’s URLs to the server and everything else to the network', async () => {
    const real = vi.fn(async () => new Response('real'));
    const win = { fetch: real } as unknown as Window & typeof globalThis;
    win.fetch.bind = () => real;
    const server = { fetch: vi.fn(async () => new Response('sample')) };
    const undo = routeSampleFetch(win, 'https://sample-ranking.preview.invalid', server);
    expect(await (await win.fetch('https://sample-ranking.preview.invalid/v1/config')).text()).toBe('sample');
    expect(await (await win.fetch('./assets/pack-001.json')).text()).toBe('real');
    expect(await (await win.fetch('https://sample-ranking.preview.invalid.evil.example/v1/config')).text()).toBe('real');
    undo();
    expect(win.fetch).toBe(real);
  });
});

describe('the mock store (preview/payments.ts)', () => {
  it('our three products at their prices; ready at once', async () => {
    const p = createPreviewPayments({ storage: null, confirm: async () => true });
    expect(p.ready()).toBe(true);
    const cb = vi.fn();
    p.onReady(cb);
    expect(cb).toHaveBeenCalledOnce();
    expect(await p.catalog()).toEqual(PREVIEW_CATALOG);
    expect(PREVIEW_CATALOG.map((x) => [x.id, x.price])).toEqual([
      ['remove_ads', '$3.99'],
      ['hints_15', '$1.99'],
      ['kitties_8', '$1.99'],
    ]);
  });

  it('Buy → a purchase, unconsumed (kept across a reload) until consume(); Cancel → cancelled; not on sale → error', async () => {
    const storage = new MemoryStorage();
    const answers = [true, false];
    const p = createPreviewPayments({ storage, confirm: async () => answers.shift() ?? false, now: () => NOW });
    const r = await p.purchase('hints_15', 'anon:1');
    expect(r.ok).toBe(true);
    const token = r.ok ? r.p.purchaseToken : '';
    expect(token).toMatch(/^preview-/);
    expect(await p.purchases()).toHaveLength(1);
    // A reload before the consume: the boot restore finds it.
    const after = createPreviewPayments({ storage, confirm: async () => true });
    expect(((await after.purchases()) ?? []).map((x) => x.purchaseToken)).toEqual([token]);
    expect(await after.consume(token)).toBe(true);
    expect(await after.purchases()).toEqual([]);
    expect(JSON.parse(storage.getItem(PURCHASES_KEY) as string)).toEqual([]);
    expect(await p.purchase('kitties_8', 'x')).toEqual({ ok: false, reason: 'cancelled' });
    expect(await p.purchase('fish_250', 'x')).toEqual({ ok: false, reason: 'error' });
  });

  it('the confirm sheet says nothing is charged, shows the product and price; Buy, Cancel and Esc answer', async () => {
    const confirm = confirmSheet(document);
    const product = PREVIEW_CATALOG[1] as (typeof PREVIEW_CATALOG)[number];
    const a = confirm(product);
    const sheet = document.querySelector('.mwp-sheet') as HTMLElement;
    expect(sheet.textContent).toContain('Preview purchase — nothing is charged');
    expect(sheet.textContent).toContain('15 hints');
    expect(sheet.textContent).toContain('$1.99');
    (sheet.querySelector('.mwp-btn--primary') as HTMLButtonElement).click();
    await expect(a).resolves.toBe(true);
    expect(document.querySelector('.mwp-sheet')).toBeNull();
    const b = confirm(product);
    (document.querySelector('.mwp-sheet .mwp-btn--ghost') as HTMLButtonElement).click();
    await expect(b).resolves.toBe(false);
    const c = confirm(product);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(c).resolves.toBe(false);
  });
});

describe('the preview ads (preview/ads.ts over src/platform/web/mock-ads.ts)', () => {
  it('an interstitial: "Preview ad", closable after 2 s, ok when closed', async () => {
    const clock = createFakeClock();
    const ads = createMockAds('ok', { doc: document, timers: clock, present: previewPresenter(document, clock) });
    const res = track(ads.showInterstitial('next_level'));
    await drain();
    const el = document.querySelector('.mwp-ad[data-kind="interstitial"]') as HTMLElement;
    expect(el.textContent).toContain('Preview ad');
    const close = el.querySelector('.mwp-ad__close') as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    expect(close.textContent).toBe('Close in 2');
    await clock.advanceAsync(1000);
    expect(close.textContent).toBe('Close in 1');
    await clock.advanceAsync(1000);
    expect(close.disabled).toBe(false);
    close.click();
    await drain();
    expect(res.value).toEqual({ ok: true });
    expect(document.querySelector('.mwp-ad')).toBeNull();
  });

  it('an interstitial left open closes by itself after 30 s (inside the ad flow’s watchdog)', async () => {
    const clock = createFakeClock();
    const ads = createMockAds('ok', { doc: document, timers: clock, present: previewPresenter(document, clock) });
    const res = track(ads.showInterstitial('retry'));
    await clock.advanceAsync(30_000);
    await drain();
    expect(res.value).toEqual({ ok: true });
    expect(cfg.ads.showWatchdogMs).toBeGreaterThan(30_000);
  });

  it('a rewarded video says what it pays and grants after 3 s; "Close without reward" before → skipped', async () => {
    const clock = createFakeClock();
    const ads = createMockAds('ok', { doc: document, timers: clock, present: previewPresenter(document, clock) });
    const res = track(ads.showRewarded('hint'));
    await drain();
    const el = document.querySelector('.mwp-ad[data-kind="rewarded"]') as HTMLElement;
    expect(el.textContent).toContain('Watch to get 1 hint');
    expect(el.querySelector('.mwp-ad__status')?.textContent).toBe('Reward in 3');
    await clock.advanceAsync(2999);
    expect(res.done).toBe(false);
    await clock.advanceAsync(1);
    await drain();
    expect(res.value).toEqual({ ok: true });
    const skipped = track(ads.showRewarded('rank_double'));
    await drain();
    expect(document.querySelector('.mwp-ad')?.textContent).toContain(S.ad.reward.rank_double);
    (document.querySelector('.mwp-ad__skip') as HTMLButtonElement).click();
    await drain();
    expect(skipped.value).toEqual({ ok: false, reason: 'skipped' });
  });

  it('the mock’s modes still apply (?ads=nofill / unsupported); the banner bar carries our label', async () => {
    const clock = createFakeClock();
    await expect(createPreviewAds(document, clock, '?ads=nofill').showRewarded('hint')).resolves.toEqual({ ok: false, reason: 'no_fill' });
    expect(createPreviewAds(document, clock, '?ads=unsupported').banner).toBeUndefined();
    const banner = createPreviewAds(document, clock, '').banner;
    await banner?.show('bottom');
    expect(document.querySelector('[data-testid="mock-banner"]')?.textContent).toBe('Preview ad · banner');
    await banner?.hide();
    // Without the seam the bar keeps the game's own placeholder text (dev / e2e builds).
    const plain = createMockBanner('ok', { doc: document });
    await plain?.show('bottom');
    expect(document.querySelector('[data-testid="mock-banner"]')?.textContent).toBe('Banner placeholder');
    await plain?.hide();
  });
});

describe('the "sample players" lines (preview/labels.ts)', () => {
  it('one line at the top of every bracket list and on the result card, never twice', async () => {
    document.body.innerHTML =
      '<div class="rank-list rank-list--bracket"><p class="ranking__meta">x</p></div>' +
      '<div class="ladder-result"><div class="ladder-result__desc"><p>2nd</p></div></div>';
    labelSamples(document.body, document);
    labelSamples(document.body, document);
    const list = document.querySelector('.rank-list--bracket') as HTMLElement;
    expect(list.firstElementChild?.textContent).toBe('Preview: sample players');
    expect(list.querySelectorAll('[data-preview-note]')).toHaveLength(1);
    // UI batch (leaderboard): the stopwatch stays right under the title; the line goes after it.
    const timed = document.createElement('div');
    timed.className = 'rank-list rank-list--bracket';
    timed.innerHTML = '<div class="lb-timer"></div><p class="ranking__meta">x</p>';
    document.body.append(timed);
    labelSamples(document.body, document);
    labelSamples(document.body, document);
    expect(Array.from(timed.children).map((c) => c.className)).toEqual(['lb-timer', 'mwp-note', 'ranking__meta']);
    timed.remove();
    expect(document.querySelector('.ladder-result__desc [data-preview-note]')?.textContent).toBe('Preview: sample ranking');
    // A list the router mounts later gets its line too.
    const stop = watchSampleLabels(document);
    const later = document.createElement('div');
    later.className = 'rank-list rank-list--bracket';
    document.body.append(later);
    await drain();
    expect(later.firstElementChild?.textContent).toBe('Preview: sample players');
    stop();
    document.body.innerHTML = '';
  });
});

describe('the preview menu (preview/ribbon.ts)', () => {
  it('a tab that opens the card with the five shortcuts; a shortcut reports its op; Hide and Esc close it', () => {
    const actions: string[] = [];
    const toggles: boolean[] = [];
    const r = mountRibbon(document, { current: 'Returning player', build: 'Built 2026-10-11 12:00 UTC · abc1234 · v0.1.0', open: false, onToggle: (o) => void toggles.push(o), onAction: (op) => void actions.push(op) });
    const tab = r.el.querySelector('.mwp-ribbon__tab') as HTMLButtonElement;
    expect(tab.getAttribute('aria-expanded')).toBe('false');
    expect((r.el.querySelector('.mwp-menu') as HTMLElement).hidden).toBe(true);
    tab.click();
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    expect([...r.el.querySelectorAll('.mwp-menu__op')].map((b) => b.getAttribute('data-op'))).toEqual([...PREVIEW_OPS]);
    expect(r.el.querySelector('.mwp-menu__now')?.textContent).toBe('Now: Returning player');
    expect(r.el.querySelector('.mwp-menu__built')?.textContent).toContain('abc1234');
    (r.el.querySelector('.mwp-menu__hide') as HTMLButtonElement).click();
    expect((r.el.querySelector('.mwp-menu') as HTMLElement).hidden).toBe(true);
    tab.click();
    r.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect((r.el.querySelector('.mwp-menu') as HTMLElement).hidden).toBe(true);
    expect(toggles).toEqual([true, false, true, false]);
    tab.click();
    (r.el.querySelector('.mwp-menu__op[data-op="endDay"]') as HTMLButtonElement).click();
    expect(actions).toEqual(['endDay']);
    expect([...r.el.querySelectorAll<HTMLButtonElement>('.mwp-menu__op')].every((b) => b.disabled)).toBe(true);
    r.destroy();
    expect(document.querySelector('.mwp-ribbon')).toBeNull();
  });
});

describe('the strings the release check looks for (preview/strings.ts)', () => {
  it('every marker is in the preview’s own words or keys', () => {
    const all = JSON.stringify(S) + [SAMPLE_STATE_KEY, PURCHASES_KEY, UI_KEY, 'https://sample-ranking.preview.invalid'].join(' ');
    for (const m of PREVIEW_MARKERS) expect(all, m).toContain(m);
  });
});
