# Owner: lead (Phase 2d I-polish a)
# Removes the overlapping contours of the two display-font files (Fredoka 600, Latin and Latin
# extended; SIL OFL 1.1, see src/assets/fonts/OFL.txt and docs/provenance.md). The glyph set, the
# metrics and the kerning stay; only overlapping contours are merged (and the composite glyphs
# decomposed), so a text stroke painted over the glyphs in the background colour thins them evenly
# instead of drawing seams where two contours cross (the lighter "Level" / "Score" labels and rule-card
# text, hud.css). Not part of the build: run once by hand when the font files change.
#   python3 -m venv /tmp/fv && /tmp/fv/bin/pip install fonttools==4.66.1 skia-pathops brotli
#   /tmp/fv/bin/python -I dev/font-overlaps.py src/assets/fonts/display-latin.woff2 src/assets/fonts/display-latin-ext.woff2
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps

for path in sys.argv[1:]:
    font = TTFont(path)
    removeOverlaps(font)
    font.flavor = 'woff2'
    font.save(path)
    print(path, 'done')
