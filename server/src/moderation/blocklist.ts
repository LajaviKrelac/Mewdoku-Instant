// Owner: G4 (Phase 2e). Our own name blocklist (spec §1.8): checked against every generated name (the build
// test pairs every adjective with every noun, server/test/unit/nick.spec.ts) and against typed names
// (`nickname.freeText`, on since the UI batch of 2026-10-13). Entries are written plainly here and compared as
// SKELETONS (core/moderation.ts: NFKD, lowercase, 0→o 1→i 3→e 4→a 5→s 7→t @→a $→s, accents dropped, non-letters
// stripped, repeated letters collapsed; and once more with Cyrillic and Greek look-alikes read as Latin), so
// look-alike spellings match too.
//   strong     — matched as a SUBSTRING of the whole name's skeleton: words that never sit inside an
//                innocent word once skeletonised (display width ≥ 3: a 2-character Chinese term counts).
//   ambiguous  — matched as a WHOLE WORD only: short or double-meaning words that appear inside innocent ones
//                (and cat words with a second meaning we would not want on a stranger's screen). UI batch: "ho" and
//                "huy" left (Ho Minh, Huy Tran are common Vietnamese names).
//   innocent   — place, given and family names that contain a strong term; cut out of a name before the substring
//                test. Review fix (2026-10-14): "porn", "nazi", "shit" and "nigga" are strong again (as whole words
//                they would let "NiggaCat", "Nazism" and "S h i t" through); the names they sit in are innocent
//                words instead (Pornchai, Nazia, Hoshita, Yamashita, Kshitij, Nigar …), and the four stay ambiguous
//                too, so a term split out of an innocent word ("Ho Shit A", "Nazi A") is still a word that is caught.
// Each locale has romanised starters and, since the UI batch, the worst terms in its own script (Cyrillic, Thai,
// Japanese, Korean, Chinese, Devanagari, Arabic, Vietnamese). Additions: keep each group's order and run
// `npm --prefix server test -- nick`.

export const BLOCKLIST: { readonly strong: readonly string[]; readonly ambiguous: readonly string[]; readonly innocent: readonly string[] } = {
  strong: [
    // English
    'asshole', 'bastard', 'bitch', 'blowjob', 'bollocks', 'bullshit', 'clitoris', 'cocksucker', 'cunt', 'dildo',
    'ejaculat', 'erection', 'faggot', 'fuck', 'genital', 'handjob', 'hitler', 'jizz', 'masturbat', 'molest',
    'motherfuck', 'nazi', 'nigga', 'orgasm', 'paedophil', 'pedophil', 'porn', 'shit', 'testicle', 'twat', 'wanker',
    'whore',
    // de, fr, es, it, pt, nl, pl, tr, ru, id, hi, ko, zh, ar, th, vi (romanised starters)
    'arschloch', 'fotze', 'hurensohn', 'wichser', 'schlampe', 'scheisse',
    'connard', 'encule', 'putain', 'salope',
    'cabron', 'culero', 'gilipollas', 'hijodeputa', 'mierda', 'pendejo', 'maricon',
    'cazzo', 'coglione', 'minchia', 'stronzo', 'vaffanculo', 'puttana',
    'arrombado', 'buceta', 'caralho', 'filhodaputa', 'viado',
    'klootzak', 'kankerlijer',
    'jebac', 'kurwa', 'pierdol', 'skurwysyn',
    'orospu', 'siktir',
    'blyat', 'pizdec', 'pizda', 'zalupa',
    'bangsat', 'jancok', 'kontol', 'memek', 'ngentot',
    'bhenchod', 'chutiya', 'madarchod',
    'gaesaekki', 'shibal',
    'caonima',
    'sharmouta',
    'kuay',
    'dcm', 'vcl',
    // in the locales' own scripts (UI batch): ru, th, ja, ko, zh-Hans, hi, ar
    'блять', 'ебать', 'залупа', 'мудак', 'пидор', 'пизда', 'хуесос',
    'ควย', 'เย็ด', 'เหี้ย',
    'くたばれ', 'ちんこ', 'ちんぽ', 'まんこ', '死ね',
    '개새끼', '병신', '씨발', '좆같',
    '傻屄', '傻逼', '婊子', '操你妈', '草泥马', '贱人', '鸡巴',
    'चूतिया', 'बहनचोद', 'भेनचोद', 'भोसड़ी', 'मादरचोद', 'हरामी',
    'شرموطة', 'عاهرة', 'قحبة', 'كسامك', 'منيوك',
  ],
  ambiguous: [
    // English
    'anal', 'anus', 'arse', 'ass', 'boob', 'boobs', 'butt', 'chink', 'cock', 'coon', 'crap', 'cum', 'damn',
    'dick', 'dyke', 'fag', 'fart', 'fat', 'fuk', 'gook', 'hell', 'hoe', 'homo', 'idiot', 'isis', 'jihad',
    'kike', 'kill', 'loser', 'meth', 'moron', 'naked', 'nazi', 'nazis', 'negro', 'nigga', 'niggas', 'nigger', 'nude',
    'pedo', 'penis', 'piss', 'poo', 'poop', 'porn', 'pussy', 'rape', 'rapist', 'retard', 'sex', 'sexy', 'shit', 'shite',
    'shits', 'shitty', 'slut', 'spic', 'stfu', 'stupid', 'suck', 'tit', 'tits', 'tranny', 'ugly', 'vagina', 'wank',
    'weed', 'wop', 'wtf',
    // locale starters that are also innocent words or parts of them elsewhere
    'arsch', 'fick', 'hure', 'merde', 'pute', 'puta', 'coño', 'cono', 'joder', 'verga', 'merda', 'troia', 'porra', 'foda',
    'kut', 'lul', 'hoer', 'chuj', 'amk', 'suka', 'gandu', 'kos',
    // in the locales' own scripts (UI batch): ru, th, ko, hi, ar, vi
    'бля', 'ебал', 'сука', 'суки', 'хуй',
    'สัส',
    '시발', '썅', '좆',
    'गांडू', 'रंडी', 'लौड़ा',
    'زب', 'كس',
    'địt',
  ],
  innocent: [
    'atwater', 'scunthorpe',
    // review fix (2026-10-14): names around the four short strong terms (porn, nazi, shit, nigga)
    'pornchai', 'pornpimol', 'pornsak', 'pornthip', 'porntip',
    'nazia', 'nazim', 'nazir',
    'hoshita', 'kinoshita', 'kshitij', 'matsushita', 'yamashita', 'yoshitaka',
    'nigar',
  ],
};
