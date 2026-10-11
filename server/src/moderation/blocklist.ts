// Owner: G4 (Phase 2e). Our own name blocklist (spec §1.8): checked against every generated name (the build
// test pairs every adjective with every noun, server/test/unit/nick.spec.ts) and, only if free text is ever
// switched on (`nickname.freeText`), against typed names. Entries are written plainly here and compared as
// SKELETONS (core/moderation.ts: lowercase, 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s, non-letters stripped,
// repeated letters collapsed), so look-alike spellings match too.
//   strong     — matched as a SUBSTRING of the whole name's skeleton: words that never sit inside an
//                innocent word once skeletonised.
//   ambiguous  — matched as a WHOLE WORD only: short or double-meaning words that appear inside innocent ones
//                (and cat words with a second meaning we would not want on a stranger's screen).
// Starter entries for the 17 locales are romanised; the generated names are English words only. Additions:
// keep each list sorted and run `npm --prefix server test -- nick`.

export const BLOCKLIST: { readonly strong: readonly string[]; readonly ambiguous: readonly string[] } = {
  strong: [
    // English
    'asshole', 'bastard', 'bitch', 'blowjob', 'bollocks', 'bullshit', 'clitoris', 'cocksucker', 'cunt', 'dildo',
    'ejaculat', 'erection', 'faggot', 'fuck', 'genital', 'handjob', 'hitler', 'jizz', 'masturbat',
    'molest', 'motherfuck', 'nazi', 'nigga', 'orgasm', 'paedophil', 'pedophil', 'porn', 'shit', 'testicle',
    'twat', 'wanker', 'whore',
    // de, fr, es, it, pt, nl, pl, tr, ru, id, hi, ko, zh, ar, th, vi (romanised starters)
    'arschloch', 'fotze', 'wichser', 'schlampe', 'scheisse',
    'connard', 'encule', 'putain', 'salope',
    'cabron', 'gilipollas', 'mierda', 'pendejo', 'maricon',
    'cazzo', 'stronzo', 'vaffanculo', 'puttana',
    'buceta', 'caralho', 'viado',
    'klootzak', 'kankerlijer',
    'kurwa', 'pierdol', 'skurwysyn',
    'orospu', 'siktir',
    'blyat', 'pizdec', 'pizda', 'zalupa',
    'bangsat', 'kontol', 'memek',
    'bhenchod', 'chutiya', 'madarchod',
    'gaesaekki', 'shibal',
    'caonima',
    'sharmouta',
    'kuay',
    'dcm',
  ],
  ambiguous: [
    // English
    'anal', 'anus', 'arse', 'ass', 'boob', 'boobs', 'butt', 'chink', 'cock', 'coon', 'crap', 'cum', 'damn',
    'dick', 'dyke', 'fag', 'fart', 'fat', 'fuk', 'gook', 'hell', 'ho', 'hoe', 'homo', 'idiot', 'isis', 'jihad',
    'kike', 'kill', 'loser', 'meth', 'moron', 'naked', 'negro', 'nigger', 'nude', 'pedo', 'penis', 'piss', 'poo',
    'poop', 'pussy', 'rape', 'rapist', 'retard', 'sex', 'sexy', 'slut', 'spic', 'stfu', 'stupid', 'suck', 'tit',
    'tits', 'tranny', 'ugly', 'vagina', 'wank', 'weed', 'wop', 'wtf',
    // locale starters that are also innocent words or parts of them elsewhere
    'arsch', 'hure', 'merde', 'pute', 'puta', 'coño', 'cono', 'joder', 'merda', 'troia', 'porra', 'foda',
    'kut', 'lul', 'hoer', 'chuj', 'amk', 'suka', 'huy', 'gandu', 'kos',
  ],
};
