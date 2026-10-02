#!/usr/bin/env python3
"""
Builds "gap-filler" slices for Noto Sans SC / Noto Serif SC.

Why: the Google-Fonts / fontsource web versions of Noto Sans SC & Noto Serif SC are split into ~100
unicode-range slices that only contain ~13.6k of the ~30.9k code points in the real fonts. 8,734 CJK
Unified Ideographs are in NO slice -- including 33 GB2312 hanzi such as 劐阢坶塥蒈蓰猸弪艴骣桊轷戤赇牿犋毪胲脶膪憝铴镩稆瘭耠耢耥蟓筢蹯鲰齄 --
so the browser silently falls back to a system font (WenQuanYi) for them.

This script downloads the full variable fonts from github.com/google/fonts, subsets every code point
that the npm slices do not cover into extra woff2 slices (variable wght axis preserved), and writes
fonts-extra/manifest.json, which scripts/setup-assets.mjs merges into fonts/fonts.css.

    pip install fonttools brotli && python3 scripts/build-cjk-gap-fonts.py
"""
import io
import json
import os
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src')
OUT = os.path.join(ROOT, 'fonts-extra')
CHUNK = 1200

FAMILIES = [
    {
        'family': 'Noto Sans SC', 'dir': 'noto-sans-sc', 'weight': '100 900',
        'css': 'node_modules/@fontsource-variable/noto-sans-sc/wght.css',
        'url': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf',
        'file': 'NotoSansSC[wght].ttf',
    },
    {
        'family': 'Noto Serif SC', 'dir': 'noto-serif-sc', 'weight': '200 900',
        'css': 'node_modules/@fontsource-variable/noto-serif-sc/wght.css',
        'url': 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
        'file': 'NotoSerifSC[wght].ttf',
    },
]


def css_ranges(path):
    css = open(os.path.join(ROOT, path), encoding='utf-8').read()
    out = []
    for m in re.finditer(r'unicode-range:\s*([^;}]+)', css):
        for part in m.group(1).split(','):
            part = part.strip().upper().replace('U+', '')
            if not part:
                continue
            a, _, b = part.partition('-')
            out.append((int(a, 16), int(b or a, 16)))
    return out


def to_unicode_range(cps):
    cps = sorted(cps)
    runs = []
    start = prev = cps[0]
    for cp in cps[1:]:
        if cp == prev + 1:
            prev = cp
            continue
        runs.append((start, prev))
        start = prev = cp
    runs.append((start, prev))
    return ','.join(f'U+{a:x}' if a == b else f'U+{a:x}-{b:x}' for a, b in runs)


def main():
    os.makedirs(SRC, exist_ok=True)
    manifest = []
    for fam in FAMILIES:
        src = os.path.join(SRC, fam['file'])
        if not os.path.exists(src):
            print(f"downloading {fam['url']}")
            urllib.request.urlretrieve(fam['url'], src)
        data = open(src, 'rb').read()
        full = TTFont(io.BytesIO(data), lazy=True)
        cmap = set(full.getBestCmap())
        version = full['name'].getDebugName(5)
        ranges = css_ranges(fam['css'])
        gap = sorted(cp for cp in cmap if cp > 0x20 and not any(a <= cp <= b for a, b in ranges))
        print(f"{fam['family']} ({version}): {len(cmap)} code points, {len(cmap) - len(gap)} in npm slices, {len(gap)} gap -> {(len(gap) + CHUNK - 1) // CHUNK} extra slices")
        outdir = os.path.join(OUT, fam['dir'])
        os.makedirs(outdir, exist_ok=True)
        for i in range(0, len(gap), CHUNK):
            cps = gap[i:i + CHUNK]
            font = TTFont(io.BytesIO(data))
            opts = subset.Options()
            opts.layout_features = ['*']
            opts.name_IDs = ['*']
            opts.name_languages = ['*']
            opts.notdef_outline = True
            opts.hinting = False
            opts.flavor = 'woff2'
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=cps)
            sub.subset(font)
            name = f"{fam['dir']}-gap{i // CHUNK:02d}-wght-normal.woff2"
            font.flavor = 'woff2'
            font.save(os.path.join(outdir, name))
            manifest.append({
                'family': fam['family'], 'dir': fam['dir'], 'file': f"{fam['dir']}/{name}",
                'style': 'normal', 'weight': fam['weight'], 'unicodeRange': to_unicode_range(cps),
                'chars': len(cps), 'source': f"{fam['file']} {version}",
            })
            print(f"  {name}: {len(cps)} chars, {os.path.getsize(os.path.join(outdir, name)) // 1024} KB")
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    print(f"wrote {os.path.join(OUT, 'manifest.json')}")


if __name__ == '__main__':
    main()
