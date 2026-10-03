# 读懂 AI 的四级台阶 —— Karpathy 推文解说视频

把 [Andrej Karpathy 2026-10-02 的推文](https://x.com/karpathy/status/2105819303471976479) 做成一段约 3 分 40 秒的中文解说视频。
做法参考了 [@claudeai 的 Opus 5.5 作品集锦帖](https://x.com/claudeai/status/2103515655760982273)：让大模型直接用代码把概念画成可视化动画
（帖子里的「镜头实验室」等作品），而不是只给一段文字。

| 文件 | 说明 |
|---|---|
| `karpathy-output-ladder.mp4` | 成片：1920×1080 · 30fps · H.264 + AAC 48kHz 立体声 · 3 分 42 秒 · MiniMax 中文配音（精英青年音色）+ 烧录字幕 |
| `karpathy-output-ladder.srt` | 同步字幕文件（方便上传平台时单独挂载） |
| `cover.png` | 封面截图 |
| `project/` | 脚本、配音/配乐构建脚本、动画页面源码 |
| `render/` | HTML → MP4 逐帧渲染器（Playwright + ffmpeg） |
| `tts/` | 配音脚本：MiniMax / edge-tts / 离线 Kokoro 三种引擎 |

## 内容说明

脚本按推文原文逐段整理（原文和配图都已逐字核对）。推文开头一句是
*“We'll be spending a lot more time trying to understand the outputs of language models.”*，
接着给出四种让输出更好懂的形式，每上一级都是一句 *but even better*：受约束的文字（ASD-STE100）→ 图解 →
让模型直接输出 HTML 交互网页 → 3Blue1Brown 风格的定制解说视频。最后是他的两点判断：
大模型会自己干完越来越多的活，人的工作会往上走、变成监督和理解；而智能和代码越来越充裕，
可以放心去要那些大型、定制、用完即弃的软件作品（网页应用、解说视频）。

### 第一级里的 ASD-STE100

推文的第一条建议是：让大模型用 **ASD-STE100** 来解释问题。视频用了大约 40 秒讲它，内容取自推文配图
（`project/page/assets/ste100_overview.png`，即 Karpathy 附的那张 ASD-STE100 一页速览）：

- **是什么**：Simplified Technical English（简化技术英语），一套受控语言规范，最早为航空维修手册制定，
  由欧洲航空航天与防务工业协会（ASD）维护。1979 年航空业开始制定，1986 年发布首版指南，2005 年定名 ASD-STE100。
- **规矩**：大约 900 个许可词，每个词只有一个词性、一个意思；一句话只给一个指令；操作步骤每句最多 20 个词，
  描述句最多 25 个词；步骤里用主动语态。
- **例句**（来自配图）：*It is imperative that the operator ensures the hydraulic reservoir is replenished prior to
  commencing operation.* → *Make sure that the hydraulic reservoir is full before you start the operation.*（13 个词，上限 20）
- **Karpathy 的用法**：大模型很熟这套规范，写出来干净、好读；嫌原版太严，可以要「80% of the way to ASD-STE100」。

第二级「图解」直接拿这张配图做例子：整份规范浓缩成了一页图。结尾的提示词也加上了「用 ASD-STE100 来写」。

分镜：

| 时间 | 场景 | 画面 |
|---|---|---|
| 0:00 | 开场 | 大模型几秒刷出上万字 → 「读得完？看得懂？」 |
| 0:08 | 推文 | 推文开头原句（英文 + 译文）→ 等距 3D 四级台阶，小人一级级往上跳 |
| 0:23 | 01 文字 | ASD-STE100 规范卡（飞机维修手册 · 1979 / 1986 / 2005）→ 三条规则 → 配图例句改写前后对比 → 「80% 的 ASD-STE100」严格度刻度 → 「那张图还得自己在脑子里画」 |
| 1:03 | 02 图解 | 推文配图放大 → 手绘风三角形 + 三个正方形，9 + 16 个方块飞进 25 格的大正方形 |
| 1:27 | 03 网页 | 「请用 HTML 组织回答」→ 浏览器里拖滑块验证 a²+b²=c²；镜头实验室示意 |
| 1:51 | 04 视频 | 推文里的提示词原句 → 深色 3Blue1Brown 风格：四个三角形换位置，c² 变成 a² + b²；配音的波形就是你正在听的声音 |
| 2:30 | 瓶颈 | 大模型的活越干越多，人的工作变成监督和理解：瓶口随台阶变宽，进到瓶里的信息变多 |
| 2:45 | 幸好 | 成本曲线跌破「值得做的门槛」，推文原句逐词高亮，小工具用完即弃；「放开手去尝试，你会被惊到」 |
| 3:11 | 结尾 | 「用 ASD-STE100 来写 / 用网页回答我 / 给我做个视频」，揭秘本视频的制作方式，小人登顶 |

## 配音

`tts/tts.py` 支持三种引擎，`project/script.json` 默认用 **MiniMax**（音色 `male-qn-jingying` 精英青年）：

| 引擎 | 说明 |
|---|---|
| `minimax` | MiniMax T2A v2 付费 API。密钥只从环境变量 `MINIMAX_API_KEY` 读取，不落盘、不进仓库。中国站密钥走 `api.minimaxi.com`，国际站走 `api.minimax.io`，脚本会依次尝试（也可用 `MINIMAX_API_HOST` 指定）；模型依次尝试 `speech-2.8-hd` → `speech-2.6-hd` → `speech-02-hd`（`MINIMAX_MODEL` 可覆盖） |
| `edge` | edge-tts，免费在线，默认 `zh-CN-YunxiNeural`，需要能访问 `speech.platform.bing.com` |
| `sherpa` | 离线开源：sherpa-onnx + Kokoro v1.1 中文男声 `zm_045`，不需要网络 |

> 当前的 `karpathy-output-ladder.mp4` 是 **MiniMax 配音版**（`speech-2.8-hd` · `male-qn-jingying`，经 `api.minimaxi.com`）。
> 最早的一版用的是离线 Kokoro 语音（当时网络策略还没放行 MiniMax），仍可在 git 历史里找到；
> 换引擎后画面会按新的语音时长自动对齐。

画面和台词里涉及「这段配音是怎么来的」的地方会跟着引擎变：`script.json` 里的 `variants.minimax`
会替换第 19、26、38 句（MiniMax 版直接读 Claude、说「用 MiniMax 的语音模型合成」，离线版说「免费合成」），
第 4 级里高亮的配音选项卡片和结尾「怎么做出来的」卡片上的引擎名也随之切换。

为了让英文词读得准，离线版口播稿把 Claude / 3Blue1Brown / Karpathy 写成「克劳德 / 三蓝一棕 / 卡帕西」；
MiniMax 版直接读 Claude，其余保持中文读法。ASD-STE100 在口播稿里写成「ASD STE 100」，按字母加数字来读。
字幕始终显示原文（见 `script.json` 的 `say` 字段）。每句配音合成后都用语音识别回读一遍，
读音有歧义的句子会改写（比如「大胆去试」听起来像「去世」，改成了「放开手去尝试」）。

## 制作流程

1. `project/script.json`：39 句口播稿（字幕文本 `text`，需要时另给朗读文本 `say`）。
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
./tts/download_models.sh               # 离线语音模型 + 字级对齐用的 Paraformer（MiniMax 版也需要后者）

cd project
export MINIMAX_API_KEY=...              # 你自己的 MiniMax 密钥，不要写进仓库
python3 build_audio.py                 # 默认 MiniMax / male-qn-jingying；离线：--engine sherpa --voice male
node dump_cues.mjs && python3 make_audio.py
node ../render/render.mjs --page page/index.html --out ../karpathy-output-ladder.mp4 \
  --audio build/final_audio.wav --workers 4 --crf 18 --preset slow
python3 make_srt.py                    # 同步更新 ../karpathy-output-ladder.srt
# 预览：--scale 0.5 出半分辨率小样；--frames 12.5,40 输出指定时刻的截图
```
