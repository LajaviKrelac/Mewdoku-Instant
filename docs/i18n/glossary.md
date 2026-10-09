# Translation glossary

Status: Phase 2b AI-draft glossary, Phase 2c fish update · Date: 2026-10-09 · Owner: workstream E (localization); Phase 2c rows: workstream G2 · Used with [`src/i18n/meta.ts`](../../src/i18n/meta.ts) (per-key notes and max lengths) and the English catalogue [`src/i18n/en.ts`](../../src/i18n/en.ts)

This glossary is part of the translation brief (phase2b §6.7 step 2). The brief contains **only our own English copy, `meta.ts` and this file**. It never names, quotes or describes any other game, and translators must not look at any other game's localized UI (06 §2 step 6).

## 1. Rules for every language

| Rule | Detail |
|---|---|
| Voice | Warm, calm and short. A cosy cat puzzle, not a quiz. Same register as the English. |
| Address | Informal "you" where games normally use it (de *du*, fr *tu*, es *tú*, it *tu*, pt-BR *você*, tr *sen*, pl *ty*). Polite where that is the norm in games: ru imperative plural (*Коснитесь*), ja です/ます (short labels plain), ko 해요체, hi *आप*. Neutral imperatives in id, vi, th, zh-Hans. Arabic: Modern Standard Arabic, masculine singular imperative, the usual app convention. |
| Placeholders | Keep every `{name}` exactly. Move it wherever the grammar needs it. Never translate the name inside the braces. |
| Keyword markers | Teaching copy (`tutorial.step1`–`step4`, `howto.rule.*`) wraps its rule keyword in `*…*` ("Every colour hides `*exactly one cat*`"); the game prints it in the accent colour. Keep exactly as many marked spans as the English has, around the words that carry the same rule in your sentence, and never add markers elsewhere (`npm run i18n:check` enforces both; review PAR-7). |
| Plurals | Keys ending in `.one` / `.other` are plural pairs. Add `.zero`, `.two`, `.few` or `.many` where your language uses them (the catalogue test lists what `Intl.PluralRules` requires). `{count}` may be left out only in a form that stands for one exact number (Arabic one, two and zero). |
| Numbers in non-plural keys | `{points}`, `{hours}`, `{kitties}`, `{total}`, `{best}`, `{count}` outside `.one`/`.other` keys can be any number. In languages with case or number agreement (ru, pl, ar, hi), use a label + colon construction so any number reads correctly: ru «Очки: +{points}», pl «Punkty: +{points}». |
| Colour names in sentences | `{color}` is a proper name. Use it **in apposition** ("the colour Lavender", «цвет «Лаванда»», *la couleur Lavande*) so adjectives never need to agree with it. |
| Rows, columns and colours as `{unit}` | `{unit}` is a row ("row 3"), a column ("column 5") or a colour name. In languages with grammatical case, build the sentence so `{unit}` stays in the nominative, usually with a colon: «{unit}: осталась одна свободная клетка…». |
| Digits | Latin digits everywhere, including Arabic and Hindi. |
| Banned | Never write "golden fish" (or its translation); fish are just fish. Never use another game's rule names or slogans. |
| Fish are lives and points, never money (Phase 2c) | A fish is a life in a level; the fish left at a win are added to the period ranking total. Never write coins, wallet, balance, price, "buy with fish", "spend" or "earn" for fish, and never call them hearts. Key names such as `game.hearts.a11y`, `howto.hearts`, `fail.*` and the `{hearts}` placeholder are code names only: the copy says fish. The only heart left in the game is the pattern glyph 9 (section 4) and our event's yarn heart. |
| Period words (Phase 2c) | The ranking period resets at 00:00 UTC (`cfg.period.kind`: day, week by default, or month). "This week" in a pill or a tab is the current period, never "the last 7 days". Keep the three kinds parallel (Today / This week / This month). |
| Length | Respect `maxLength` in `meta.ts` (chips 18, buttons 22, titles 28, badges 6–9). Abbreviate units ("h", "min") freely. |

## 2. Core terms

| English | Notes | de | es | fr | it | pt-BR | id | tr | pl |
|---|---|---|---|---|---|---|---|---|---|
| cat (piece) | the game piece | Katze | gato | chat | gatto | gato | kucing | kedi | kot |
| kitty (paw booster) | a cute word for a small cat, always the same word; plural kitties | Kätzchen | gatito | minou | micio | gatinho | meong | pisi | kotek |
| fish (a life; a ranking point) | plain fish, never "golden", never money; one fish = one life, and the fish left at a win go to the period ranking | Fisch | pez / peces | poisson | pesce | peixe | ikan | balık | rybka |
| hint (bulb) | | Tipp | pista | indice | indizio | dica | petunjuk | ipucu | podpowiedź |
| tile | one square of the board | Feld | casilla | case | casella | casa | kotak | kare | pole |
| cross out (X) | mark a tile as "no cat" | durchstreichen | tachar | barrer | barrare | riscar | coret | çarpı koymak | skreślić |
| row / column | numbered from 1 | Zeile / Spalte | fila / columna | ligne / colonne | riga / colonna | linha / coluna | baris / kolom | satır / sütun | wiersz / kolumna |
| colour (region) | | Farbe | color | couleur | colore | cor | warna | renk | kolor |
| level | | Level | nivel | niveau | livello | nível | level | bölüm | poziom |
| daily puzzle | | Tagesrätsel | reto del día | défi du jour | puzzle del giorno | desafio do dia | teka-teki harian | günün bulmacası | zagadka dnia |
| points (level points) | the score a win gives; better with a perfect streak | Punkte | puntos | points | punti | pontos | poin | puan | punkty |
| weekly ranking | the period ranking of fish kept (title) | Wochenrangliste | ranking semanal | classement hebdo | classifica settimanale | ranking semanal | peringkat mingguan | haftalık sıralama | ranking tygodnia |
| this week | the current period (tab, pill) | diese Woche | esta semana | cette semaine | settimana | esta semana | minggu ini | bu hafta | ten tydzień |
| perfect streak | wins in a row without a mistake | perfekte Serie | racha perfecta | série parfaite | serie perfetta | sequência perfeita | rentetan sempurna | kusursuz seri | idealna seria |
| event | limited-time event | Event | evento | événement | evento | evento | event | etkinlik | wydarzenie |
| group challenge | | Gruppen-Challenge | desafío en grupo | défi de groupe | sfida di gruppo | desafio em grupo | tantangan grup | grup yarışması | wyzwanie grupowe |
| shop | real-money packs only; there is no swap and no fish for sale (Phase 2c) | Shop | tienda | boutique | negozio | loja | toko | mağaza | sklep |
| Settings | | Einstellungen | Ajustes | Réglages | Impostazioni | Ajustes | Pengaturan | Ayarlar | Ustawienia |
| colour patterns | small symbols on the colours | Farbmuster | patrones de color | motifs de couleur | motivi colore | padrões de cor | pola warna | renk desenleri | wzory kolorów |

| English | ru | vi | th | ja | ko | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|
| cat (piece) | кошка | mèo | แมว | ねこ | 고양이 | 猫 | बिल्ली | قطة |
| kitty (paw booster) | котик | mèo con | เหมียว | こねこ | 냥이 | 猫咪 | किटी | قُطيطة |
| fish (a life; a ranking point) | рыбка | cá | ปลา | さかな | 물고기 | 小鱼 | मछली | سمكة |
| hint (bulb) | подсказка | gợi ý | คำใบ้ | ヒント | 힌트 | 提示 | संकेत | تلميح |
| tile | клетка | ô | ช่อง | マス | 칸 | 格子 | खाना | خانة |
| cross out (X) | вычеркнуть | gạch | กากบาท | バツをつける | X 표시 | 划掉 | काटना | شطب |
| row / column | строка / столбец | hàng / cột | แถว / คอลัมน์ | 行 / 列 | 행 / 열 | 行 / 列 | पंक्ति / कॉलम | صف / عمود |
| colour (region) | цвет | màu | สี | 色 | 색 | 颜色 | रंग | لون |
| level | уровень | màn | ด่าน | レベル | 레벨 | 关 (第 N 关) | लेवल | المستوى |
| daily puzzle | пазл дня | câu đố hôm nay | ปริศนาประจำวัน | 今日のパズル | 오늘의 퍼즐 | 每日谜题 | आज की पहेली | لغز اليوم |
| points (level points) | очки | điểm | แต้ม | ポイント | 포인트 | 积分 | पॉइंट | النقاط |
| weekly ranking | рейтинг недели | xếp hạng tuần | อันดับรายสัปดาห์ | 週間ランキング | 주간 랭킹 | 本周排行 | हफ़्ते की रैंकिंग | ترتيب الأسبوع |
| this week | эта неделя | tuần này | สัปดาห์นี้ | 今週 | 이번 주 | 本周 | इस हफ़्ते | هذا الأسبوع |
| perfect streak | идеальная серия | chuỗi hoàn hảo | ชนะแบบเพอร์เฟกต์ติดกัน | パーフェクト連勝 | 퍼펙트 연승 | 完美连胜 | परफ़ेक्ट सिलसिला | سلسلة مثالية |
| event | событие | sự kiện | อีเวนต์ | イベント | 이벤트 | 活动 | इवेंट | فعالية |
| group challenge | групповое испытание | thử thách nhóm | ชาเลนจ์กลุ่ม | グループチャレンジ | 그룹 챌린지 | 小组挑战 | ग्रुप चैलेंज | تحدي المجموعة |
| shop | магазин | cửa hàng | ร้านค้า | ショップ | 상점 | 商店 | दुकान | المتجر |
| Settings | Настройки | Cài đặt | การตั้งค่า | 設定 | 설정 | 设置 | सेटिंग्स | الإعدادات |
| colour patterns | узоры на цветах | họa tiết màu | ลวดลายสี | 色の模様 | 색상 무늬 | 颜色图案 | रंग पैटर्न | نقوش الألوان |

## 3. Colour names (palette index 0–11)

Short proper names, each distinct from the other eleven in the same language. Where the fruit word is ambiguous locally, another word for the same hue is used (pt-BR: *Banana* for Lemon and *Limão* for Lime, because Brazilian *limão* is green).

| # | English | de | es | fr | it | pt-BR | id | tr | pl |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Strawberry | Erdbeere | Fresa | Fraise | Fragola | Morango | Stroberi | Çilek | Truskawka |
| 1 | Apricot | Aprikose | Durazno | Abricot | Albicocca | Damasco | Aprikot | Kayısı | Morela |
| 2 | Lemon | Zitrone | Limón | Citron | Limone | Banana | Lemon | Limon | Cytryna |
| 3 | Lime | Limette | Lima | Citron vert | Lime | Limão | Limau | Misket | Limonka |
| 4 | Mint | Minze | Menta | Menthe | Menta | Hortelã | Mint | Nane | Mięta |
| 5 | Lagoon | Lagune | Laguna | Lagon | Laguna | Lagoa | Laguna | Lagün | Laguna |
| 6 | Sky | Himmel | Cielo | Ciel | Cielo | Céu | Langit | Gök | Niebo |
| 7 | Lavender | Lavendel | Lavanda | Lavande | Lavanda | Lavanda | Lavender | Lavanta | Lawenda |
| 8 | Orchid | Orchidee | Orquídea | Orchidée | Orchidea | Orquídea | Anggrek | Orkide | Orchidea |
| 9 | Cocoa | Kakao | Cacao | Cacao | Cacao | Cacau | Kakao | Kakao | Kakao |
| 10 | Slate | Schiefer | Pizarra | Ardoise | Ardesia | Ardósia | Sabak | Arduvaz | Łupek |
| 11 | Moss | Moos | Musgo | Mousse | Muschio | Musgo | Lumut | Yosun | Mech |

| # | English | ru | vi | th | ja | ko | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|---|
| 0 | Strawberry | Клубника | Dâu tây | สตรอว์เบอร์รี | いちご | 딸기 | 草莓 | स्ट्रॉबेरी | فراولة |
| 1 | Apricot | Абрикос | Mơ | แอปริคอต | あんず | 살구 | 杏子 | खुबानी | مشمش |
| 2 | Lemon | Лимон | Chanh vàng | เลมอน | レモン | 레몬 | 柠檬 | नींबू | ليمون |
| 3 | Lime | Лайм | Chanh xanh | มะนาว | ライム | 라임 | 青柠 | लाइम | لايم |
| 4 | Mint | Мята | Bạc hà | มินต์ | ミント | 민트 | 薄荷 | पुदीना | نعناع |
| 5 | Lagoon | Лагуна | Đầm phá | ลากูน | ラグーン | 라군 | 泻湖 | लैगून | بحيرة |
| 6 | Sky | Небо | Bầu trời | ท้องฟ้า | そら | 하늘 | 天空 | आसमान | سماء |
| 7 | Lavender | Лаванда | Oải hương | ลาเวนเดอร์ | ラベンダー | 라벤더 | 薰衣草 | लैवेंडर | خزامى |
| 8 | Orchid | Орхидея | Phong lan | กล้วยไม้ | ラン | 난초 | 兰花 | ऑर्किड | أوركيد |
| 9 | Cocoa | Какао | Ca cao | โกโก้ | ココア | 코코아 | 可可 | कोको | كاكاو |
| 10 | Slate | Сланец | Đá phiến | หินชนวน | スレート | 슬레이트 | 石板 | स्लेटी | أردواز |
| 11 | Moss | Мох | Rêu | ตะไคร่ | こけ | 이끼 | 苔藓 | काई | طحلب |

## 4. Pattern glyph names (palette index 0–11)

Shapes: a filled dot, a ring, a triangle, a square, a diamond (rhombus), a star, a plus, a horizontal bar, a chevron pointing up (like a roof), a heart, a drop, a crescent moon. Lower case unless the language capitalises nouns.

| # | English | de | es | fr | it | pt-BR | id | tr | pl | ru | vi | th | ja | ko | zh-Hans | hi | ar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | dot | Punkt | punto | point | punto | ponto | titik | nokta | kropka | точка | chấm | จุด | 点 | 점 | 圆点 | बिंदु | نقطة |
| 1 | ring | Ring | anillo | anneau | anello | anel | cincin | halka | pierścień | кольцо | vòng | วงแหวน | 輪 | 고리 | 圆环 | छल्ला | حلقة |
| 2 | triangle | Dreieck | triángulo | triangle | triangolo | triângulo | segitiga | üçgen | trójkąt | треугольник | tam giác | สามเหลี่ยม | 三角 | 삼각형 | 三角 | त्रिकोण | مثلث |
| 3 | square | Quadrat | cuadrado | carré | quadrato | quadrado | persegi | kare | kwadrat | квадрат | hình vuông | สี่เหลี่ยม | 四角 | 사각형 | 方块 | वर्ग | مربع |
| 4 | diamond | Raute | rombo | losange | rombo | losango | belah ketupat | baklava | romb | ромб | hình thoi | ข้าวหลามตัด | ひし形 | 마름모 | 菱形 | हीरा | معيّن |
| 5 | star | Stern | estrella | étoile | stella | estrela | bintang | yıldız | gwiazda | звезда | ngôi sao | ดาว | 星 | 별 | 星星 | तारा | نجمة |
| 6 | plus | Plus | cruz | croix | croce | cruz | tambah | artı | krzyżyk | плюс | dấu cộng | บวก | 十字 | 십자 | 十字 | प्लस | زائد |
| 7 | bar | Balken | barra | barre | barra | barra | batang | çubuk | belka | полоска | thanh | แถบ | 棒 | 막대 | 横条 | पट्टी | شريط |
| 8 | chevron | Winkel | uve | chevron | punta | ponta | atap | şapka | daszek | уголок | mái nhà | หัวลูกศร | 山形 | 꺾쇠 | 尖角 | छत | سقف |
| 9 | heart | Herz | corazón | cœur | cuore | coração | hati | kalp | serce | сердечко | trái tim | หัวใจ | ハート | 하트 | 爱心 | दिल | قلب |
| 10 | drop | Tropfen | gota | goutte | goccia | gota | tetes | damla | kropla | капля | giọt nước | หยดน้ำ | しずく | 물방울 | 水滴 | बूंद | قطرة |
| 11 | moon | Mond | luna | lune | luna | lua | bulan | ay | księżyc | луна | trăng | พระจันทร์ | 月 | 달 | 月亮 | चाँद | هلال |

## 5. Our own names (events, products, praise)

Event names and product names are ours. Translate their meaning and keep them short and cosy; they need not be literal. Praise words are cat-themed exclamations: write natural ones in your language (puns welcome) rather than literal translations, and keep the six different from one another.
