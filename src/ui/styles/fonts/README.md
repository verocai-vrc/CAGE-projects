# Fonts — reproducing the subsets

Three self-hosted subsets per DESIGN.md §15.3. No CDN, no `@import`, no build-time
font pipeline: the `.woff2` files are committed and served from the bundle. If you
change the character coverage, re-run the commands below and commit the results.

| File | Role | Source | Size |
|---|---|---|---|
| `archivo-var.woff2` | Body, labels, buttons, prose — variable `wght` 400–700 | Archivo `wdth,wght` variable | 22.5KB |
| `archivo-cond-700.woff2` | Display — names, round numbers, VS, verdicts | Archivo instanced at `wdth=75, wght=700` | 9.9KB |
| `plex-mono-400.woff2` | All data — scorecards, logs, purses, weights, form values | IBM Plex Mono Regular | 6.7KB |

**Total 39.1KB** against the §15.9 ceiling of 60KB.

Both families are SIL Open Font License 1.1. License texts are committed beside the
fonts as `OFL-Archivo.txt` and `OFL-IBMPlexMono.txt`.

## Why Archivo twice, not two families

Google Fonts ships Archivo as a single `wdth,wght` variable font. Both the body face
and the condensed display face are instanced from that one source, which is what
keeps §15.1's "shared spine" literally true — the two registers are the same
typeface at two widths, not two typefaces that happen to sit together.

There is no separate "Archivo Condensed" family on Google Fonts. `wdth=75` is the
conventional condensed width and is what the display face is pinned to; the axis
bottoms out at 62, which closes up too far to read at 16px.

## Prerequisites

```
python -m pip install fonttools brotli zopfli
```

## 1. Fetch the upstream sources

```
curl -sL -o "Archivo[wdth,wght].ttf" \
  "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"
curl -sL -o "IBMPlexMono-Regular.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf"
```

## 2. Instance the two Archivo cuts

The body face keeps a live `wght` axis clamped to the range the design actually uses;
the display face is pinned to a static instance so it carries no variation tables.

```
python -m fontTools.varLib.instancer "Archivo[wdth,wght].ttf" wdth=100 wght=400:700 -o archivo-body.ttf
python -m fontTools.varLib.instancer "Archivo[wdth,wght].ttf" wdth=75  wght=700     -o archivo-cond.ttf
```

## 3. Subset

The coverage is ASCII plus the accents the nationality name pools can plausibly grow
into (Portuguese, Polish, Irish, macronised Japanese romanisation) plus the
typographic punctuation the UI uses. Content is ASCII today; the accents are included
so adding an accented name later never requires a font rebuild.

```
UNI="U+0020-007E,U+00A0,U+00A7,U+00B0,U+00B7,U+00D7,U+00C0-00FF,U+0104-0107,U+0118-0119,U+0141-0144,U+014C-014D,U+015A-015B,U+016A-016B,U+0179-017C,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2190-2193,U+2212,U+2264-2265"

python -m fontTools.subset archivo-body.ttf \
  --unicodes="$UNI" \
  --layout-features=kern,liga,ccmp,locl,mark,mkmk \
  --no-hinting --desubroutinize --flavor=woff2 \
  --output-file=archivo-var.woff2

python -m fontTools.subset archivo-cond.ttf \
  --unicodes="$UNI" \
  --layout-features=kern,liga,ccmp,locl \
  --no-hinting --desubroutinize --flavor=woff2 \
  --output-file=archivo-cond-700.woff2

python -m fontTools.subset IBMPlexMono-Regular.ttf \
  --unicodes="$UNI" \
  --layout-features=kern,liga,ccmp,locl \
  --no-hinting --desubroutinize --flavor=woff2 \
  --output-file=plex-mono-400.woff2
```

Emoji in the share card (`🟩🟥🟨⬜`) are deliberately **not** subsetted in — they
resolve from the system emoji font. Flags never use emoji (§15.5).

## 4. Fallback metrics

`@font-face` blocks in `src/index.css` declare `font-display: swap` with
`size-adjust`-matched fallbacks so the swap does not reflow the layout. The
adjustments were measured, not estimated: the mean advance width of
`[a-zA-Z0-9 ]` in each subset was divided by the same measure in the local
fallback face, and the ascent/descent overrides were then divided back through
that ratio so the line box is unchanged across the swap.

| Face | Fallback measured against | `size-adjust` | `ascent-override` | `descent-override` |
|---|---|---|---|---|
| Archivo | Arial | 103.5% | 84.8% | 20.3% |
| Archivo Condensed 700 | Arial Bold | 80.7% | 108.9% | 26.0% |
| IBM Plex Mono | Consolas | 109.1% | 93.9% | 25.2% |

To re-measure after a coverage change:

```
python -c "
from fontTools.ttLib import TTFont
S='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
def m(p):
    f=TTFont(p); u=f['head'].unitsPerEm; c=f.getBestCmap(); h=f['hmtx']
    w=[h[c[ord(x)]][0] for x in S if ord(x) in c]
    return sum(w)/len(w)/u, f['hhea'].ascender/u, abs(f['hhea'].descender)/u
t=m('archivo-body.ttf'); fb=m('C:/Windows/Fonts/arial.ttf')
s=t[0]/fb[0]
print(f'size-adjust {s*100:.1f}%  ascent {t[1]/s*100:.1f}%  descent {t[2]/s*100:.1f}%')
"
```

Arial Narrow is *not* used as the condensed fallback: it is absent on stock Windows
installs (`ARIALNB.TTF` is not present on the primary development target), so a
fallback keyed to it would silently fall through to something unmeasured. Arial Bold
narrowed by `size-adjust: 80.7%` is the honest substitute.
