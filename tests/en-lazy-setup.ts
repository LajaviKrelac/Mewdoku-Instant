// Owner: lead (Phase 2e I-4). Every vitest file sees the whole English table: the game registers the lazy strings when
// a lazy chunk loads (src/i18n/en-lazy.ts), but unit and dom tests import views and flows directly, without the chunk
// barrels. Which strings the FIRST LOAD carries is checked by tests/unit/i18n/first-load-strings.spec.ts instead.
import '../src/i18n/en-lazy';
