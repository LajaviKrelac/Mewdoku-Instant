// Owner: platform
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
    errors: { getDataAsync: [], setDataAsync: [], flushDataAsync: [], startGameAsync: [] },
    ads: {
      interstitial: { load: 'ok', loadDelayMs: 0, show: 'ok', showDelayMs: 300 },
      rewarded: { load: 'ok', loadDelayMs: 0, show: 'ok', showDelayMs: 300 },
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
    return c;
  }

  function createFbStub(config) {
    var cfg = resolveConfig(config);
    var calls = [];
    var seq = 0;
    var pauseCbs = [];
    var state = { initialized: false, started: false, progress: [], flushing: false, adsCreated: 0, adsShowing: 0 };

    function wait(ms) {
      if (!ms || ms <= 0) return Promise.resolve();
      return new Promise(function (resolve) {
        root.setTimeout(resolve, ms);
      });
    }
    function record(name, args) {
      var entry = { seq: ++seq, name: name, args: copy(args || []), t: Date.now(), beforeInit: !state.initialized };
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
