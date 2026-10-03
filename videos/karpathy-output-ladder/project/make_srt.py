#!/usr/bin/env python3
"""build/timeline.json -> SRT subtitles (same timing and line breaks as the burned-in captions)."""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUNCT, CLOSE = "，。：；！？、", "”」）"


def fmt(t):
    t = max(0.0, t)
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def brk(text, width=24):
    if len(text) <= width:
        return text
    mid, best, bd = len(text) / 2, -1, 1e9
    for i in range(4, len(text) - 4):
        if (text[i] in PUNCT and text[i + 1] not in CLOSE) or (text[i] in CLOSE and text[i - 1] in PUNCT):
            if abs(i + 1 - mid) < bd:
                bd, best = abs(i + 1 - mid), i + 1
    return text if best < 0 or bd > len(text) * 0.3 else text[:best] + "\n" + text[best:]


def main(out):
    segs = json.load(open(os.path.join(HERE, "build", "timeline.json"), encoding="utf-8"))["segments"]
    blocks, prev_end = [], 0.0
    for k, s in enumerate(segs):
        nx = segs[k + 1] if k + 1 < len(segs) else None
        hold = max(0.05, min(0.45, nx["start"] - s["end"] - 0.08)) if nx else 0.6
        a, z = max(prev_end, s["start"] - 0.1), s["end"] + hold
        prev_end = z
        blocks.append(f"{k + 1}\n{fmt(a)} --> {fmt(z)}\n{brk(s['text'])}\n")
    open(out, "w", encoding="utf-8").write("\n".join(blocks))
    print(f"[srt] {len(blocks)} cues -> {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "karpathy-output-ladder.srt"))
