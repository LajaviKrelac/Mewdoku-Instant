// Owner: G1 (Phase 2e)
// The lazy `ladder` chunk (docs/phase2e/spec.md §2.12, §7.9; L0 named it assets/ladder-*.js): the ranking
// overlays (the sheet `ladder`, the result card `ladder_result`, the name sheet `nickname`), the bracket
// list the post-win panel borrows (RankingPanelProps.bracketList), and our word lists. ONE dynamic import
// (router.ts loadLadderChunk), prefetched at Home idle and at the mount of every scored board — never
// before the first screen and never on the tutorial board. Nothing may import it statically
// (tests/unit/layering.spec.ts). Its stylesheet keeps the barrel's name (assets/ladder-chunk-*.css).
import '../styles/ladder-chunk.css';
import '../i18n/en-lazy'; // the lazy English strings (I-4)

export { createLadderSheet } from '../ui/overlays/ladder-sheet';
export { createLadderResult } from '../ui/overlays/ladder-result';
export { createNicknameSheet } from '../ui/overlays/nickname-sheet';
export { createBracketList } from '../ui/overlays/bracket-list';
export { NICK_WORDS_V1, RETIRED_V1 } from '../shared/nick-words';
