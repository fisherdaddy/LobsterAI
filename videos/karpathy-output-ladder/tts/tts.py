#!/usr/bin/env python3
"""Mandarin narration TTS: MiniMax (paid API) or edge-tts (online), with an offline sherpa-onnx (Kokoro) fallback.

  python3 tts.py --in segments.json --out-dir OUT [--engine auto|edge|sherpa] [--voice NAME] [--speed 1.0]

segments.json : [{"id": "s01", "text": "..."}, ...]
Output        : OUT/<id>.wav  48 kHz mono 16-bit PCM, head/tail silence trimmed to 40 ms,
                integrated loudness -16 LUFS (constant gain per segment, true peak <= -1 dBTP)
                OUT/manifest.json  [{id, text, file, duration_sec, engine, voice, ...}]

--engine auto  : MiniMax if MINIMAX_API_KEY is set and the API answers, else edge-tts if reachable
                 (<= ~4 s probe), else the offline sherpa voice. --engine minimax|edge|sherpa forces one.
MiniMax        : env MINIMAX_API_KEY (required), MINIMAX_API_HOST (default: try api.minimaxi.com, then
                 api.minimax.io), MINIMAX_MODEL (default: speech-2.8-hd, then 2.6-hd, then 02-hd).
                 --voice male -> male-qn-jingying; any MiniMax voice_id can be passed directly.
--voice        : male | female (default male), an edge voice (zh-CN-YunxiNeural, zh-CN-XiaoxiaoNeural, ...),
                 or a sherpa voice: kokoro-v1.1:zm_045 | zm_045 | zf_036 | zf_047 | zm_yunyang (Kokoro v1.0) | melo ...
                 Run --list-voices for the curated list.
--speed        : RELATIVE to each voice's calibrated explainer pace (~4.9 spoken syllables/s).
                 1.0 = recommended, 1.1 = 10 % faster. The engine-level value is stored as engine_speed.
Sherpa text    : NORMALIZE_RULES (100%->百分之100, 10x->10倍, 1/3, 3~5, $/¥, dates, times, AGI, Andrej Karpathy...)
                 run before synthesis, and the text is synthesized sentence by sentence (see split_for_sherpa).
                 --zh-terms additionally says Claude/API/LLM/Agent/Karpathy as 克劳德/接口/大模型/智能体/卡帕西;
                 --rules FILE.json adds your own {regex: replacement} pairs. Edge gets the raw text.
Cache          : a segment is skipped when OUT/<id>.wav exists and OUT/.cache/<id>.json holds the same hash of
                 (text, engine, voice, speed, normalization rules, output format). --force re-renders.
"""
import argparse
import asyncio
import hashlib
import importlib.util
import json
import math
import os
import re
import shutil
import ssl
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d, uniform_filter1d
from scipy.signal import butter, resample_poly, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.environ.get("TTS_MODELS_DIR", os.path.join(HERE, "models"))
PIPELINE_VERSION = "2"

OUT_SR = 48000
PAD_MS = 40
TARGET_LUFS = -16.0
TRUE_PEAK_CEILING_DB = -1.0

# --------------------------------------------------------------------------------------------- voices
# Edge voices. base_speed 1.10 (= rate "+10%") is an estimate of the explainer pace: edge could not be
# measured from the build machine (speech.platform.bing.com is blocked there). Check manifest chars_per_sec.
EDGE_DEFAULT = {"male": "zh-CN-YunxiNeural", "female": "zh-CN-XiaoxiaoNeural"}
EDGE_GENDER = {
    "zh-CN-YunxiNeural": "male", "zh-CN-YunjianNeural": "male", "zh-CN-YunyangNeural": "male",
    "zh-CN-YunxiaNeural": "male", "zh-CN-XiaoxiaoNeural": "female", "zh-CN-XiaoyiNeural": "female",
    "zh-CN-liaoning-XiaobeiNeural": "female", "zh-CN-shaanxi-XiaoniNeural": "female",
}
EDGE_BASE_SPEED = 1.10

# MiniMax T2A v2 (paid API). The key is read from the MINIMAX_API_KEY environment variable and never written
# to disk or logs by this script. Keys are region-bound: Mainland-China accounts use api.minimaxi.com,
# international accounts api.minimax.io; both are tried (override with MINIMAX_API_HOST=https://...).
MINIMAX_DEFAULT = {"male": "male-qn-jingying", "female": "female-chengshu"}
MINIMAX_HOSTS = os.environ.get("MINIMAX_API_HOST", "https://api.minimaxi.com,https://api.minimax.io")
MINIMAX_MODELS = os.environ.get("MINIMAX_MODEL", "speech-2.8-hd,speech-2.6-hd,speech-02-hd")
MINIMAX_BASE_SPEED = 1.0

SHERPA_MODELS = {
    # lang "en": espeak British English for the English words inside Chinese text. The default
    # ("en-us") emits the r-coloured vowel /ɚ/, which Kokoro's token set lacks, so "-er/-or" endings
    # are silently dropped (Transformer -> "transform", Cursor -> "kurs").
    "kokoro-v1.1": dict(type="kokoro", dir="kokoro-multi-lang-v1_1", model="model.onnx", lang="en"),
    "kokoro-v1.1-int8": dict(type="kokoro", dir="kokoro-int8-multi-lang-v1_1", model="model.int8.onnx", lang="en"),
    "kokoro-v1.0": dict(type="kokoro", dir="kokoro-multi-lang-v1_0", model="model.onnx", lang="en"),
    "melo": dict(type="vits", dir="vits-melo-tts-zh_en", model="model.onnx",
                 fsts=["phone.fst", "date.fst", "number.fst", "new_heteronym.fst"]),
    "matcha-baker": dict(type="matcha", dir="matcha-icefall-zh-baker", model="model-steps-3.onnx",
                         vocoder="vocos-22khz-univ.onnx", fsts=["phone.fst", "date.fst", "number.fst"]),
    "matcha-zh-en": dict(type="matcha", dir="matcha-icefall-zh-en", model="model-steps-3.onnx",
                         vocoder="vocos-16khz-univ.onnx", fsts=["phone-zh.fst", "date-zh.fst", "number-zh.fst"]),
}

# Curated sherpa voices: name -> (model, speaker or None, gender, base_speed). base_speed = engine speed that
# gives ~4.9 spoken syllables/s on multi-sentence text (single sentences come out ~5.4). Chosen by ASR CER
# (SenseVoice + Paraformer + Whisper), DNSMOS and pitch variability over 100 Kokoro v1.1 voices + others.
SHERPA_VOICES = {
    "kokoro-v1.1:zm_045": ("kokoro-v1.1", "zm_045", "male", 1.29),    # default male: clearest + lively
    "kokoro-v1.1:zf_036": ("kokoro-v1.1", "zf_036", "female", 1.34),  # default female: clearest, best with acronyms
    "kokoro-v1.1:zf_047": ("kokoro-v1.1", "zf_047", "female", 1.36),  # livelier/warmer, slightly less crisp
    "kokoro-v1.1:zm_009": ("kokoro-v1.1", "zm_009", "male", 1.25),    # calmer male
    "kokoro-v1.1:zm_012": ("kokoro-v1.1", "zm_012", "male", 1.28),
    "kokoro-v1.1:zf_021": ("kokoro-v1.1", "zf_021", "female", 1.21),  # crisp but flat
    "kokoro-v1.0:zm_yunyang": ("kokoro-v1.0", "zm_yunyang", "male", 1.06),
    "matcha-zh-en": ("matcha-zh-en", None, "female", 1.09),          # 10x faster, 16 kHz (duller)
}
SHERPA_DEFAULT = {"male": "kokoro-v1.1:zm_045", "female": "kokoro-v1.1:zf_036"}
# Pace calibration: base_speed = TARGET_SYL_PER_SEC / (measured syllables/s at speed 1.0), clamped.
# Rates were measured on the evaluation paragraph (CJK chars + English syllables per second of speech).
TARGET_SYL_PER_SEC = 4.9
KOKORO11_RATE_AT_1 = {"zf_001": 4.04, "zf_002": 3.51, "zf_003": 3.49, "zf_004": 3.55, "zf_005": 3.42,
    "zf_006": 3.47, "zf_007": 3.38, "zf_008": 3.47, "zf_017": 3.67, "zf_018": 3.21, "zf_019": 3.04,
    "zf_021": 4.06, "zf_022": 3.14, "zf_023": 3.77, "zf_024": 3.25, "zf_026": 3.36, "zf_027": 4.11,
    "zf_028": 3.52, "zf_032": 3.47, "zf_036": 3.67, "zf_038": 3.3, "zf_039": 3.19, "zf_040": 3.19,
    "zf_042": 3.24, "zf_043": 3.49, "zf_044": 3.35, "zf_046": 3.38, "zf_047": 3.59, "zf_048": 2.83,
    "zf_049": 3.21, "zf_051": 3.22, "zf_059": 3.55, "zf_060": 3.33, "zf_067": 3.77, "zf_070": 3.18,
    "zf_071": 3.06, "zf_072": 3.45, "zf_073": 3.08, "zf_074": 3.26, "zf_075": 3.16, "zf_076": 3.37,
    "zf_077": 3.5, "zf_078": 3.08, "zf_079": 3.54, "zf_083": 3.51, "zf_084": 3.13, "zf_085": 3.26,
    "zf_086": 3.55, "zf_087": 3.27, "zf_088": 3.97, "zf_090": 3.27, "zf_092": 3.68, "zf_093": 3.42,
    "zf_094": 3.5, "zf_099": 3.3, "zm_009": 3.92, "zm_010": 3.91, "zm_011": 4.06, "zm_012": 3.83,
    "zm_013": 4.25, "zm_014": 3.72, "zm_015": 3.78, "zm_016": 3.38, "zm_020": 2.72, "zm_025": 3.81,
    "zm_029": 3.59, "zm_030": 3.59, "zm_031": 2.96, "zm_033": 3.72, "zm_034": 3.55, "zm_035": 3.1,
    "zm_037": 3.29, "zm_041": 3.73, "zm_045": 3.79, "zm_050": 3.98, "zm_052": 3.55, "zm_053": 3.17,
    "zm_054": 3.21, "zm_055": 3.72, "zm_056": 3.26, "zm_057": 3.4, "zm_058": 3.73, "zm_061": 3.34,
    "zm_062": 3.3, "zm_063": 3.58, "zm_064": 2.99, "zm_065": 3.32, "zm_066": 3.5, "zm_068": 3.4,
    "zm_069": 3.28, "zm_080": 3.02, "zm_081": 2.99, "zm_082": 3.56, "zm_089": 3.54, "zm_091": 3.58,
    "zm_095": 3.63, "zm_096": 3.66, "zm_097": 3.61, "zm_098": 3.09, "zm_100": 3.11}
OTHER_RATE_AT_1 = {"kokoro-v1.0": 4.0, "melo": 4.9, "matcha-baker": 4.5, "matcha-zh-en": 4.5}

# --------------------------------------------------------------------------------------------- text rules
# Applied in order, ONLY for the sherpa engine (edge's own front end handles these cases).
_ZH_DIGITS = "零一二三四五六七八九"


def _date(m):
    return f"{m.group(1)}年{int(m.group(2))}月{int(m.group(3))}日"


def _clock(m):
    h, mi = int(m.group(1)), int(m.group(2))
    return f"{h}点" + ("整" if mi == 0 else f"{mi}分")


# ASCII word boundaries: Python's \b also treats hanzi as word characters, so r"\bAGI\b" misses "AGI时代".
_W, _E = r"(?<![A-Za-z0-9_])", r"(?![A-Za-z0-9_])"

NORMALIZE_RULES = [
    # --- punctuation that Kokoro's front end would read aloud or ignore
    (r"[：:](?=\s*[「『“\"《(（])", "，"),                 # "说：「" -> espeak says "colon"
    (r"…{1,}|\.{3,}", "，"),                               # ellipsis -> pause (otherwise dropped)
    (r"[「」『』]", ""),
    # --- numbers / symbols (rule FSTs read "%" "x" "/" "~" "$" in English or digit-by-digit)
    (r"(?<=\d),(?=\d{3}(?!\d))", ""),                      # 1,000 -> 1000
    (r"(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)", _date),         # 2025-06-17 -> 2025年6月17日
    (r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", _clock),           # 14:30 -> 14点30分
    (r"(?<![\d.])(\d+(?:\.\d+)?)\s*[~～–-]\s*(\d+(?:\.\d+)?)(?![\d.])", r"\1到\2"),  # 3~5 -> 3到5
    (r"(\d+(?:\.\d+)?)\s*%", r"百分之\1"),                 # 100% -> 百分之100 (FST: 百分之一百)
    (r"(\d+(?:\.\d+)?)\s*[xX×](?![A-Za-z0-9])", r"\1倍"),  # 10x -> 10倍 (not 1920x1080)
    (r"\$\s*(\d+(?:\.\d+)?)", r"\1美元"),
    (r"[¥￥]\s*(\d+(?:\.\d+)?)", r"\1元"),
    (r"(?<!\d)24\s*/\s*7(?!\d)", "全天候"),
    (r"(?<![\d/])(\d{1,3})\s*/\s*(\d{1,3})(?![\d/])", r"\2分之\1"),  # 1/3 -> 3分之1
    (_W + r"([A-Z])/([A-Z])" + _E, r"\1.\2"),               # A/B -> A.B (else "a slash b")
    (r"(\d)\s+(?=[\u4e00-\u9fff])", r"\1"),      # "1000 万" would be read digit by digit
    # --- English tokens espeak gets wrong inside Chinese text
    (_W + r"AGI" + _E, "A.G.I"),                           # else "ah-gee"
    (_W + r"IDE" + _E, "I.D.E"),                           # else "aid"
    (_W + r"Andrej" + _E, "Andrei"),                       # else "AN-drej" with /dʒ/
    (_W + r"Karpathy" + _E, "Karpathi"),                   # stress on 2nd syllable: kar-PATH-i
    (_W + r"LLMs" + _E, "LLM"),                            # plural s is dropped anyway
]
# Opt-in (--zh-terms): Chinese renderings for the English terms the Kokoro Chinese voices still say with a
# heavy accent when isolated (ASR rarely recovers "Claude", "API", "Karpathy" in short carrier sentences).
ZH_TERM_RULES = [
    (_W + r"Andrej\s+Karpathy" + _E, "安德烈·卡帕西"),
    (_W + r"Karpathy" + _E, "卡帕西"),
    (_W + r"Claude" + _E, "克劳德"),
    (_W + r"LLMs?" + _E, "大模型"),
    (_W + r"APIs?" + _E, "接口"),
    (_W + r"[Aa]gents?" + _E, "智能体"),
]
_COMPILED_RULES = [(re.compile(p), r) for p, r in NORMALIZE_RULES]


def normalize_for_sherpa(text, pre=(), post=()):
    """pre: --zh-terms rules, then the built-in NORMALIZE_RULES, then post: user rules from --rules."""
    for pat, rep in list(pre) + _COMPILED_RULES + list(post):
        text = pat.sub(rep, text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)  # no spaces between hanzi
    return re.sub(r"[ \t]+", " ", text).strip()


def rules_fingerprint(pre=(), post=()):
    s = json.dumps([(p, r if isinstance(r, str) else r.__name__) for p, r in NORMALIZE_RULES]
                   + [("pre", p.pattern, r) for p, r in pre] + [(p.pattern, r) for p, r in post], ensure_ascii=False)
    return hashlib.sha256(s.encode()).hexdigest()[:12]


# --------------------------------------------------------------------------------------------- edge-tts
_EDGE_SSL_PATCHED = False


def _edge_ssl_patch():
    """Make edge-tts trust the system/proxy CA bundle in addition to certifi (TLS-intercepting proxies)."""
    global _EDGE_SSL_PATCHED
    if _EDGE_SSL_PATCHED:
        return
    _EDGE_SSL_PATCHED = True
    try:
        import certifi
        import edge_tts.communicate as c
    except Exception:
        return
    ctx = ssl.create_default_context(cafile=certifi.where())
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        p = os.environ.get(var)
        if p and os.path.isfile(p):
            try:
                ctx.load_verify_locations(cafile=p)
            except Exception:
                pass
    if hasattr(c, "_SSL_CTX"):
        c._SSL_CTX = ctx


async def _edge_bytes(text, voice, rate, timeout):
    import edge_tts
    _edge_ssl_patch()
    com = edge_tts.Communicate(text, voice, rate=rate, connect_timeout=max(1, int(timeout)),
                               receive_timeout=max(5, int(timeout * 4)))
    buf = bytearray()
    async for chunk in com.stream():
        if chunk.get("type") == "audio":
            buf.extend(chunk["data"])
    return bytes(buf)


def edge_probe(voice="zh-CN-YunxiNeural", timeout=4.0):
    """Fast reachability check: synthesize one word with a hard timeout. Returns (ok, reason, seconds)."""
    t0 = time.time()
    if importlib.util.find_spec("edge_tts") is None:
        return False, "edge-tts not installed", 0.0
    _edge_ssl_patch()
    try:
        data = asyncio.run(asyncio.wait_for(_edge_bytes("测试", voice, "+0%", timeout), timeout))
        if len(data) < 500:
            return False, "empty audio", time.time() - t0
        return True, "ok", time.time() - t0
    except asyncio.TimeoutError:
        return False, f"timeout after {timeout:.0f}s", time.time() - t0
    except Exception as e:  # 403 from proxy, DNS, TLS, ...
        msg = re.sub(r",?\s*url=\S+", "", str(e))[:120]
        return False, f"{type(e).__name__}: {msg}", time.time() - t0


def decode_audio_bytes(data, sr=OUT_SR):
    """Decode mp3 (or any ffmpeg-readable) bytes to mono float32 at `sr`."""
    p = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1",
                        "-ar", str(sr), "-af", "aresample=resampler=soxr", "-f", "f32le", "pipe:1"],
                       input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy(), sr


def edge_synth(text, voice, engine_speed, retries=3, timeout=20.0):
    pct = int(round((engine_speed - 1.0) * 100))
    rate = f"{pct:+d}%"
    last = None
    for i in range(retries):
        try:
            data = asyncio.run(asyncio.wait_for(_edge_bytes(text, voice, rate, timeout), timeout * 3))
            if len(data) < 500:
                raise RuntimeError("edge-tts returned no audio")
            return decode_audio_bytes(data)
        except Exception as e:
            last = e
            if getattr(e, "status", None) in (401, 403):  # policy/auth denial: retrying will not help
                break
            if i + 1 < retries:
                time.sleep(1.5 * (i + 1))
    msg = re.sub(r",?\s*url=\S+", "", str(last))[:160]
    raise RuntimeError(f"edge-tts failed: {type(last).__name__}: {msg}")


# --------------------------------------------------------------------------------------------- minimax
_MINIMAX_STATE = {}          # host/model that worked, reused for the remaining segments
_MINIMAX_RETRY = {1000, 1001, 1002, 1013, 1039}   # unknown/timeout/rate limit/internal/TPM limit
_MINIMAX_WRONG_KEY = {1004, 2049}                  # authentication failure / invalid key (e.g. wrong region)


def _ssl_context():
    ctx = ssl.create_default_context()
    for var in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        p = os.environ.get(var)
        if p and os.path.isfile(p):
            try:
                ctx.load_verify_locations(cafile=p)
            except Exception:
                pass
    return ctx


def _minimax_post(host, key, body, timeout):
    """-> (json, error). error is a short string when the host could not be reached or answered non-200."""
    import urllib.error
    import urllib.request
    req = urllib.request.Request(host.rstrip("/") + "/v1/t2a_v2", data=json.dumps(body).encode("utf-8"),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        ctx = _ssl_context() if host.startswith("https") else None
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return json.loads(r.read().decode("utf-8")), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:  # proxy 403 on CONNECT, DNS, TLS, timeout
        return None, f"{type(e).__name__}: {str(getattr(e, 'reason', e))[:100]}"


def minimax_synth(text, voice, engine_speed, retries=4, timeout=90.0):
    key = os.environ.get("MINIMAX_API_KEY", "").strip()
    if not key:
        raise RuntimeError("MINIMAX_API_KEY is not set")
    hosts = [_MINIMAX_STATE["host"]] if "host" in _MINIMAX_STATE else \
        [h.strip() for h in MINIMAX_HOSTS.split(",") if h.strip()]
    models = [_MINIMAX_STATE["model"]] if "model" in _MINIMAX_STATE else \
        [m.strip() for m in MINIMAX_MODELS.split(",") if m.strip()]
    errors = []
    for host in hosts:
        for model in models:
            body = {"model": model, "text": text, "stream": False, "language_boost": "Chinese",
                    "output_format": "hex",
                    "voice_setting": {"voice_id": voice, "speed": round(float(engine_speed), 2), "vol": 1.0,
                                      "pitch": 0},
                    "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3", "channel": 1}}
            outcome = None
            for attempt in range(retries):
                resp, err = _minimax_post(host, key, body, timeout)
                if err:
                    outcome = ("host", err)
                    if err.startswith("HTTP 5") or "timed out" in err.lower():
                        time.sleep(2.0 * (attempt + 1))
                        continue
                    break
                base = resp.get("base_resp") or {}
                code, msg = base.get("status_code", -1), str(base.get("status_msg", ""))[:120]
                audio = (resp.get("data") or {}).get("audio")
                if code == 0 and audio:
                    _MINIMAX_STATE.update(host=host, model=model)
                    x, sr = decode_audio_bytes(bytes.fromhex(audio))
                    return x, sr
                outcome = ("key" if code in _MINIMAX_WRONG_KEY else "api", f"{code} {msg}".strip())
                if code in _MINIMAX_RETRY:
                    time.sleep(3.0 * (attempt + 1))
                    continue
                break
            errors.append(f"{host} {model}: {outcome[1] if outcome else 'no response'}")
            if outcome and outcome[0] in ("host", "key"):
                break      # unreachable host or key not valid for this region: try the next host
    raise RuntimeError("minimax failed: " + " | ".join(errors))


def minimax_probe(voice, timeout=8.0):
    t0 = time.time()
    if not os.environ.get("MINIMAX_API_KEY", "").strip():
        return False, "MINIMAX_API_KEY not set", 0.0
    try:
        minimax_synth("测试", voice, 1.0, retries=1, timeout=timeout)
        return True, f"ok ({_MINIMAX_STATE.get('model')} @ {_MINIMAX_STATE.get('host')})", time.time() - t0
    except Exception as e:
        return False, str(e)[:300], time.time() - t0


# --------------------------------------------------------------------------------------------- sherpa
_SHERPA_CACHE = {}


def _sherpa_tts(model_key, threads):
    if model_key in _SHERPA_CACHE:
        return _SHERPA_CACHE[model_key]
    import sherpa_onnx as so
    m = SHERPA_MODELS[model_key]
    d = os.path.join(MODELS_DIR, m["dir"])
    if not os.path.isdir(d):
        raise FileNotFoundError(f"model dir missing: {d}")
    p = lambda f: os.path.join(d, f)  # noqa: E731
    mc = dict(num_threads=threads, debug=False, provider="cpu")
    if m["type"] == "kokoro":
        fsts = [p("phone-zh.fst"), p("date-zh.fst"), p("number-zh.fst")]
        mc["kokoro"] = so.OfflineTtsKokoroModelConfig(
            model=p(m["model"]), voices=p("voices.bin"), tokens=p("tokens.txt"), data_dir=p("espeak-ng-data"),
            lexicon=f"{p('lexicon-us-en.txt')},{p('lexicon-zh.txt')}", lang=m.get("lang", ""))
    elif m["type"] == "vits":
        fsts = [p(f) for f in m["fsts"]]
        mc["vits"] = so.OfflineTtsVitsModelConfig(model=p(m["model"]), lexicon=p("lexicon.txt"),
                                                  tokens=p("tokens.txt"), dict_dir=p("dict"))
    else:
        fsts = [p(f) for f in m["fsts"]]
        kw = dict(acoustic_model=p(m["model"]), vocoder=os.path.join(MODELS_DIR, m["vocoder"]),
                  lexicon=p("lexicon.txt"), tokens=p("tokens.txt"))
        if os.path.isdir(p("espeak-ng-data")):
            kw["data_dir"] = p("espeak-ng-data")
        if os.path.isdir(p("dict")):
            kw["dict_dir"] = p("dict")
        mc["matcha"] = so.OfflineTtsMatchaModelConfig(**kw)
    cfg = so.OfflineTtsConfig(model=so.OfflineTtsModelConfig(**mc), rule_fsts=",".join(fsts), max_num_sentences=1)
    if not cfg.validate():
        raise RuntimeError(f"invalid sherpa-onnx config for {model_key}")
    tts = so.OfflineTts(cfg)
    spk = {}
    if m["type"] == "kokoro":
        spk = _kokoro_speaker_ids(p(m["model"]))
    _SHERPA_CACHE[model_key] = (tts, spk)
    return _SHERPA_CACHE[model_key]


def _kokoro_speaker_ids(model_path):
    """speaker name -> sid, read from the ONNX metadata (cached next to the model)."""
    cache = model_path + ".speakers.json"
    if os.path.exists(cache):
        return json.load(open(cache))
    try:
        import onnx
    except ImportError:
        raise SystemExit(f"missing {cache}: pip install onnx (needed once to read Kokoro speaker names)")
    meta = {p.key: p.value for p in onnx.load(model_path, load_external_data=False).metadata_props}
    out = {a: int(b) for a, b in (kv.split("->") for kv in meta["speaker2id"].split(","))}
    try:
        json.dump(out, open(cache, "w"))
    except OSError:
        pass
    return out


# Kokoro's front end glues punctuation that directly precedes an English word onto that word and hands
# it to espeak, which reads it aloud: "。Claude" -> "dot Claude", "！GPT" -> "exclamation GPT",
# "：AI" -> "colon AI" (and "，/；" before English are silently dropped). So the sherpa path synthesizes
# sentence by sentence (and clause by clause where an English word follows) and inserts its own pauses.
SENTENCE_PAUSE_S = 0.32  # at engine speed 1.0; divided by engine_speed
CLAUSE_PAUSE_S = 0.16
_SPLIT_RE = re.compile(r"[。！？!?]+[”’」』\"')）]*|[；;]|[：:，,、](?=\s*[A-Za-z])")
_SPEAKABLE = re.compile(r"[A-Za-z0-9一-鿿]")


def split_for_sherpa(text):
    """-> [(chunk, pause_after_s_at_speed_1)]"""
    out, pos = [], 0
    for m in _SPLIT_RE.finditer(text):
        chunk, pos = text[pos:m.end()].strip(), m.end()
        pause = CLAUSE_PAUSE_S if m.group(0)[0] in "：:，,、" else SENTENCE_PAUSE_S
        if _SPEAKABLE.search(chunk):
            out.append((chunk, pause))
        elif out:  # punctuation-only leftover: keep the longer pause
            out[-1] = (out[-1][0], max(out[-1][1], pause))
    tail = text[pos:].strip()
    if _SPEAKABLE.search(tail):
        out.append((tail, 0.0))
    return out or [(text, 0.0)]


def _sherpa_generate(tts, text, sid, engine_speed):
    import sherpa_onnx as so
    g = so.GenerationConfig()
    g.sid = sid
    g.speed = float(engine_speed)
    a = tts.generate(text, g)
    return np.asarray(a.samples, dtype=np.float32), int(a.sample_rate)


def sherpa_synth(text, voice, engine_speed, threads):
    model_key, speaker = _sherpa_voice_parts(voice)
    tts, spk = _sherpa_tts(model_key, threads)
    sid = 0
    if speaker is not None:
        if speaker not in spk:
            raise ValueError(f"unknown speaker {speaker!r} for {model_key}")
        sid = spk[speaker]
    pieces, sr = [], None
    for chunk, pause in split_for_sherpa(text):
        x, chunk_sr = _sherpa_generate(tts, chunk, sid, engine_speed)
        if x.size == 0:  # e.g. matcha-baker gets English-only text: every word is OOV
            print(f"[tts] warning: no audio for chunk {chunk!r}", file=sys.stderr)
            continue
        sr = chunk_sr
        x = trim_silence(x.astype(np.float64), sr, pad_ms=0, rel_db=-50.0)
        pieces += [x, np.zeros(int(sr * pause / engine_speed))]
    if sr is None:
        raise RuntimeError(f"sherpa-onnx produced no audio for: {text!r}")
    return np.concatenate(pieces).astype(np.float32), sr


# --------------------------------------------------------------------------------------------- voice resolution
_EDGE_NAME = re.compile(r"^[a-z]{2,3}-[A-Z]{2}(-[a-z]+)?-[A-Za-z]+Neural$")


def _sherpa_voice_parts(voice):
    if voice in SHERPA_VOICES:
        return SHERPA_VOICES[voice][0], SHERPA_VOICES[voice][1]
    if ":" in voice:
        model_key, speaker = voice.split(":", 1)
        return model_key, speaker
    if voice in SHERPA_MODELS and SHERPA_MODELS[voice]["type"] != "kokoro":
        return voice, None
    if re.fullmatch(r"z[fm]_\d{3}", voice):
        return "kokoro-v1.1", voice
    if re.fullmatch(r"z[fm]_[a-z]+", voice):
        return "kokoro-v1.0", voice
    raise ValueError(f"unknown sherpa voice {voice!r} (see --list-voices)")


def canonical_sherpa_voice(voice):
    model_key, speaker = _sherpa_voice_parts(voice)
    if model_key not in SHERPA_MODELS:
        raise ValueError(f"unknown sherpa model {model_key!r}")
    return f"{model_key}:{speaker}" if speaker else model_key


def gender_of(voice):
    if voice in ("male", "female"):
        return voice
    if voice in EDGE_GENDER:
        return EDGE_GENDER[voice]
    try:
        v = canonical_sherpa_voice(voice)
    except ValueError:
        return None
    if v in SHERPA_VOICES:
        return SHERPA_VOICES[v][2]
    if v in ("melo", "matcha-baker", "matcha-zh-en"):  # single-speaker models, all female (F0 ~235-250 Hz)
        return "female"
    sp = v.split(":", 1)[-1]
    return {"zf": "female", "zm": "male"}.get(sp[:2])


def sherpa_base_speed(voice):
    if voice in SHERPA_VOICES:
        return SHERPA_VOICES[voice][3]
    model_key, speaker = _sherpa_voice_parts(voice)
    if model_key.startswith("kokoro-v1.1") and speaker in KOKORO11_RATE_AT_1:
        rate = KOKORO11_RATE_AT_1[speaker]
    elif model_key.startswith("kokoro-v1.1"):
        rate = 3.45
    else:
        rate = OTHER_RATE_AT_1.get(model_key, 4.0)
    return round(min(1.6, max(0.8, TARGET_SYL_PER_SEC / rate)), 2)


def is_edge_voice(voice):
    return voice in EDGE_GENDER or bool(_EDGE_NAME.match(voice))


def plan_engine(engine, voice, probe_timeout):
    """Return (engine, resolved_voice, note)."""
    voice = voice or "male"
    if engine == "minimax":
        # no probe: cached clips can be reused offline; API/network errors surface per segment
        if voice in ("male", "female"):
            voice = MINIMAX_DEFAULT[voice]
        if not os.environ.get("MINIMAX_API_KEY", "").strip():
            print("[tts] note: MINIMAX_API_KEY is not set (fine if every segment is cached)", file=sys.stderr)
        return "minimax", voice, "forced"
    if engine == "edge":
        if voice in ("male", "female"):
            voice = EDGE_DEFAULT[voice]
        if not is_edge_voice(voice):
            raise SystemExit(f"--engine edge needs an edge voice, got {voice!r}")
        return "edge", voice, "forced"
    if engine == "sherpa":
        if voice in ("male", "female"):
            return "sherpa", SHERPA_DEFAULT[voice], "forced"
        if is_edge_voice(voice):
            g = gender_of(voice) or "male"
            return "sherpa", SHERPA_DEFAULT[g], f"edge voice {voice} mapped to {g} sherpa voice"
        return "sherpa", canonical_sherpa_voice(voice), "forced"
    # auto: MiniMax when a key is configured and reachable, then edge-tts, then the offline voice
    if os.environ.get("MINIMAX_API_KEY", "").strip() and voice in ("male", "female"):
        ok, reason, secs = minimax_probe(MINIMAX_DEFAULT[voice], max(probe_timeout, 8.0))
        if ok:
            return "minimax", MINIMAX_DEFAULT[voice], reason
        print(f"[tts] minimax unavailable ({reason}); trying edge-tts", file=sys.stderr, flush=True)
    if voice not in ("male", "female") and not is_edge_voice(voice):
        return "sherpa", canonical_sherpa_voice(voice), "explicit sherpa voice"
    edge_voice = EDGE_DEFAULT[voice] if voice in ("male", "female") else voice
    ok, reason, secs = edge_probe(edge_voice, probe_timeout)
    if ok:
        return "edge", edge_voice, f"edge reachable ({secs:.1f}s)"
    g = gender_of(voice) or "male"
    return "sherpa", SHERPA_DEFAULT[g], f"edge unavailable ({reason}; {secs:.2f}s) -> offline {g} voice"


# --------------------------------------------------------------------------------------------- audio post-processing
def _frame_db(x, sr, win=0.02, hop=0.005):
    w, h = int(sr * win), int(sr * hop)
    if len(x) < w:
        x = np.pad(x, (0, w - len(x)))
    n = 1 + (len(x) - w) // h
    c = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    e = (c[np.arange(n) * h + w] - c[np.arange(n) * h]) / w
    return 10 * np.log10(e + 1e-12), h, w


def trim_silence(x, sr, pad_ms=PAD_MS, rel_db=-45.0, floor_db=-65.0):
    db, h, w = _frame_db(x, sr)
    thr = max(db.max() + rel_db, floor_db)
    idx = np.flatnonzero(db > thr)
    if idx.size == 0:
        return x
    start, end = idx[0] * h, min(len(x), idx[-1] * h + w)
    pad = int(sr * pad_ms / 1000)
    y = x[start:end]
    fade = min(int(0.003 * sr), len(y) // 4)  # 3 ms fades so the cut never clicks
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float64)
        y = y.astype(np.float64).copy()
        y[:fade] *= ramp
        y[-fade:] *= ramp[::-1]
    z = np.zeros(pad)
    return np.concatenate([z, y, z])


def integrated_lufs(x, sr):
    import pyloudnorm as pyln
    y = x
    if len(y) < int(1.5 * sr):  # BS.1770 gating needs >= 400 ms blocks; tile short clips
        y = np.tile(y, int(math.ceil(1.5 * sr / max(1, len(y)))))
    v = pyln.Meter(sr).integrated_loudness(y.astype(np.float64))
    return float(v) if np.isfinite(v) else None


def _true_peak_env(x, os_factor=4):
    up = resample_poly(x, os_factor, 1)
    return np.abs(up[: len(x) * os_factor]).reshape(-1, os_factor).max(axis=1)


def limit_true_peak(x, sr, ceiling_db=TRUE_PEAK_CEILING_DB, lookahead_ms=5.0, release_ms=60.0):
    ceil = 10 ** (ceiling_db / 20)
    env = _true_peak_env(x)
    if env.max() <= ceil:
        return x, 0.0
    need = np.clip(1.0 - ceil / np.maximum(env, 1e-12), 0.0, 1.0)  # required gain reduction (linear)
    # work on 1 ms blocks: lookahead hold -> peak-hold with exponential release -> short attack smoothing
    blk = max(1, sr // 1000)
    nb = int(math.ceil(len(need) / blk))
    nb_need = np.pad(need, (0, nb * blk - len(need))).reshape(nb, blk).max(axis=1)
    la = max(1, int(round(lookahead_ms)))
    hold = maximum_filter1d(nb_need, size=2 * la + 1)          # reduction starts `la` ms before a peak
    dec = math.exp(-1.0 / release_ms)
    rel = np.empty_like(hold)
    prev = 0.0
    for i, v in enumerate(hold):                               # nb ~ 1000/s of audio: cheap
        prev = v if v > prev else prev * dec
        rel[i] = prev
    rel = np.maximum(uniform_filter1d(rel, size=la + 1), hold)  # soften the attack edge, never below hold
    red = np.interp(np.arange(len(x)), np.arange(nb) * blk + blk / 2.0, rel)
    red = np.maximum(red, need)                                # per-sample safety floor
    y = x * (1.0 - red)
    # numerical safety net: tiny residual overs after smoothing
    m = _true_peak_env(y).max()
    if m > ceil:
        y *= ceil / m
    return y, float(-20 * np.log10(max(1e-9, 1.0 - red.max())))


def finalize_audio(x, sr, target_lufs=TARGET_LUFS, pad_ms=PAD_MS):
    """-> (int16 samples @48k, info). High-pass, resample, trim, loudness-normalize, limit."""
    x = np.asarray(x, dtype=np.float64)
    x = sosfiltfilt(butter(2, 40, btype="highpass", fs=sr, output="sos"), x) if len(x) > 3 * 64 else x
    if sr != OUT_SR:
        g = math.gcd(sr, OUT_SR)
        x = resample_poly(x, OUT_SR // g, sr // g)
    x = trim_silence(x, OUT_SR, pad_ms)
    lufs_in = integrated_lufs(x, OUT_SR)
    gain_db = 0.0 if lufs_in is None else target_lufs - lufs_in  # None: (near) silent
    y, gr_db = limit_true_peak(x * 10 ** (gain_db / 20), OUT_SR)
    for _ in range(3):  # limiting lowers loudness a little: add make-up gain until within 0.15 LU
        lufs = integrated_lufs(y, OUT_SR)
        if lufs is None or abs(lufs - target_lufs) < 0.15:
            break
        gain_db += target_lufs - lufs
        y, gr_db = limit_true_peak(x * 10 ** (gain_db / 20), OUT_SR)
    pcm = np.clip(np.round(y * 32767.0), -32768, 32767).astype(np.int16)
    info = dict(lufs=integrated_lufs(pcm / 32768.0, OUT_SR), gain_db=gain_db, limiter_db=gr_db,
                peak_dbfs=20 * math.log10(max(1, int(np.abs(pcm.astype(np.int32)).max())) / 32768.0))
    return pcm, info


# --------------------------------------------------------------------------------------------- main
def count_syllables(text):
    """Rough spoken-syllable count (CJK chars + English syllables) for the pace report."""
    t = re.sub(r"\d", "一", text)  # each digit ~ one syllable
    n = len(re.findall(r"[\u4e00-\u9fff]", t))
    for w in re.findall(r"[A-Za-z]+", t):
        if w.isupper() and len(w) <= 6:
            n += sum(3 if c == "W" else 1 for c in w)
        else:
            k = len(re.findall(r"[aeiouy]+", w.lower()))
            if w.lower().endswith("e") and k > 1:
                k -= 1
            n += max(1, k)
    return n


def list_voices():
    print("edge (online):  male -> zh-CN-YunxiNeural   female -> zh-CN-XiaoxiaoNeural   (any edge zh voice works)")
    print("sherpa curated (offline):")
    for k, (m, s, g, b) in SHERPA_VOICES.items():
        star = " (default %s)" % g if SHERPA_DEFAULT.get(g) == k else ""
        print(f"  {k:24s} {g:6s} base_speed={b}{star}")
    print("sherpa other: kokoro-v1.1:zf_001..zm_100 (100 zh voices), kokoro-v1.0:zf_xiaoyi|zm_yunxi|...,")
    print("              melo | matcha-baker | matcha-zh-en   (models in %s)" % MODELS_DIR)


def load_extra_rules(path):
    if not path:
        return []
    data = json.load(open(path, encoding="utf-8"))
    items = data.items() if isinstance(data, dict) else data
    return [(re.compile(p), r) for p, r in items]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--in", dest="inp", help="segments JSON: [{id, text}, ...]")
    ap.add_argument("--out-dir", help="output directory")
    ap.add_argument("--engine", default="auto", choices=["auto", "minimax", "edge", "sherpa"])
    ap.add_argument("--voice", default="male")
    ap.add_argument("--speed", type=float, default=1.0, help="relative to the calibrated explainer pace")
    ap.add_argument("--lufs", type=float, default=TARGET_LUFS)
    ap.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 1))
    ap.add_argument("--probe-timeout", type=float, default=4.0)
    ap.add_argument("--rules", help="extra sherpa normalization rules: JSON {regex: replacement}")
    ap.add_argument("--zh-terms", action="store_true",
                    help="sherpa only: say Claude/API/LLM/Agent/Karpathy as 克劳德/接口/大模型/智能体/卡帕西")
    ap.add_argument("--no-normalize", action="store_true", help="disable the sherpa text rules")
    ap.add_argument("--force", action="store_true", help="ignore the cache")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args(argv)

    if args.list_voices:
        list_voices()
        return 0
    if not args.inp or not args.out_dir:
        ap.error("--in and --out-dir are required")
    if not (0.5 <= args.speed <= 2.0):
        ap.error("--speed must be within 0.5..2.0")
    if not shutil.which("ffmpeg"):
        print("[tts] warning: ffmpeg not found (needed for edge-tts / MiniMax mp3 decoding)", file=sys.stderr)

    segs = json.load(open(args.inp, encoding="utf-8"))
    if not isinstance(segs, list) or not all(isinstance(s, dict) and "id" in s and "text" in s for s in segs):
        raise SystemExit("input must be a JSON array of {\"id\": ..., \"text\": ...}")
    ids = [str(s["id"]) for s in segs]
    if len(set(ids)) != len(ids):
        raise SystemExit("duplicate segment ids")
    for i in ids:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", i):
            raise SystemExit(f"segment id {i!r} must match [A-Za-z0-9_.-]+ (it becomes a file name)")

    out = os.path.abspath(args.out_dir)
    cache_dir = os.path.join(out, ".cache")
    os.makedirs(cache_dir, exist_ok=True)
    pre = [(re.compile(p), r) for p, r in ZH_TERM_RULES] if args.zh_terms else []
    post = load_extra_rules(args.rules)
    rules_fp = "off" if args.no_normalize else rules_fingerprint(pre, post)

    engine, voice, note = plan_engine(args.engine, args.voice, args.probe_timeout)
    print(f"[tts] engine={engine} voice={voice} ({note})", flush=True)

    manifest, failed, engines_used = [], [], set()
    for s in segs:
        sid, text = str(s["id"]), str(s["text"]).strip()
        seg_engine, seg_voice = engine, voice
        wav_path = os.path.join(out, f"{sid}.wav")
        meta_path = os.path.join(cache_dir, f"{sid}.json")

        def plan(e, v):
            base = {"edge": EDGE_BASE_SPEED, "minimax": MINIMAX_BASE_SPEED}.get(e) or sherpa_base_speed(v)
            spoken = text if (e in ("edge", "minimax") or args.no_normalize) else normalize_for_sherpa(text, pre, post)
            eng_speed = round(base * args.speed, 4)
            kd = dict(v=PIPELINE_VERSION, text=text, engine=e, voice=v, speed=args.speed,
                      engine_speed=eng_speed, rules=rules_fp if e == "sherpa" else None,
                      lufs=args.lufs, sr=OUT_SR, pad=PAD_MS)
            if e == "minimax":
                kd["models"] = MINIMAX_MODELS
            key = json.dumps(kd, ensure_ascii=False, sort_keys=True)
            return spoken, eng_speed, hashlib.sha256(key.encode()).hexdigest()

        spoken, eng_speed, h = plan(seg_engine, seg_voice)
        cached = None
        if not args.force and os.path.exists(wav_path) and os.path.exists(meta_path):
            try:
                cm = json.load(open(meta_path))
                if cm.get("hash") == h and sf.info(wav_path).frames == cm.get("frames"):
                    cached = cm
            except Exception:
                cached = None
        if cached:
            entry = cached["entry"]
            entry["cached"] = True
            print(f"[tts] {sid}: cached ({entry['duration_sec']:.2f}s)", flush=True)
        else:
            t0 = time.time()
            fallback = False
            try:
                if seg_engine == "minimax":
                    x, sr = minimax_synth(spoken, seg_voice, eng_speed)
                    time.sleep(0.3)   # stay well under the per-minute request limit
                elif seg_engine == "edge":
                    try:
                        x, sr = edge_synth(spoken, seg_voice, eng_speed)
                    except Exception as e:
                        if args.engine != "auto":
                            raise
                        g = gender_of(seg_voice) or "male"
                        print(f"[tts] WARNING {sid}: {e}; falling back to sherpa", file=sys.stderr, flush=True)
                        seg_engine, seg_voice, fallback = "sherpa", SHERPA_DEFAULT[g], True
                        spoken, eng_speed, h = plan(seg_engine, seg_voice)
                        x, sr = sherpa_synth(spoken, seg_voice, eng_speed, args.threads)
                else:
                    x, sr = sherpa_synth(spoken, seg_voice, eng_speed, args.threads)
            except Exception as e:
                print(f"[tts] ERROR {sid}: {e}", file=sys.stderr, flush=True)
                failed.append(sid)
                continue
            synth_s = time.time() - t0
            raw_dur = len(x) / sr
            pcm, info = finalize_audio(x, sr, args.lufs)
            tmp = wav_path + ".tmp.wav"
            sf.write(tmp, pcm, OUT_SR, subtype="PCM_16")
            os.replace(tmp, wav_path)
            dur = len(pcm) / OUT_SR
            speech = max(1e-6, dur - 2 * PAD_MS / 1000)
            entry = dict(id=sid, text=text, file=f"{sid}.wav", path=wav_path, duration_sec=round(dur, 3),
                         engine=seg_engine, voice=seg_voice, speed=args.speed, engine_speed=eng_speed,
                         spoken_text=spoken if spoken != text else None,
                         chars_per_sec=round(count_syllables(spoken) / speech, 2),
                         lufs=None if info["lufs"] is None else round(info["lufs"], 2),
                         peak_dbfs=round(info["peak_dbfs"], 2), limiter_db=round(info["limiter_db"], 2),
                         rtf=round(synth_s / max(raw_dur, 1e-6), 3), fallback=fallback or None, cached=False,
                         model=_MINIMAX_STATE.get("model") if seg_engine == "minimax" else None,
                         hash=h)
            entry = {k: v for k, v in entry.items() if v is not None}
            json.dump(dict(hash=h, frames=len(pcm), entry=entry), open(meta_path, "w"), ensure_ascii=False, indent=1)
            print(f"[tts] {sid}: {seg_engine}/{seg_voice} {dur:.2f}s rtf={entry['rtf']} "
                  f"{entry['chars_per_sec']} syl/s lufs={entry.get('lufs')} peak={entry['peak_dbfs']}dBFS", flush=True)
        engines_used.add((entry["engine"], entry["voice"]))
        manifest.append(entry)
        json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), ensure_ascii=False, indent=1)

    if len(engines_used) > 1:
        print(f"[tts] WARNING: mixed engines/voices in this output: {sorted(engines_used)} "
              f"(re-run with --engine sherpa or --engine edge for a consistent voice)", file=sys.stderr)
    total = sum(e["duration_sec"] for e in manifest)
    print(f"[tts] done: {len(manifest)} ok, {len(failed)} failed, total {total:.2f}s -> "
          f"{os.path.join(out, 'manifest.json')}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
