#!/usr/bin/env python3
"""Narration build: script.json -> TTS clips -> char-level alignment -> timeline.js + narration.wav.

Usage: python3 build_audio.py [--engine auto|edge|sherpa] [--voice male] [--speed 1.0] [--no-align]

Outputs (relative to this directory):
  build/tts/<id>.wav + manifest.json   per-segment clips (cached by tts.py)
  build/narration.wav                  48 kHz mono, all clips placed on the timeline
  build/timeline.json                  segment / scene timing (+ per-character offsets)
  page/timeline.js                     same data for the page: window.TIMELINE = {...}
"""
import argparse
import difflib
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
TTS_DIR = os.environ.get("TTS_DIR", os.path.join(HERE, "..", "tts"))
SR = 48000
FPS = 30


def run_tts(segments, engine, voice, speed):
    inp = os.path.join(HERE, "build", "tts_in.json")
    out = os.path.join(HERE, "build", "tts")
    os.makedirs(out, exist_ok=True)
    with open(inp, "w", encoding="utf-8") as f:
        json.dump([{"id": s["id"], "text": s.get("say", s["text"])} for s in segments], f, ensure_ascii=False, indent=1)
    cmd = [sys.executable, os.path.join(TTS_DIR, "tts.py"), "--in", inp, "--out-dir", out,
           "--engine", engine, "--voice", voice, "--speed", str(speed)]
    print("[build] " + " ".join(cmd))
    subprocess.run(cmd, check=True)
    with open(os.path.join(out, "manifest.json"), encoding="utf-8") as f:
        return {m["id"]: m for m in json.load(f)}


# ------------------------------------------------------------------ alignment
CJK = re.compile(r"[一-鿿]")
WORD = re.compile(r"[A-Za-z0-9]+")


def units_of(text):
    """Split text into speakable units: one per CJK char, one per ASCII word. -> [(unit, char_index)]"""
    out, i = [], 0
    while i < len(text):
        ch = text[i]
        if CJK.match(ch):
            out.append((ch, i))
            i += 1
        else:
            m = WORD.match(text, i)
            if m:
                out.append((m.group(0).lower(), i))
                i = m.end()
            else:
                i += 1
    return out


def asr_units(tokens, stamps):
    """ASR tokens -> units with times; consecutive single ASCII letters are merged into one word."""
    out = []
    for tok, ts in zip(tokens, stamps):
        tok = tok.strip().replace("@@", "").replace("▁", "")
        if not tok:
            continue
        if CJK.match(tok):
            for k, ch in enumerate(tok):
                out.append((ch, ts))
        elif WORD.fullmatch(tok):
            if out and out[-1][0] != "" and WORD.fullmatch(out[-1][0]) and len(tok) == 1 and len(out[-1][0]) <= 4 \
                    and not CJK.match(out[-1][0]):
                out[-1] = (out[-1][0] + tok.lower(), out[-1][1])
            else:
                out.append((tok.lower(), ts))
    return out


def align(text, tokens, stamps, dur):
    """-> list of per-character start offsets (seconds, relative to clip start) for every char of `text`."""
    su = units_of(text)
    au = asr_units(tokens, stamps)
    times = [None] * len(su)
    sm = difflib.SequenceMatcher(a=[u for u, _ in su], b=[u for u, _ in au], autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal" or (tag == "replace" and (i2 - i1) == (j2 - j1)):
            for k in range(i2 - i1):
                times[i1 + k] = au[j1 + k][1]
        elif tag == "replace" and j2 > j1:
            # spread the ASR time range over the script units
            t0, t1 = au[j1][1], au[j2 - 1][1]
            n = i2 - i1
            for k in range(n):
                times[i1 + k] = t0 + (t1 - t0) * (k / max(1, n - 1))
    # interpolate holes
    known = [(k, t) for k, t in enumerate(times) if t is not None]
    if not known:
        known = [(0, 0.05), (len(su) - 1, max(0.1, dur - 0.3))]
    for k in range(len(times)):
        if times[k] is not None:
            continue
        prev = max([kt for kt in known if kt[0] < k], default=None, key=lambda kt: kt[0])
        nxt = min([kt for kt in known if kt[0] > k], default=None, key=lambda kt: kt[0])
        if prev and nxt:
            times[k] = prev[1] + (nxt[1] - prev[1]) * (k - prev[0]) / (nxt[0] - prev[0])
        elif prev:
            times[k] = min(dur - 0.05, prev[1] + 0.2 * (k - prev[0]))
        elif nxt:
            times[k] = max(0.0, nxt[1] - 0.2 * (nxt[0] - k))
    # monotonic
    for k in range(1, len(times)):
        times[k] = max(times[k], times[k - 1])
    # per char: a char belongs to the unit that starts at or before it; punctuation takes the next unit's time
    ct = [None] * len(text)
    for (u, ci), t in zip(su, times):
        for k in range(ci, ci + len(u) if WORD.fullmatch(u) else ci + 1):
            ct[k] = round(float(t), 3)
    nxt_t = round(float(dur), 3)
    for k in range(len(text) - 1, -1, -1):
        if ct[k] is None:
            ct[k] = nxt_t
        else:
            nxt_t = ct[k]
    return ct, sum(1 for t in times if t is not None)


def load_asr():
    sys.path.insert(0, os.path.join(TTS_DIR, "eval"))
    import sherpa_onnx as so
    md = os.path.join(TTS_DIR, "models", "sherpa-onnx-paraformer-zh-2023-09-14")
    return so.OfflineRecognizer.from_paraformer(
        paraformer=os.path.join(md, "model.int8.onnx"), tokens=os.path.join(md, "tokens.txt"), num_threads=4)


def to16k(x, sr):
    if sr == 16000:
        return x.astype(np.float32)
    n = int(round(len(x) * 16000 / sr))
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", default="auto")
    ap.add_argument("--voice", default=None)
    ap.add_argument("--speed", type=float, default=None)
    ap.add_argument("--no-align", action="store_true")
    args = ap.parse_args()

    with open(os.path.join(HERE, "script.json"), encoding="utf-8") as f:
        script = json.load(f)
    segs = script["segments"]
    voice = args.voice or script.get("voice", "male")
    speed = args.speed or script.get("speed", 1.0)
    man = run_tts(segs, args.engine, voice, speed)

    rec = None if args.no_align else load_asr()

    # ---- layout
    t = 0.0
    out_segs = []
    for i, s in enumerate(segs):
        m = man[s["id"]]
        x, sr = sf.read(m["path"], dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        assert sr == SR, (m["path"], sr)
        dur = len(x) / sr
        t += s.get("lead", 0.0)
        start = t
        say = s.get("say", s["text"])
        ct, nmatched = None, 0
        if rec is not None:
            st = rec.create_stream()
            pad = np.zeros(int(0.2 * 16000), dtype=np.float32)
            st.accept_waveform(16000, np.concatenate([pad, to16k(x, sr), pad]))
            rec.decode_stream(st)
            r = st.result
            stamps = [max(0.0, ts - 0.2) for ts in r.timestamps]
            ct, nmatched = align(say, list(r.tokens), stamps, dur)
            asr_text = r.text
        else:
            n = len(say)
            ct = [round(dur * k / max(1, n), 3) for k in range(n)]
            asr_text = ""
        nxt_scene = segs[i + 1]["scene"] if i + 1 < len(segs) else None
        default_gap = script["scene_gap"] if nxt_scene != s["scene"] else script["default_gap"]
        gap = s.get("gap", default_gap)
        out_segs.append({"id": s["id"], "scene": s["scene"], "text": s["text"], "say": say,
                         "start": round(start, 3), "end": round(start + dur, 3), "dur": round(dur, 3),
                         "ct": ct, "asr": asr_text, "engine": m.get("engine"), "voice": m.get("voice"),
                         "_x": x})
        t = start + dur + gap
    duration = round(out_segs[-1]["end"] + script.get("tail", 3.0), 3)

    # ---- scenes: boundary in the middle of the silence between scenes
    scenes, order = {}, []
    for s in out_segs:
        if s["scene"] not in scenes:
            scenes[s["scene"]] = {"first": s, "last": s}
            order.append(s["scene"])
        scenes[s["scene"]]["last"] = s
    bounds = {}
    for k, name in enumerate(order):
        if k == 0:
            st = 0.0
        else:
            prev_end = scenes[order[k - 1]]["last"]["end"]
            first_start = scenes[name]["first"]["start"]
            st = prev_end + 0.42 * (first_start - prev_end)
        bounds[name] = {"start": round(st, 3)}
    for k, name in enumerate(order):
        bounds[name]["end"] = bounds[order[k + 1]]["start"] if k + 1 < len(order) else duration

    # ---- narration track + envelope
    total = int(round(duration * SR))
    mix = np.zeros(total, dtype=np.float32)
    for s in out_segs:
        i0 = int(round(s["start"] * SR))
        x = s.pop("_x")
        mix[i0:i0 + len(x)] += x[: max(0, total - i0)]
    os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
    sf.write(os.path.join(HERE, "build", "narration.wav"), mix, SR, subtype="PCM_16")
    hop = SR // FPS
    nfr = int(np.ceil(total / hop))
    env = np.array([np.sqrt(np.mean(mix[k * hop:(k + 1) * hop] ** 2) + 1e-12) for k in range(nfr)])
    env = env / (np.percentile(env[env > 1e-4], 98) if np.any(env > 1e-4) else 1.0)
    env = np.clip(env, 0, 1.2)

    timeline = {"title": script.get("title", ""), "duration": duration, "fps": FPS, "order": order,
                "scenes": bounds, "segments": out_segs, "env": [round(float(v), 3) for v in env],
                "engine": out_segs[0]["engine"], "voice": out_segs[0]["voice"]}
    with open(os.path.join(HERE, "build", "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "page", "timeline.js"), "w", encoding="utf-8") as f:
        f.write("window.TIMELINE = " + json.dumps(timeline, ensure_ascii=False) + ";\n")

    for s in out_segs:
        print(f"  {s['id']} {s['scene']:<10} {s['start']:7.2f} → {s['end']:7.2f}  ({s['dur']:.2f}s)  asr: {s['asr']}")
    print("[build] scenes: " + ", ".join(f"{k} {v['start']:.1f}-{v['end']:.1f}" for k, v in bounds.items()))
    print(f"[build] duration {duration:.2f}s  engine={timeline['engine']} voice={timeline['voice']}")


if __name__ == "__main__":
    main()
