# 读懂 AI 的四级台阶 —— Karpathy 推文解说视频

把 [Andrej Karpathy 2026-10-02 的推文](https://x.com/karpathy/status/2105819303471976479) 做成一段约 3 分钟的中文解说视频。
做法参考了 [@claudeai 的 Opus 5.5 作品集锦帖](https://x.com/claudeai/status/2103515655760982273)：让大模型直接用代码把概念画成可视化动画
（帖子里的「镜头实验室」等作品），而不是只给一段文字。

| 文件 | 说明 |
|---|---|
| `karpathy-output-ladder.mp4` | 成片：1920×1080 · 30fps · H.264 + AAC 48kHz 立体声 · 2 分 58 秒 · 中文配音 + 烧录字幕 |
| `karpathy-output-ladder.srt` | 同步字幕文件（方便上传平台时单独挂载） |
| `cover.png` | 封面截图 |
| `project/` | 脚本、配音/配乐构建脚本、动画页面源码 |
| `render/` | HTML → MP4 逐帧渲染器（Playwright + ffmpeg） |
| `tts/` | 配音脚本：优先 edge-tts，连不上时自动换成离线 Kokoro 中文语音 |

## 内容说明

推文讲的是「怎样更好地读大模型的输出」：从受约束的文字，到图解，到让模型直接输出 HTML 交互网页，再到
3Blue1Brown 风格的解说视频（每上一级都是一句 *but even better*），以及「智能和代码越来越充裕后，
可以要大型、定制、用完即弃的软件作品」这个判断。

> ⚠️ 制作时的云端环境无法访问 x.com，且推文刚发出、尚未被搜索引擎收录，所以内容整理自公开报道
> （FourWeekMBA《Karpathy's Case for Discardable Software》等）。视频里的英文引文摘自这些报道中的引用，
> 措辞可能与原推文略有出入；如需逐字核对，把原文发来即可重新校对脚本并重渲染。

分镜：

| 时间 | 场景 | 画面 |
|---|---|---|
| 0:00 | 开场 | 大模型几秒刷出上万字 → 「读得完？看得懂？」 |
| 0:08 | 推文 | Karpathy 推文要点卡片 → 等距 3D 四级台阶，小人一级级往上跳 |
| 0:22 | 01 文字 | 勾股定理的文字定义逐字打出，「脑内绘图中……」 |
| 0:37 | 02 图解 | 手绘风三角形 + 三个正方形，9 + 16 个方块飞进 25 格的大正方形 |
| 0:51 | 03 网页 | 「请用 HTML 组织回答」→ 浏览器里拖滑块验证 a²+b²=c²；镜头实验室示意 |
| 1:15 | 04 视频 | 深色 3Blue1Brown 风格：四个三角形换位置，c² 变成 a² + b²；配音的波形就是你正在听的声音 |
| 1:52 | 为什么是现在 | 成本曲线跌破「值得做的门槛」，英文原句逐词高亮，小工具被扔进垃圾桶 |
| 2:12 | 瓶颈 | 生成几乎免费，理解力才是瓶颈：瓶口随台阶变宽，进到瓶里的信息变多 |
| 2:30 | 结尾 | 「用网页回答我 / 给我做个视频」，揭秘本视频的制作方式，小人登顶 |

## 配音：为什么不是 edge-tts

edge-tts 需要访问 `speech.platform.bing.com`，制作环境的网络策略拦截了这个域名，所以本版用的是
**离线开源 TTS**：sherpa-onnx + Kokoro v1.1 中文男声 `zm_045`（另有女声 `zf_036`）。`tts/tts.py`
会先用 4 秒探测 edge-tts，能连上就用 edge（默认 `zh-CN-YunxiNeural`），连不上才回退到离线语音。
在能访问该域名的机器上，按下面步骤用 `--engine edge` 重跑即可换成 edge-tts 配音，画面会按新的时长自动对齐。

为了让英文词读得准，口播稿里把 Claude / 3Blue1Brown / Karpathy 写成「克劳德 / 三蓝一棕 / 卡帕西」，
字幕仍显示原文（见 `project/script.json` 的 `say` 字段）。

## 制作流程

1. `project/script.json`：34 句口播稿（字幕文本 `text`，需要时另给朗读文本 `say`）。
2. `project/build_audio.py`：逐句 TTS → 用 Paraformer 语音识别拿到每个字的时间戳 → 生成时间轴
   `page/timeline.js` 和 `build/narration.wav`。动画里的每个动作都锚定在具体的字上（比如说到「十六」时第 16 个方块落下）。
3. `project/page/`：整片动画是一个网页，`renderFrame(t)` 是时间 t 的纯函数（SVG / Canvas / rough.js 手绘风）。
4. `project/dump_cues.mjs` + `make_audio.py`：从页面导出音效时间点，用 numpy 程序化合成配乐（C–Am–F–G 氛围铺底，
   人声出现时自动压低 6 dB）和音效，混音后响度标准化到 −15 LUFS。
5. `render/render.mjs`：4 个无头 Chromium 并行逐帧截图 → ffmpeg 编码，帧数精确到每一帧。

## 重新生成

依赖：Node 22+、Python 3.10+、ffmpeg、Playwright（Chromium）。

```bash
cd videos/karpathy-output-ladder
# 渲染器的字体与前端库（Noto Sans/Serif SC、霞鹜文楷、Instrument Serif、rough.js 等，全部本地化）
(cd render && npm install && pip install fonttools brotli && npm run build-gap-fonts && npm run setup-assets)
# 配音依赖与离线模型
pip install edge-tts sherpa-onnx soundfile numpy scipy onnx
./tts/download_models.sh

cd project
python3 build_audio.py                 # 默认 --engine auto；有网络时可用 --engine edge --voice zh-CN-YunxiNeural
node dump_cues.mjs && python3 make_audio.py
node ../render/render.mjs --page page/index.html --out ../karpathy-output-ladder.mp4 \
  --audio build/final_audio.wav --workers 4 --crf 18 --preset slow
# 预览：--scale 0.5 出半分辨率小样；--frames 12.5,40 输出指定时刻的截图
```
