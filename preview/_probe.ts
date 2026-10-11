import { evaluateWins } from '../server/src/core/wins';
import { rankRows, paidPlaces, grantOf, heartsNew, bracketTimes } from '../server/src/core/brackets';
import { generateNick, renderNick, checkPick, nextNickChange } from '../server/src/core/nickname';
import { DEFAULT_CONFIG } from '../server/src/core/config';
import { createLookup } from '../server/src/content/lookup';
import { SOLUTIONS } from '../server/src/content/generated/solutions';
import { NICK_WORDS_V1, RETIRED_V1 } from '../server/src/contract/words';
export const x = [evaluateWins, rankRows, paidPlaces, grantOf, heartsNew, bracketTimes, generateNick, renderNick, checkPick, nextNickChange, DEFAULT_CONFIG, createLookup, SOLUTIONS, NICK_WORDS_V1, RETIRED_V1];
