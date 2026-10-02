#!/usr/bin/env python3
"""Procedural music bed + sound effects, mixed under the narration.

Inputs : build/narration.wav (48 kHz mono), build/cues.json (from dump_cues.mjs), build/timeline.json
Outputs: build/music.wav, build/sfx.wav, build/final_audio.wav (48 kHz stereo, loudness-normalised)
Everything is synthesised with numpy from a fixed seed, so the result is reproducible.
"""
import json
import os
import subprocess

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, "build")
SR = 48000
rng = np.random.default_rng(20261002)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, a, d):
    """attack (s) / exponential decay time-constant (s) envelope of n samples"""
    t = np.arange(n) / SR
    e = np.exp(-t / max(d, 1e-4))
    if a > 0:
        e *= np.clip(t / a, 0, 1)
    return e


def onepole_lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    # vectorised via lfilter-like recursion in chunks would be faster; signals here are short or decimated
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def fft_filter(x, lo=None, hi=None):
    """brick-ish band filter in the frequency domain (fine for noise-based effects)"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, n=len(x))


def norm(x, peak=1.0):
    p = np.max(np.abs(x)) + 1e-9
    return x * (peak / p)


# ---------------------------------------------------------------- sound effects
def sfx_pop(g):
    n = int(0.12 * SR); t = np.arange(n) / SR
    f = 950 * np.exp(-t * 9) + 420
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.002, 0.035)
    return norm(x, 0.30 * g)


def sfx_tick(g):
    n = int(0.05 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 2300 * t) * env_ad(n, 0.0005, 0.008) + 0.3 * rng.standard_normal(n) * env_ad(n, 0, 0.003)
    return norm(x, 0.14 * g)


def sfx_click(g):
    n = int(0.04 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 3100 * t) * env_ad(n, 0.0003, 0.006) + 0.5 * rng.standard_normal(n) * env_ad(n, 0, 0.002)
    return norm(x, 0.20 * g)


def sfx_whoosh(g, dur=0.55):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # sweep: mix of low and high band with moving balance
    lo = fft_filter(noise, 250, 1200); hi = fft_filter(noise, 1500, 7000)
    p = t / dur
    x = lo * (1 - p) + hi * p * 0.7
    e = np.sin(np.pi * np.clip(p, 0, 1)) ** 2
    return norm(x * e, 0.20 * g)


def sfx_hit(g):
    n = int(0.6 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 25)) * t) * env_ad(n, 0.002, 0.16)
    tone = (np.sin(2 * np.pi * 523.25 * t) + 0.6 * np.sin(2 * np.pi * 783.99 * t)) * env_ad(n, 0.004, 0.22) * 0.25
    trans = fft_filter(rng.standard_normal(n), 1000, 8000) * env_ad(n, 0, 0.01) * 0.4
    return norm(body + tone + trans, 0.36 * g)


def sfx_stamp(g):
    n = int(0.9 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (55 + 70 * np.exp(-t * 30)) * t) * env_ad(n, 0.001, 0.22)
    trans = fft_filter(rng.standard_normal(n), 600, 6000) * env_ad(n, 0, 0.02) * 0.6
    shimmer = sum(np.sin(2 * np.pi * f * t) * a for f, a in [(659.25, 0.5), (987.77, 0.35), (1318.5, 0.2)]) * env_ad(n, 0.01, 0.35) * 0.3
    return norm(body + trans + shimmer, 0.42 * g)


def bell(freqs, dur, decay, g):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.zeros(n)
    for k, f in enumerate(freqs):
        for h_, a in [(1, 1.0), (2.76, 0.32), (5.4, 0.12)]:
            x += a / (k + 1) ** 0.5 * np.sin(2 * np.pi * f * h_ * t) * env_ad(n, 0.002, decay / h_)
    return norm(x, g)


def sfx_chime(g):
    return bell([1046.5, 1568.0], 1.6, 0.6, 0.16 * g)


def sfx_ding(g):
    return bell([1318.5, 1975.5, 2637.0], 1.4, 0.5, 0.18 * g)


def sfx_hl(g):
    n = int(0.22 * SR); t = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), 2500, 9000) * np.sin(np.pi * t / 0.22) ** 2
    return norm(x, 0.06 * g)


def sfx_hop(g):
    n = int(0.22 * SR); t = np.arange(n) / SR
    f = 320 + 520 * (t / 0.22) ** 0.7
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.004, 0.08)
    return norm(x, 0.14 * g)


def sfx_thud(g):
    n = int(0.35 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * (90 + 40 * np.exp(-t * 30)) * t) * env_ad(n, 0.001, 0.08)
    return norm(x, 0.26 * g)


def sfx_step(g):
    # rising tones: pitch follows the gain parameter (0.55..0.79)
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 440 * 2 ** ((g - 0.55) / 0.08 * 4 / 12 * 3)
    x = (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t)) * env_ad(n, 0.004, 0.18)
    return norm(x, 0.17)


def sfx_type(g, dur):
    n = int(dur * SR) + int(0.05 * SR)
    x = np.zeros(n)
    tt = 0.0
    while tt < dur:
        k = sfx_tick(0.6 + 0.4 * rng.random())
        i = int(tt * SR)
        x[i:i + len(k)] += k[: max(0, n - i)]
        tt += 0.05 + 0.06 * rng.random()
    return x * g * 0.8


def sfx_stream(g, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    bed = fft_filter(rng.standard_normal(n), 3000, 9000) * 0.02
    x = bed.copy()
    tt = 0.0
    while tt < dur:
        k = sfx_tick(0.3 + 0.3 * rng.random())
        i = int(tt * SR)
        x[i:i + len(k)] += k[: max(0, n - i)] * 0.5
        tt += 0.025 + 0.03 * rng.random()
    fade = np.minimum(1, np.minimum(t / 0.4, (dur - t) / 0.6))
    return x * fade * g


def sfx_scribble(g, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), 1800, 6500)
    strokes = 0.5 + 0.5 * np.sin(2 * np.pi * (5 + 2 * np.sin(2 * np.pi * 0.7 * t)) * t)
    e = np.minimum(1, np.minimum(t / 0.05, (dur - t) / 0.1))
    return norm(noise * strokes ** 2 * e, 0.07 * g)


def sfx_slide(g, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), 800, 3000)
    e = np.minimum(1, np.minimum(t / 0.1, (dur - t) / 0.2)) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 * t) ** 2)
    return norm(noise * e, 0.035 * g)


def sfx_swell(g, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    p = t / dur
    noise = fft_filter(rng.standard_normal(n), 80, 900)
    drone = sum(np.sin(2 * np.pi * f * t) for f in (65.41, 98.0, 130.81)) / 3
    e = np.sin(np.pi * p) ** 1.5
    return norm((noise * 0.6 + drone) * e, 0.22 * g)


def sfx_final(g):
    n = int(4.5 * SR); t = np.arange(n) / SR
    chord = [261.63, 329.63, 392.0, 493.88, 587.33]
    x = bell(chord, 4.5, 1.6, 0.6)
    pad = sum(np.sin(2 * np.pi * f * t + rng.random() * 6) for f in chord) / len(chord) * env_ad(n, 0.8, 2.2) * 0.5
    return norm(x + pad, 0.30 * g)


SIMPLE = {"pop": sfx_pop, "tick": sfx_tick, "click": sfx_click, "hit": sfx_hit, "stamp": sfx_stamp, "chime": sfx_chime,
          "ding": sfx_ding, "hl": sfx_hl, "hop": sfx_hop, "thud": sfx_thud, "step": sfx_step, "final": sfx_final}
TIMED = {"type": sfx_type, "stream": sfx_stream, "scribble": sfx_scribble, "slide": sfx_slide, "swell": sfx_swell}


def build_sfx(cues, total):
    out = np.zeros(total)
    for c in cues:
        ty, g = c["type"], c.get("gain", 1.0)
        if ty == "whoosh":
            x = sfx_whoosh(g)
        elif ty in SIMPLE:
            x = SIMPLE[ty](g)
        elif ty in TIMED:
            x = TIMED[ty](g, max(0.1, c.get("dur", 1.0)))
        else:
            print("[audio] unknown cue", ty)
            continue
        i = int(round(c["t"] * SR))
        if i >= total:
            continue
        out[i:i + len(x)] += x[: total - i]
    return out


# ---------------------------------------------------------------- music bed
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name):
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[n] + 12 * (o + 1) - 69) / 12)


CHORDS = [  # (pad voicing, bass, arpeggio tones)
    (["C3", "G3", "B3", "E4"], "C3", ["C5", "E5", "G5", "B5", "G5", "E5"]),
    (["A2", "E3", "G3", "C4"], "A2", ["A4", "C5", "E5", "G5", "E5", "C5"]),
    (["F2", "C3", "E3", "A3"], "F2", ["F4", "A4", "C5", "E5", "C5", "A4"]),
    (["G2", "D3", "F3", "B3"], "G2", ["G4", "B4", "D5", "F5", "D5", "B4"]),
]
BPM = 84
BEAT = 60 / BPM
BAR = 4 * BEAT
CHORD_LEN = 2 * BAR


def saw_soft(f, t, phase):
    # band-limited-ish soft saw: first 6 harmonics
    return sum(np.sin(2 * np.pi * f * k * t + phase * k) / k for k in range(1, 7))


def build_music(total, scenes, end_t):
    dur = total / SR
    t = np.arange(total) / SR
    pad = np.zeros(total)
    bass = np.zeros(total)
    arp = np.zeros(total)
    kick = np.zeros(total)
    # section masks (0..1) from scene times
    def sc(name):
        return scenes[name]["start"], scenes[name]["end"]
    def ramp(a, b, w=1.0):
        return np.clip((t - a) / w + 0.5, 0, 1) * np.clip((b - t) / w + 0.5, 0, 1)
    r4 = sc("rung4")
    dark = ramp(r4[0] + 3.5, r4[1], 1.5)
    arp_on = np.clip(ramp(sc("rung1")[0], sc("bottleneck")[1], 2.0) - dark, 0, 1)
    kick_on = np.clip(ramp(sc("rung1")[0] + 1.0, sc("bottleneck")[1] - 1.0, 2.0) - dark, 0, 1)
    bass_on = np.clip(ramp(sc("intro")[0], end_t + 2.0, 2.0), 0, 1)

    n_chords = int(np.ceil(dur / CHORD_LEN)) + 1
    for k in range(n_chords):
        c0 = k * CHORD_LEN
        voic, b, arpn = CHORDS[k % 4]
        # pad: crossfaded chord blocks
        i0 = int(max(0, (c0 - 1.0)) * SR); i1 = min(total, int((c0 + CHORD_LEN + 1.0) * SR))
        if i0 >= total:
            break
        tt = t[i0:i1]
        w = np.clip((tt - (c0 - 1.0)) / 2.0, 0, 1) * np.clip(((c0 + CHORD_LEN + 1.0) - tt) / 2.0, 0, 1)
        blk = np.zeros(len(tt))
        for v in voic:
            f = hz(v)
            for det in (-0.12, 0.0, 0.13):
                blk += saw_soft(f * 2 ** (det / 12), tt, rng.random() * 6)
        pad[i0:i1] += blk * w / (len(voic) * 3)
        # bass: half notes
        for hb in range(4):
            s0 = c0 + hb * 2 * BEAT
            j0 = int(s0 * SR); n = int(2 * BEAT * SR)
            if j0 >= total:
                break
            n = min(n, total - j0)
            tb = np.arange(n) / SR
            fb = hz(b)
            bass[j0:j0 + n] += (np.sin(2 * np.pi * fb * tb) + 0.25 * np.sin(2 * np.pi * 2 * fb * tb)) * env_ad(n, 0.01, 0.9)
        # arpeggio: eighth notes
        for e in range(16):
            s0 = c0 + e * BEAT / 2
            j0 = int(s0 * SR)
            if j0 >= total:
                break
            n = min(int(0.9 * SR), total - j0)
            ta = np.arange(n) / SR
            fa = hz(arpn[e % len(arpn)])
            vel = 0.75 + 0.25 * ((e % 4) == 0) - 0.15 * rng.random()
            note = (np.sin(2 * np.pi * fa * ta) + 0.18 * np.sin(2 * np.pi * 3 * fa * ta) + 0.05 * np.sin(2 * np.pi * 4.2 * fa * ta)) * env_ad(n, 0.003, 0.28)
            arp[j0:j0 + n] += note * vel
        # soft kick on beats 1 and 3
        for kb in range(4):
            s0 = c0 + kb * 2 * BEAT
            j0 = int(s0 * SR)
            if j0 >= total:
                break
            n = min(int(0.3 * SR), total - j0)
            tk = np.arange(n) / SR
            kick[j0:j0 + n] += np.sin(2 * np.pi * (95 + 60 * np.exp(-tk * 35)) * tk) * env_ad(n, 0.001, 0.07)

    # darker pad during the "video" scene: lowpass mix
    pad_dark = fft_filter(pad, None, 700)
    pad_mix = pad * (1 - dark) + pad_dark * dark * 1.3
    pad_mix = fft_filter(pad_mix, 60, 2600)
    # global intro swell and ending
    master = np.clip(t / 3.0, 0, 1) * np.clip((dur - t) / 3.0, 0, 1)
    after_end = np.clip((t - end_t) / 0.6, 0, 1)
    music = (0.55 * pad_mix + 0.22 * bass * bass_on + 0.16 * arp * arp_on * (1 - after_end) + 0.12 * kick * kick_on)
    music = fft_filter(music, 85, None)   # keep the low end clear for the voice
    music *= master
    return music


def reverb(x, seconds=2.2, mix=0.22):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 6.5))
    ir = fft_filter(ir, 120, 6000)
    ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n
    nfft = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]
    return x * (1 - mix) + y * mix * 0.8


def smooth_env(x, win_s=0.25):
    hop = int(0.01 * SR)
    frames = np.sqrt(np.add.reduceat(x[: len(x) // hop * hop] ** 2, np.arange(0, len(x) // hop * hop, hop)) / hop)
    act = (frames > 0.01).astype(float)
    k = int(win_s / 0.01)
    ker = np.ones(k) / k
    act = np.convolve(act, ker, mode="same")
    act = np.clip(act * 1.6, 0, 1)
    return np.interp(np.arange(len(x)), np.arange(len(act)) * hop, act)


def main():
    voice, sr = sf.read(os.path.join(B, "narration.wav"), dtype="float64")
    assert sr == SR
    with open(os.path.join(B, "cues.json"), encoding="utf-8") as f:
        cues = json.load(f)
    with open(os.path.join(B, "timeline.json"), encoding="utf-8") as f:
        tl = json.load(f)
    total = len(voice)
    end_t = tl["segments"][-1]["end"] + 0.55

    sfx = build_sfx(cues["cues"], total)
    sfx = reverb(sfx, 1.4, 0.18)
    music = build_music(total, tl["scenes"], end_t)
    music = reverb(music, 2.6, 0.3)
    music = norm(music, 1.0)

    duck = smooth_env(voice)
    music_gain = 10 ** (-14 / 20) * (1 - 0.5 * duck)      # bed ~18 dB under the voice, ducked a further 6 dB while speaking
    mix_l = voice + music * music_gain + sfx * 0.9
    # gentle stereo: music/sfx slightly widened with a tiny delay
    d = int(0.012 * SR)
    music_r = np.concatenate([np.zeros(d), (music * music_gain)[:-d]])
    mix_r = voice + music_r + sfx * 0.9
    stereo = np.stack([mix_l, mix_r], axis=1)
    sf.write(os.path.join(B, "music.wav"), (music * music_gain).astype(np.float32), SR)
    sf.write(os.path.join(B, "sfx.wav"), (sfx * 0.9).astype(np.float32), SR)
    raw = os.path.join(B, "mix_raw.wav")
    sf.write(raw, stereo.astype(np.float32), SR, subtype="FLOAT")
    # two-pass loudness normalisation to -15 LUFS / -1.5 dBTP
    out = os.path.join(B, "final_audio.wav")
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", raw, "-af", "loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    js = p.stderr[p.stderr.rfind("{"): p.stderr.rfind("}") + 1]
    m = json.loads(js)
    af = (f"loudnorm=I=-15:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", out], check=True)
    print(f"[audio] input {m['input_i']} LUFS -> {out}")


if __name__ == "__main__":
    main()
