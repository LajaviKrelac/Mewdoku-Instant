// Owner: D (Phase 2b; was platform); G3 (Phase 2c: three-product catalogue, unconsumed shorthand,
// period-band seeding; docs/phase2c/fish-lives-spec.md §4.5, §5.3, §7.3 G3 item 5)
// Fake FBInstant 8.0 (our own test double, written from the API subset in docs/phase1/05 and
// src/platform/fb/fbinstant.d.ts). Two uses:
//   1. Playwright fbig e2e: served in place of https://connect.facebook.net/en_US/fbinstant.8.0.js
//      with page.route(); configure it before load with page.addInitScript(() => {
//      window.__FB_STUB_CONFIG__ = { presets: ['slow-rewarded'], ... } }) or with ?fbstub=<preset,…>.
//   2. Unit tests: evaluate this file with a fake `window` and call window.__createFbStub(config).
// Every SDK call is recorded in order in control.calls ({ seq, name, args, t, beforeInit }).
//
// Config (all optional; deep-merged over DEFAULTS):
//   supportedAPIs   string[]                 returned by getSupportedAPIs()
//   locale, platform, sdkVersion, playerId
//   initDelayMs, startDelayMs, getDataDelayMs, setDataDelayMs, flushDelayMs   (ms; 0 = next microtask)
//   data            object                   initial player data, e.g. { save: {...} }
//   persist         boolean                  keep player data in sessionStorage across reloads (default
//                                            true; only where sessionStorage exists, i.e. the browser)
//   errors          { getDataAsync, setDataAsync, flushDataAsync, startGameAsync }: queues of error
//                   codes; each call takes the next entry ('' / null = success)
//   ads.interstitial / ads.rewarded:
//     load          'ok' | 'never' | <ERROR_CODE>   ('never' = loadAsync never settles)
//     loadDelayMs
//     show          'ok' | 'close' | <ERROR_CODE>   ('close' = player closed early → USER_INPUT)
//     showDelayMs
//   presets         string[]  see PRESETS below
// Phase 2b additions (all on by default; each is a separate API group the presets can remove):
//   banner          { load: 'ok' | 'never' | <ERROR_CODE>, loadDelayMs, hide: 'ok' | <ERROR_CODE>, rateLimitMs }
//                   loadBannerAdAsync shows a 50 px bar (data-testid fb-stub-banner) in a browser; a load
//                   within rateLimitMs (45 s, Meta's reported limit) of the last one rejects RATE_LIMITED.
//                   errors.hideBannerAdAsync: a queue like the other errors (e.g. one NETWORK_FAILURE
//                   and then success), on top of the fixed banner.hide.
//   leaderboards    { api: 'classic' | 'nezp' | 'both', names: string[] | null (null = any name exists),
//                     entries: { <boardName>: [{ playerId, score }] } (other players, seeded),
//                     errors: { setScore: [], getEntries: [], getPlayerEntry: [] },
//                     periods: { kind: 'week' | 'day' | 'month', epoch: 'YYYY-MM-DD', span } }
//                   Phase 2c: a seeded entry may give a period band instead of a score:
//                     { playerId, band: <absolute period index>, total } or
//                     { playerId, period: <offset from the stub clock's current period: 0, -1, +1 …>, total }
//                   → score = index × span + total (the band encoding of fish-lives-spec §4.3). The
//                   defaults mirror cfg (UTC weeks from 2026-01-05, span 100 000) but are the stub's
//                   own copy: a test that changes cfg.period.kind passes periods too. Relative
//                   periods are resolved when the board is first read (the stub clock at that time).
//                   control.periodIndex(offset?) answers the index the stub would use.
//                   classic: getLeaderboardAsync(name) → Leaderboard (keeps the higher score; entries
//                   carry getRank/getScore/getPlayer().getID); NEZP: globalLeaderboards.* (entries carry
//                   getScore/getPlayer().getSessionID, no rank; a non-improving score rejects
//                   LEADERBOARD_SCORE_NOT_IMPROVED).
//   overlay         { load: 'ok' | 'error' | 'never', loadDelayMs }  overlayViews.createOverlayViewWithXMLString
//                   returns a view whose iframeElement the game mounts; onLoad fires after loadDelayMs.
//                   control.overlayEvent(name) sends a custom event (onTapEvent) to the newest view.
//   tournament      { current: null | { id, endTime (unix s), contextId }, create: 'ok' | <ERROR_CODE> }
//   payments        { ready: true | false (false = onReady never fires, as on Messenger.com), readyDelayMs,
//                     catalog: FB products, purchase: 'ok' | <ERROR_CODE>, unconsumed: FB purchases,
//                     errors: { getCatalogAsync: [], getPurchasesAsync: [], consumePurchaseAsync: [] } }
//                   Unconsumed purchases persist across reloads with the player data (persist: true).
//                   Phase 2c: the default catalogue is the three products on sale (remove_ads, hints_15,
//                   kitties_8); purchaseAsync rejects any id it does not list (INVALID_PARAM), so the
//                   retired fish_250 / fish_900 can no longer be bought. An `unconsumed` entry needs only
//                   a productID: { productID: 'fish_250' } is filled in as an unconsumed 'charge' with
//                   token 'stub-unconsumed-<n>-<productID>' (an old fish pack bought before 2c).
(function (root) {
  'use strict';

  var ALL_APIS = [
    'initializeAsync',
    'setLoadingProgress',
    'startGameAsync',
    'getLocale',
    'getPlatform',
    'getSDKVersion',
    'getSupportedAPIs',
    'onPause',
    'logEvent',
    'getInterstitialAdAsync',
    'getRewardedVideoAsync',
    'performHapticFeedbackAsync',
    'player.getID',
    'player.getDataAsync',
    'player.setDataAsync',
    'player.flushDataAsync',
  ];
  // Phase 2b API groups (getSupportedAPIs strings as src/platform/fb/fb-probe.ts reads them).
  var BANNER_APIS = ['loadBannerAdAsync', 'hideBannerAdAsync'];
  var CLASSIC_LB_APIS = ['getLeaderboardAsync'];
  var NEZP_LB_APIS = [
    'globalLeaderboards.setScoreAsync',
    'globalLeaderboards.getScoreAsync',
    'globalLeaderboards.getTopEntriesAsync',
    'globalLeaderboards.getTopFriendEntriesAsync',
  ];
  var OVERLAY_APIS = ['overlayViews.createOverlayViewWithXMLString', 'overlayViews.setCustomEventHandler'];
  var TOURNAMENT_APIS = ['tournament.createAsync', 'tournament.postScoreAsync', 'tournament.getTournamentsAsync', 'tournament.shareAsync', 'getTournamentAsync'];
  var PAYMENT_APIS = [
    'payments.onReady',
    'payments.getCatalogAsync',
    'payments.purchaseAsync',
    'payments.getPurchasesAsync',
    'payments.consumePurchaseAsync',
  ];
  ALL_APIS = ALL_APIS.concat(BANNER_APIS, CLASSIC_LB_APIS, OVERLAY_APIS, TOURNAMENT_APIS, PAYMENT_APIS);

  /**
   * Our three products on sale (phase2c §5.3, cfg.iap.catalog), as an FB catalogue would list them. The
   * retired fish packs (fish_250, fish_900) are not sold: a test that needs a test app still listing
   * them passes its own `payments.catalog`.
   */
  var STUB_CATALOG = [
    { productID: 'remove_ads', title: 'stub', price: '$3.99', priceCurrencyCode: 'USD', priceAmount: 3.99 },
    { productID: 'hints_15', title: 'stub', price: '$1.99', priceCurrencyCode: 'USD', priceAmount: 1.99 },
    { productID: 'kitties_8', title: 'stub', price: '$1.99', priceCurrencyCode: 'USD', priceAmount: 1.99 },
  ];
  /** Phase 2c: the band encoding's defaults (cfg.period.kind, cfg.rank.periodEpoch, PERIOD_SPAN). */
  var STUB_PERIODS = { kind: 'week', epoch: '2026-01-05', span: 100000 };

  var DEFAULTS = {
    supportedAPIs: ALL_APIS,
    locale: 'en_US',
    platform: 'WEB',
    sdkVersion: '8.0',
    playerId: 'stub-player-1',
    initDelayMs: 0,
    startDelayMs: 0,
    getDataDelayMs: 0,
    setDataDelayMs: 0,
    flushDelayMs: 0,
    data: null,
    persist: true,
    errors: { getDataAsync: [], setDataAsync: [], flushDataAsync: [], startGameAsync: [], hideBannerAdAsync: [] },
    ads: {
      interstitial: { load: 'ok', loadDelayMs: 0, show: 'ok', showDelayMs: 300 },
      rewarded: { load: 'ok', loadDelayMs: 0, show: 'ok', showDelayMs: 300 },
    },
    banner: { load: 'ok', loadDelayMs: 0, hide: 'ok', rateLimitMs: 45000 },
    leaderboards: { api: 'classic', names: null, entries: {}, errors: { setScore: [], getEntries: [], getPlayerEntry: [] }, periods: STUB_PERIODS },
    overlay: { load: 'ok', loadDelayMs: 0 },
    tournament: { current: null, create: 'ok' },
    payments: {
      ready: true,
      readyDelayMs: 0,
      catalog: STUB_CATALOG,
      purchase: 'ok',
      unconsumed: [],
      errors: { getCatalogAsync: [], getPurchasesAsync: [], consumePurchaseAsync: [] },
    },
    presets: [],
  };

  var PRESETS = {
    // A rewarded video that plays for 10 s and then completes (must NOT be cut off: 05 §6.2).
    'slow-rewarded': { ads: { rewarded: { showDelayMs: 10000 } } },
    // Ads that never become ready (the adapter must give up after ads.readyTimeoutMs).
    'never-ready': { ads: { interstitial: { load: 'never' }, rewarded: { load: 'never' } } },
    'no-fill': { ads: { interstitial: { load: 'ADS_NO_FILL' }, rewarded: { load: 'ADS_NO_FILL' } } },
    'rewarded-close': { ads: { rewarded: { show: 'close' } } },
    'no-ad-apis': { removeAPIs: ['getInterstitialAdAsync', 'getRewardedVideoAsync'] },
    'no-cloud': { removeAPIs: ['player.getDataAsync', 'player.setDataAsync', 'player.flushDataAsync'] },
    'no-haptics': { removeAPIs: ['performHapticFeedbackAsync'] },
    'no-persist': { persist: false },
    // phase2b
    'no-banner': { removeAPIs: BANNER_APIS },
    'no-banner-hide': { removeAPIs: ['hideBannerAdAsync'] },
    'lb-classic': { leaderboards: { api: 'classic' } },
    'lb-nezp': { leaderboards: { api: 'nezp' } },
    'lb-none': { leaderboards: { api: 'none' } },
    'no-overlay': { removeAPIs: OVERLAY_APIS },
    'no-tournament': { removeAPIs: TOURNAMENT_APIS },
    'no-payments': { removeAPIs: PAYMENT_APIS },
    'payments-never-ready': { payments: { ready: false } },
    // iOS: not eligible for payments (05 §9); the API is not offered there.
    ios: { platform: 'IOS', removeAPIs: PAYMENT_APIS },
    // phase2c §5.3: an old fish pack bought before 2c, still unconsumed (the boot restore compensates it).
    'unconsumed-fish-250': { payments: { unconsumed: [{ productID: 'fish_250' }] } },
  };

  var STORE_KEY = '__fbStub.playerData';

  function isObj(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }
  function merge(base, patch) {
    if (patch === undefined) return base;
    if (!isObj(base) || !isObj(patch)) return patch;
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in patch) out[k] = merge(base[k], patch[k]);
    return out;
  }
  function copy(v) {
    if (v === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (e) {
      return String(v);
    }
  }
  function fbError(code, message) {
    return { code: code, message: message || code };
  }

  function resolveConfig(config) {
    var c = merge(DEFAULTS, config || {});
    var presets = (c.presets || []).slice();
    try {
      var q = root.location && root.location.search ? new URLSearchParams(root.location.search).get('fbstub') : null;
      if (q) presets = presets.concat(q.split(','));
    } catch (e) {
      /* no location */
    }
    for (var i = 0; i < presets.length; i++) {
      var p = PRESETS[String(presets[i]).trim()];
      if (!p) continue;
      if (p.removeAPIs) {
        var drop = p.removeAPIs;
        c.supportedAPIs = c.supportedAPIs.filter(function (a) {
          return drop.indexOf(a) < 0;
        });
      } else {
        c = merge(c, p);
      }
    }
    c.errors = copy(c.errors) || {};
    c.leaderboards.errors = copy(c.leaderboards.errors) || {};
    c.payments.errors = copy(c.payments.errors) || {};
    // The leaderboard API flavour decides which names getSupportedAPIs() lists.
    var lbApi = c.leaderboards.api;
    c.supportedAPIs = c.supportedAPIs.filter(function (a) {
      return CLASSIC_LB_APIS.indexOf(a) < 0 && NEZP_LB_APIS.indexOf(a) < 0;
    });
    if (lbApi === 'classic' || lbApi === 'both') c.supportedAPIs = c.supportedAPIs.concat(CLASSIC_LB_APIS);
    if (lbApi === 'nezp' || lbApi === 'both') c.supportedAPIs = c.supportedAPIs.concat(NEZP_LB_APIS);
    return c;
  }

  function createFbStub(config) {
    var cfg = resolveConfig(config);
    var calls = [];
    var seq = 0;
    var pauseCbs = [];
    var state = {
      initialized: false,
      started: false,
      progress: [],
      flushing: false,
      adsCreated: 0,
      adsShowing: 0,
      // phase2b
      bannerVisible: false,
      bannerLastLoadAt: null,
      overlaysOpen: 0,
      paymentsReady: false,
      tournament: copy(cfg.tournament.current) || null,
    };
    /** Stub time: the test's clock when one is given (unit tests), else Date.now (Playwright's page.clock). */
    function now() {
      return typeof root.__stubNow === 'function' ? root.__stubNow() : Date.now();
    }

    function wait(ms) {
      if (!ms || ms <= 0) return Promise.resolve();
      return new Promise(function (resolve) {
        root.setTimeout(resolve, ms);
      });
    }
    function record(name, args) {
      var entry = { seq: ++seq, name: name, args: copy(args || []), t: now(), beforeInit: !state.initialized };
      calls.push(entry);
      return entry;
    }
    function nextError(api) {
      var q = cfg.errors && cfg.errors[api];
      if (!q || q.length === 0) return null;
      var code = q.shift();
      return code ? fbError(code) : null;
    }

    // ── player data ──
    function readStore() {
      if (cfg.persist && root.sessionStorage) {
        try {
          var raw = root.sessionStorage.getItem(STORE_KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) {
          /* fall through */
        }
      }
      return copy(cfg.data) || {};
    }
    var store = readStore();
    function writeStore() {
      if (cfg.persist && root.sessionStorage) {
        try {
          root.sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch (e) {
          /* ignore */
        }
      }
    }

    var player = {
      getID: function () {
        record('player.getID');
        return state.initialized ? cfg.playerId : null;
      },
      getDataAsync: function (keys) {
        record('player.getDataAsync', [keys]);
        var err = nextError('getDataAsync');
        return wait(cfg.getDataDelayMs).then(function () {
          if (err) throw err;
          var out = {};
          for (var i = 0; i < (keys || []).length; i++) if (keys[i] in store) out[keys[i]] = copy(store[keys[i]]);
          return out;
        });
      },
      setDataAsync: function (data) {
        record('player.setDataAsync', [data]);
        if (state.flushing) return Promise.reject(fbError('PENDING_REQUEST', 'flush in progress'));
        var err = nextError('setDataAsync');
        var snapshot = copy(data);
        return wait(cfg.setDataDelayMs).then(function () {
          if (err) throw err;
          for (var k in snapshot) store[k] = snapshot[k];
          writeStore();
        });
      },
      flushDataAsync: function () {
        record('player.flushDataAsync');
        if (state.flushing) return Promise.reject(fbError('PENDING_REQUEST', 'flush in progress'));
        var err = nextError('flushDataAsync');
        state.flushing = true;
        return wait(cfg.flushDelayMs).then(
          function () {
            state.flushing = false;
            if (err) throw err;
          },
          function (e) {
            state.flushing = false;
            throw e;
          },
        );
      },
    };

    // ── ads ──
    function overlay(kind, on) {
      var doc = root.document;
      if (!doc || !doc.body) return;
      var id = 'fb-stub-ad';
      var el = doc.getElementById(id);
      if (on && !el) {
        el = doc.createElement('div');
        el.id = id;
        el.setAttribute('data-testid', id);
        el.setAttribute('data-kind', kind);
        el.style.cssText =
          'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,.9);color:#fff;' +
          'display:flex;align-items:center;justify-content:center;font:16px sans-serif';
        el.textContent = 'FB stub ' + kind + ' ad';
        doc.body.appendChild(el);
      } else if (!on && el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }

    function makeAd(kind, placementID) {
      var loaded = false;
      var shown = false;
      var n = ++state.adsCreated;
      return {
        getPlacementID: function () {
          return placementID;
        },
        loadAsync: function () {
          record('ad.loadAsync', [kind, placementID, n]);
          var b = cfg.ads[kind];
          if (loaded) return Promise.resolve();
          if (b.load === 'never') return new Promise(function () {});
          return wait(b.loadDelayMs).then(function () {
            if (b.load !== 'ok') throw fbError(b.load);
            loaded = true;
          });
        },
        showAsync: function () {
          record('ad.showAsync', [kind, placementID, n]);
          var b = cfg.ads[kind];
          if (!loaded) return Promise.reject(fbError('ADS_NOT_LOADED'));
          if (shown) return Promise.reject(fbError('INVALID_OPERATION', 'instance already shown'));
          shown = true;
          state.adsShowing++;
          overlay(kind, true);
          return wait(b.showDelayMs).then(function () {
            state.adsShowing--;
            if (state.adsShowing === 0) overlay(kind, false);
            record('ad.showSettled', [kind, b.show, n]);
            if (b.show === 'close') throw fbError('USER_INPUT', 'closed early');
            if (b.show !== 'ok') throw fbError(b.show);
          });
        },
      };
    }

    function adFactory(kind, api) {
      return function (placementID) {
        record(api, [placementID]);
        if (cfg.supportedAPIs.indexOf(api) < 0) return Promise.reject(fbError('CLIENT_UNSUPPORTED_OPERATION'));
        if (!placementID) return Promise.reject(fbError('INVALID_PARAM', 'empty placement'));
        return Promise.resolve(makeAd(kind, placementID));
      };
    }

    // ── phase2b: banner ──
    function bannerBar(on) {
      var doc = root.document;
      if (!doc || !doc.body) return;
      var id = 'fb-stub-banner';
      var el = doc.getElementById(id);
      if (on && !el) {
        el = doc.createElement('div');
        el.id = id;
        el.setAttribute('data-testid', id);
        el.style.cssText =
          'position:fixed;left:0;right:0;bottom:0;height:50px;z-index:2147483600;background:#ccc;color:#222;' +
          'display:flex;align-items:center;justify-content:center;font:13px sans-serif';
        el.textContent = 'FB stub banner';
        doc.body.appendChild(el);
      } else if (!on && el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
    function unsupported(api) {
      return cfg.supportedAPIs.indexOf(api) < 0 ? Promise.reject(fbError('CLIENT_UNSUPPORTED_OPERATION')) : null;
    }
    function loadBannerAdAsync(placementID, position) {
      record('loadBannerAdAsync', [placementID, position === undefined ? null : position]);
      var no = unsupported('loadBannerAdAsync');
      if (no) return no;
      if (!placementID) return Promise.reject(fbError('INVALID_PARAM', 'empty placement'));
      var b = cfg.banner;
      var t = now();
      if (state.bannerLastLoadAt !== null && t - state.bannerLastLoadAt < b.rateLimitMs) {
        return Promise.reject(fbError('RATE_LIMITED', 'banner loads are limited'));
      }
      state.bannerLastLoadAt = t;
      if (b.load === 'never') return new Promise(function () {});
      return wait(b.loadDelayMs).then(function () {
        if (b.load !== 'ok') throw fbError(b.load);
        state.bannerVisible = true;
        bannerBar(true);
      });
    }
    function hideBannerAdAsync() {
      record('hideBannerAdAsync');
      var no = unsupported('hideBannerAdAsync');
      if (no) return no;
      if (cfg.banner.hide !== 'ok') return Promise.reject(fbError(cfg.banner.hide));
      var queued = nextError('hideBannerAdAsync');
      if (queued) return Promise.reject(queued);
      state.bannerVisible = false;
      bannerBar(false);
      return Promise.resolve();
    }

    // ── phase2c: period bands (fish-lives-spec §3.5, §4.3), the stub's own copy of the encoding ──
    var DAY_MS = 86400000;
    function epochParts() {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(cfg.leaderboards.periods.epoch));
      if (!m) throw new Error('fb stub: bad leaderboards.periods.epoch');
      return { y: +m[1], m: +m[2] - 1, d: +m[3], ms: Date.UTC(+m[1], +m[2] - 1, +m[3]) };
    }
    /** The UTC period index of `at` (ms): whole weeks / days / months from the epoch's period. */
    function periodIndexAt(at) {
      var p = cfg.leaderboards.periods;
      var e = epochParts();
      var t = new Date(at);
      if (p.kind === 'month') return (t.getUTCFullYear() - e.y) * 12 + (t.getUTCMonth() - e.m);
      var days = Math.floor((Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - e.ms) / DAY_MS);
      return p.kind === 'day' ? days : Math.floor(days / 7);
    }
    /** A seeded row's score: `score` as given, or a band: (band | current + period) × span + total. */
    function seededScore(e) {
      if (typeof e.score === 'number') return e.score;
      var idx = typeof e.band === 'number' ? e.band : periodIndexAt(now()) + (typeof e.period === 'number' ? e.period : 0);
      return idx * cfg.leaderboards.periods.span + (e.total || 0);
    }

    // ── phase2b: leaderboards (classic and NEZP) ──
    var boards = {}; // name → [{ playerId, score, ts }]
    function boardRows(name) {
      if (!boards[name]) {
        var seeded = (cfg.leaderboards.entries && cfg.leaderboards.entries[name]) || [];
        boards[name] = seeded.map(function (e, i) {
          return { playerId: String(e.playerId), score: seededScore(e), ts: i };
        });
      }
      return boards[name];
    }
    function sorted(name) {
      return boardRows(name)
        .slice()
        .sort(function (a, b) {
          return b.score - a.score || a.ts - b.ts;
        });
    }
    function boardExists(name) {
      var names = cfg.leaderboards.names;
      return !names || names.indexOf(name) >= 0;
    }
    /** Keeps the higher score; returns the player's row. */
    function putScore(name, score) {
      var rows = boardRows(name);
      var mine = null;
      for (var i = 0; i < rows.length; i++) if (rows[i].playerId === cfg.playerId) mine = rows[i];
      if (!mine) {
        mine = { playerId: cfg.playerId, score: score, ts: ++seq };
        rows.push(mine);
        return { row: mine, improved: true };
      }
      if (score > mine.score) {
        mine.score = score;
        mine.ts = ++seq;
        return { row: mine, improved: true };
      }
      return { row: mine, improved: false };
    }
    function rankOf(name, playerId) {
      var list = sorted(name);
      for (var i = 0; i < list.length; i++) if (list[i].playerId === playerId) return i + 1;
      return null;
    }
    function classicEntry(name, row) {
      var rank = rankOf(name, row.playerId);
      return {
        getScore: function () {
          return row.score;
        },
        getFormattedScore: function () {
          return String(row.score);
        },
        getTimestamp: function () {
          return row.ts;
        },
        getRank: function () {
          return rank;
        },
        getExtraData: function () {
          return null;
        },
        getPlayer: function () {
          return {
            getID: function () {
              return row.playerId;
            },
          };
        },
      };
    }
    function nezpEntry(row) {
      return {
        getScore: function () {
          return row.score;
        },
        getPlayer: function () {
          return {
            getSessionID: function () {
              return 'session-' + row.playerId;
            },
          };
        },
      };
    }
    function lbError(kind) {
      var q = cfg.leaderboards.errors && cfg.leaderboards.errors[kind];
      if (!q || q.length === 0) return null;
      var code = q.shift();
      return code ? fbError(code) : null;
    }
    function getLeaderboardAsync(name) {
      record('getLeaderboardAsync', [name]);
      var no = unsupported('getLeaderboardAsync');
      if (no) return no;
      if (!boardExists(name)) return Promise.reject(fbError('LEADERBOARD_NOT_FOUND', name));
      return Promise.resolve({
        getName: function () {
          return name;
        },
        getContextID: function () {
          return null;
        },
        setScoreAsync: function (score, extra) {
          record('leaderboard.setScoreAsync', [name, score, extra === undefined ? null : extra]);
          var err = lbError('setScore');
          if (err) return Promise.reject(err);
          return Promise.resolve(classicEntry(name, putScore(name, score).row));
        },
        getEntriesAsync: function (count, offset) {
          record('leaderboard.getEntriesAsync', [name, count, offset]);
          var err = lbError('getEntries');
          if (err) return Promise.reject(err);
          return Promise.resolve(
            sorted(name)
              .slice(offset || 0, (offset || 0) + count)
              .map(function (r) {
                return classicEntry(name, r);
              }),
          );
        },
        getPlayerEntryAsync: function () {
          record('leaderboard.getPlayerEntryAsync', [name]);
          var err = lbError('getPlayerEntry');
          if (err) return Promise.reject(err);
          var rows = boardRows(name);
          for (var i = 0; i < rows.length; i++) if (rows[i].playerId === cfg.playerId) return Promise.resolve(classicEntry(name, rows[i]));
          return Promise.resolve(null);
        },
        getEntryCountAsync: function () {
          record('leaderboard.getEntryCountAsync', [name]);
          return Promise.resolve(boardRows(name).length);
        },
      });
    }
    var globalLeaderboards = {
      setScoreAsync: function (id, score) {
        record('globalLeaderboards.setScoreAsync', [id, score]);
        var no = unsupported('globalLeaderboards.setScoreAsync');
        if (no) return no;
        if (!boardExists(id)) return Promise.reject(fbError('LEADERBOARD_NOT_FOUND', id));
        var err = lbError('setScore');
        if (err) return Promise.reject(err);
        var r = putScore(id, score);
        if (!r.improved) return Promise.reject(fbError('LEADERBOARD_SCORE_NOT_IMPROVED'));
        return Promise.resolve(nezpEntry(r.row));
      },
      getScoreAsync: function (id) {
        record('globalLeaderboards.getScoreAsync', [id]);
        var rows = boardRows(id);
        for (var i = 0; i < rows.length; i++) if (rows[i].playerId === cfg.playerId) return Promise.resolve(rows[i].score);
        return Promise.resolve(null);
      },
      getTopEntriesAsync: function (id, limit) {
        record('globalLeaderboards.getTopEntriesAsync', [id, limit === undefined ? null : limit]);
        var no = unsupported('globalLeaderboards.getTopEntriesAsync');
        if (no) return no;
        var err = lbError('getEntries');
        if (err) return Promise.reject(err);
        return Promise.resolve(sorted(id).slice(0, limit || 10).map(nezpEntry));
      },
      getTopFriendEntriesAsync: function (id, limit) {
        record('globalLeaderboards.getTopFriendEntriesAsync', [id, limit === undefined ? null : limit]);
        return Promise.resolve([]);
      },
    };

    // ── phase2b: overlay views ──
    var overlayHandler = null;
    var overlayViewsMade = [];
    var overlayViews = {
      createOverlayViewWithXMLString: function (xml, css, data, onLoad, onError, basePath) {
        record('overlayViews.createOverlayViewWithXMLString', [xml.length, css, data, basePath === undefined ? null : basePath]);
        var o = cfg.overlay;
        var doc = root.document;
        var frame = doc && doc.createElement ? doc.createElement('iframe') : { style: {}, parentNode: null };
        if (frame.setAttribute) frame.setAttribute('data-testid', 'fb-stub-overlay');
        var view = {
          id: 'overlay-' + (overlayViewsMade.length + 1),
          iframeElement: frame,
          shown: false,
          showAsync: function () {
            record('overlayView.showAsync', [view.id]);
            view.shown = true;
            state.overlaysOpen++;
            // Render the bound rows as plain text, so e2e tests can read what the game passed.
            try {
              var parsed = JSON.parse(data);
              if (frame.setAttribute) {
                frame.setAttribute(
                  'srcdoc',
                  '<body style="font:14px sans-serif;color:#fff;background:#2a2430">' +
                    (parsed.rows || [])
                      .map(function (r) {
                        return '<div data-row>' + r.rank + ' ' + r.score + (r.kind !== 'other' ? ' (me)' : '') + '</div>';
                      })
                      .join('') +
                    '</body>',
                );
              }
            } catch (e) {
              /* not JSON */
            }
            return Promise.resolve();
          },
          dismissAsync: function () {
            record('overlayView.dismissAsync', [view.id]);
            if (view.shown) state.overlaysOpen--;
            view.shown = false;
            return Promise.resolve();
          },
          updateAsync: function (next) {
            record('overlayView.updateAsync', [view.id, next]);
            data = next;
            return Promise.resolve();
          },
          getStatus: function () {
            return view.shown ? 'Shown' : 'Loaded';
          },
        };
        overlayViewsMade.push(view);
        if (o.load !== 'never') {
          wait(o.loadDelayMs).then(function () {
            if (o.load === 'ok') onLoad(view);
            else if (onError) onError(view, fbError('INVALID_PARAM', 'overlay failed'));
          });
        }
        return view;
      },
      setCustomEventHandler: function (fn) {
        record('overlayViews.setCustomEventHandler');
        overlayHandler = fn;
      },
    };

    // ── phase2b: tournaments ──
    function tournamentObj(t) {
      return {
        getID: function () {
          return t.id;
        },
        getContextID: function () {
          return t.contextId || null;
        },
        getEndTime: function () {
          return t.endTime;
        },
        getTitle: function () {
          return t.title || null;
        },
        getPayload: function () {
          return null;
        },
      };
    }
    var tournaments = 0;
    var tournament = {
      createAsync: function (payload) {
        record('tournament.createAsync', [payload]);
        var no = unsupported('tournament.createAsync');
        if (no) return no;
        if (cfg.tournament.create !== 'ok') return Promise.reject(fbError(cfg.tournament.create));
        if (state.tournament) return Promise.reject(fbError('INVALID_OPERATION', 'already in a tournament'));
        var conf = (payload && payload.config) || {};
        state.tournament = {
          id: 'tournament-' + ++tournaments,
          contextId: 'context-' + tournaments,
          endTime: conf.endTime || Math.floor(now() / 1000) + 7 * 86400,
          title: conf.title || null,
          score: payload && typeof payload.initialScore === 'number' ? payload.initialScore : 0,
        };
        return Promise.resolve(tournamentObj(state.tournament));
      },
      postScoreAsync: function (score) {
        record('tournament.postScoreAsync', [score]);
        var no = unsupported('tournament.postScoreAsync');
        if (no) return no;
        if (!state.tournament) return Promise.reject(fbError('TOURNAMENT_NOT_FOUND'));
        state.tournament.score = Math.max(state.tournament.score || 0, score);
        return Promise.resolve();
      },
      getTournamentsAsync: function () {
        record('tournament.getTournamentsAsync');
        return Promise.resolve(state.tournament ? [tournamentObj(state.tournament)] : []);
      },
      shareAsync: function (payload) {
        record('tournament.shareAsync', [payload]);
        return Promise.resolve();
      },
    };
    function getTournamentAsync() {
      record('getTournamentAsync');
      var no = unsupported('getTournamentAsync');
      if (no) return no;
      return state.tournament ? Promise.resolve(tournamentObj(state.tournament)) : Promise.reject(fbError('TOURNAMENT_NOT_FOUND'));
    }

    // ── phase2b: payments ──
    var PAY_KEY = '__fbStub.purchases';
    /**
     * phase2c: a seeded unconsumed purchase needs only its productID; token, payment id, time, action
     * type and isConsumed are filled in as an unconsumed charge made a day ago (developerPayload is
     * optional in FB's answer and stays absent). Fields the test gives (even odd ones) are kept as given.
     */
    function seededPurchase(p, i) {
      var out = copy(p) || {};
      var id = String(out.productID);
      if (!('purchaseToken' in out)) out.purchaseToken = 'stub-unconsumed-' + (i + 1) + '-' + id;
      if (!('paymentID' in out)) out.paymentID = 'stub-unconsumed-payment-' + (i + 1);
      if (!('purchaseTime' in out)) out.purchaseTime = String(Math.floor(now() / 1000) - 86400);
      if (!('paymentActionType' in out)) out.paymentActionType = 'charge';
      if (!('isConsumed' in out)) out.isConsumed = false;
      return out;
    }
    function readPurchases() {
      if (cfg.persist && root.sessionStorage) {
        try {
          var raw = root.sessionStorage.getItem(PAY_KEY);
          if (raw) return JSON.parse(raw);
        } catch (e) {
          /* fall through */
        }
      }
      return (cfg.payments.unconsumed || []).map(seededPurchase);
    }
    var purchasesList = readPurchases();
    var purchaseCount = 0;
    function writePurchases() {
      if (cfg.persist && root.sessionStorage) {
        try {
          root.sessionStorage.setItem(PAY_KEY, JSON.stringify(purchasesList));
        } catch (e) {
          /* ignore */
        }
      }
    }
    function payError(api) {
      var q = cfg.payments.errors && cfg.payments.errors[api];
      if (!q || q.length === 0) return null;
      var code = q.shift();
      return code ? fbError(code) : null;
    }
    var readyCbs = [];
    var payments = {
      onReady: function (cb) {
        record('payments.onReady');
        if (cfg.supportedAPIs.indexOf('payments.onReady') < 0 || !cfg.payments.ready) return; // never fires
        if (state.paymentsReady) {
          cb();
          return;
        }
        readyCbs.push(cb);
        if (readyCbs.length === 1) {
          wait(cfg.payments.readyDelayMs).then(function () {
            state.paymentsReady = true;
            readyCbs.splice(0).forEach(function (f) {
              f();
            });
          });
        }
      },
      getCatalogAsync: function () {
        record('payments.getCatalogAsync');
        var no = unsupported('payments.getCatalogAsync');
        if (no) return no;
        if (!state.paymentsReady) return Promise.reject(fbError('PAYMENTS_NOT_INITIALIZED'));
        var err = payError('getCatalogAsync');
        return err ? Promise.reject(err) : Promise.resolve(copy(cfg.payments.catalog));
      },
      purchaseAsync: function (config) {
        record('payments.purchaseAsync', [config]);
        var no = unsupported('payments.purchaseAsync');
        if (no) return no;
        if (!state.started) return Promise.reject(fbError('INVALID_OPERATION', 'before startGameAsync'));
        if (!state.paymentsReady) return Promise.reject(fbError('PAYMENTS_NOT_INITIALIZED'));
        var id = config && config.productID;
        var known = (cfg.payments.catalog || []).some(function (p) {
          return p.productID === id;
        });
        if (!known) return Promise.reject(fbError('INVALID_PARAM', 'unknown product'));
        if (cfg.payments.purchase === 'cancel' || cfg.payments.purchase === 'USER_INPUT') return Promise.reject(fbError('USER_INPUT', 'cancelled'));
        if (cfg.payments.purchase !== 'ok') return Promise.reject(fbError(cfg.payments.purchase));
        var n = ++purchaseCount;
        var p = {
          productID: id,
          purchaseToken: 'stub-token-' + cfg.playerId + '-' + now() + '-' + n,
          paymentID: 'stub-payment-' + n,
          purchaseTime: String(Math.floor(now() / 1000)),
          developerPayload: config.developerPayload,
          signedRequest: 'stub.signed',
          purchasePlatform: cfg.platform === 'ANDROID' ? 'GOOGLE' : 'FB',
          paymentActionType: 'charge',
          isConsumed: false,
        };
        purchasesList.push(p);
        writePurchases();
        return Promise.resolve(copy(p));
      },
      getPurchasesAsync: function () {
        record('payments.getPurchasesAsync');
        var no = unsupported('payments.getPurchasesAsync');
        if (no) return no;
        var err = payError('getPurchasesAsync');
        if (err) return Promise.reject(err);
        return Promise.resolve(
          copy(
            purchasesList.filter(function (p) {
              return !p.isConsumed;
            }),
          ),
        );
      },
      consumePurchaseAsync: function (token) {
        record('payments.consumePurchaseAsync', [token]);
        var no = unsupported('payments.consumePurchaseAsync');
        if (no) return no;
        var err = payError('consumePurchaseAsync');
        if (err) return Promise.reject(err);
        for (var i = 0; i < purchasesList.length; i++) {
          if (purchasesList[i].purchaseToken === token && !purchasesList[i].isConsumed) {
            purchasesList[i].isConsumed = true;
            writePurchases();
            return Promise.resolve();
          }
        }
        return Promise.reject(fbError('INVALID_PARAM', 'unknown or consumed token'));
      },
    };

    var sdk = {
      initializeAsync: function () {
        record('initializeAsync');
        return wait(cfg.initDelayMs).then(function () {
          state.initialized = true;
        });
      },
      setLoadingProgress: function (pct) {
        record('setLoadingProgress', [pct]);
        state.progress.push(pct);
      },
      startGameAsync: function () {
        record('startGameAsync');
        if (!state.initialized) return Promise.reject(fbError('INVALID_OPERATION', 'not initialized'));
        var err = nextError('startGameAsync');
        return wait(cfg.startDelayMs).then(function () {
          if (err) throw err;
          state.started = true;
        });
      },
      getLocale: function () {
        record('getLocale');
        return cfg.locale;
      },
      getPlatform: function () {
        record('getPlatform');
        return state.initialized ? cfg.platform : null;
      },
      getSDKVersion: function () {
        record('getSDKVersion');
        return cfg.sdkVersion;
      },
      getSupportedAPIs: function () {
        record('getSupportedAPIs');
        return cfg.supportedAPIs.slice();
      },
      onPause: function (cb) {
        record('onPause');
        pauseCbs.push(cb);
      },
      logEvent: function (name, value, params) {
        record('logEvent', [name, value === undefined ? null : value, params || null]);
        return null;
      },
      getInterstitialAdAsync: adFactory('interstitial', 'getInterstitialAdAsync'),
      getRewardedVideoAsync: adFactory('rewarded', 'getRewardedVideoAsync'),
      performHapticFeedbackAsync: function () {
        record('performHapticFeedbackAsync');
        return Promise.resolve();
      },
      player: player,
    };
    // phase2b members exist only while their API group is offered (absent → the adapter's typeof check fails too).
    function offered(api) {
      return cfg.supportedAPIs.indexOf(api) >= 0;
    }
    if (offered('loadBannerAdAsync')) sdk.loadBannerAdAsync = loadBannerAdAsync;
    if (offered('hideBannerAdAsync')) sdk.hideBannerAdAsync = hideBannerAdAsync;
    if (offered('getLeaderboardAsync')) sdk.getLeaderboardAsync = getLeaderboardAsync;
    if (offered('globalLeaderboards.setScoreAsync')) sdk.globalLeaderboards = globalLeaderboards;
    if (offered('overlayViews.createOverlayViewWithXMLString')) sdk.overlayViews = overlayViews;
    if (offered('tournament.createAsync')) sdk.tournament = tournament;
    if (offered('getTournamentAsync')) sdk.getTournamentAsync = getTournamentAsync;
    if (offered('payments.purchaseAsync')) sdk.payments = payments;

    var control = {
      calls: calls,
      state: state,
      config: cfg,
      /** Names of all calls so far, in order. */
      names: function () {
        return calls.map(function (c) {
          return c.name;
        });
      },
      count: function (name) {
        return calls.filter(function (c) {
          return c.name === name;
        }).length;
      },
      find: function (name) {
        return calls.filter(function (c) {
          return c.name === name;
        });
      },
      /** Deep-merges a config patch (e.g. change ad behaviour mid-test). */
      configure: function (patch) {
        var next = merge(cfg, patch || {});
        for (var k in next) cfg[k] = next[k];
      },
      /** Fires the onPause callbacks, as when the player switches away inside Facebook. */
      pause: function () {
        record('__pause');
        pauseCbs.slice().forEach(function (cb) {
          cb();
        });
      },
      playerData: function () {
        return copy(store);
      },
      setPlayerData: function (data) {
        store = copy(data) || {};
        writeStore();
      },
      clearCalls: function () {
        calls.length = 0;
      },
      // phase2b
      /** The stored rows of a leaderboard (by dashboard name / NEZP id), best first. */
      leaderboard: function (name) {
        return copy(sorted(name));
      },
      /** Sends an overlay custom event (an onTapEvent tap) to the game's handler, from the newest view. */
      overlayEvent: function (eventName) {
        var v = overlayViewsMade[overlayViewsMade.length - 1];
        record('__overlayEvent', [eventName]);
        if (overlayHandler) overlayHandler(eventName, v ? v.id : '');
      },
      /** Purchases so far (consumed ones included). */
      purchases: function () {
        return copy(purchasesList);
      },
      /** phase2c: the period index the stub uses for `period` seeding (offset from the current one, by its clock). */
      periodIndex: function (offset) {
        return periodIndexAt(now()) + (typeof offset === 'number' ? offset : 0);
      },
      /** Sets the player's current tournament context (null = none). */
      setTournament: function (t) {
        state.tournament = t ? copy(t) : null;
      },
    };
    return { sdk: sdk, control: control };
  }

  root.__createFbStub = createFbStub;
  if (!root.__FB_STUB_NO_INSTALL__) {
    var made = createFbStub(root.__FB_STUB_CONFIG__);
    root.FBInstant = made.sdk;
    root.__fbStub = made.control;
  }
})(typeof window !== 'undefined' ? window : globalThis);
