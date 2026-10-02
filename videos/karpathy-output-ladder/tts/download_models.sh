#!/usr/bin/env bash
# Offline models used by tts.py (Kokoro v1.1 Mandarin voices) and by build_audio.py (Paraformer ASR for
# character-level timing). Both come from the sherpa-onnx GitHub releases.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p models && cd models
fetch() {  # $1 = release tag, $2 = archive name without .tar.bz2
  if [ -d "$2" ]; then echo "ok: $2"; return; fi
  curl -fL --retry 4 -o "$2.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/$1/$2.tar.bz2"
  tar xjf "$2.tar.bz2" && rm "$2.tar.bz2"
}
fetch tts-models kokoro-multi-lang-v1_1
fetch asr-models sherpa-onnx-paraformer-zh-2023-09-14
