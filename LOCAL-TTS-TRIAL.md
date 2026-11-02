# 本地中文朗读验证（历史试验记录）

本文保留早期性能试验过程；0.1.10 已接入可选 CPU 朗读桥接。当前安装、FP32模型布局和启用步骤以 [README](README.md#如何启用回复朗读0110-新增可选) 为准，下列 INT8/临时安装命令不是推荐部署教程。

目标环境：i7-8700（6核12线程）、RTX 5060 Ti 16GB、128GB RAM。试验仅 CPU，不使用 CUDA，不修改 DSH 核心或运行中服务；试验模型及音频不公开打包。

## 模型来源

- [中文 v1.1 ONNX 模型镜像](https://hf-mirror.com/onnx-community/Kokoro-82M-v1.1-zh-ONNX/tree/main)
- 下载 `onnx/model_int8.onnx`（127,356,504 bytes）、`tokenizer.json`，以及 `zf_001`、`zf_002`、`zm_010` 三种音色。
- 模型与音色必须来自同一中文 v1.1 系列。不要混用 v1.0 vocab 或把 PyTorch pickle 当作原始 float32 音色。
- 来源、SHA256、本机模型与试听放 `.local-tts/`，不进入 npm 包或 Git。
- 模型页面标注 Apache-2.0；分发前仍需核对模型和音色授权。

## 隔离试验

使用工作区内 `.venv-tts`，不修改系统 Python 或 ComfyUI 环境。

```powershell
python -m venv .venv-tts
$env:TEMP="$PWD\.local-tts\tmp"
$env:TMP=$env:TEMP
$env:PIP_USE_DEPRECATED='legacy-certs'
.\.venv-tts\Scripts\python.exe -m pip install --no-build-isolation --disable-pip-version-check -i https://mirrors.aliyun.com/pypi/simple setuptools wheel
.\.venv-tts\Scripts\python.exe -m pip install --no-build-isolation --disable-pip-version-check -i https://mirrors.aliyun.com/pypi/simple -r scripts/tts-requirements.txt
.\.venv-tts\Scripts\python.exe -B scripts/tts-benchmark.py --threads 2
```

`legacy-certs` 是本机 pip 系统证书集成路径卡住后的兼容选项，不是关闭 HTTPS 证书校验。依赖安装与模型下载是两个渠道，模型优先 hf-mirror/ModelScope。

基准固定 CPUExecutionProvider、单进程、2线程（可选择1～4）、关闭推理线程空转。测试三音色、三段文本，记录 G2P 与总耗时、音频长度、RTF、工作集及5秒空闲 CPU。RTF < 1 才代表本轮比播放快；还应在用户的其他 LLM 运行时复测，不能把单任务结果当并发保证。

目前数字测试文本预先写成汉字，不证明任意日期、小数、单位归一化正确。中英混读未实现英文 G2P；Misaki 无英文回调会跳过或替换英文，需要后续明确支持，不能宣称已支持。

## 首轮实测（2026-11-01）

同一机器、ONNX Runtime 1.31.1、CPU两线程、三音色×三段中文；不是其他 LLM 满载时的并发保证。

| 模型 | 下载体积 | 合成约8秒语音 | RTF | 本轮工作集 |
| --- | --- | --- | --- | --- |
| INT8 | 127 MB | 31.7～34.5秒 | 4.12～4.23 | 最后约517 MiB，峰值912 MiB |
| FP32 | 339 MB | 首条3.67秒，后续2.85～3.10秒 | 热态约0.37～0.38 | 九条后约1353 MiB，峰值1356 MiB |

INT8在此CPU上反而慢约一个数量级，不适合即时朗读；FP32可继续验证。额外一线程短句对照：7.925秒音频用5.864秒生成（含首次G2P约0.86秒，RTF0.74），降低并行度仍能比播放快，但首句等待更长；当前worker保守采用两线程。较长回复16～17秒音频用约6.1～6.4秒合成。两版均限定CPUExecutionProvider，不加载GPU模型。空闲5秒CPU时间详见本地JSON报告。FP32默认arena会保留高水位内存，常驻worker将另测禁arena模式，不能把初始0.9GB当长期固定占用。

试听位于 `.local-tts/samples/`；报告为 `.local-tts/benchmark-t2.json`（INT8）及 `.local-tts/benchmark-model-t2.json`（FP32）。这些是实测合成结果，尚未进行用户主观听感验收。

## 插件接入边界

开发源码已接入：`src/readout-text.js` 正文清洗与中文分句；`src/readout-client.js` 设置页配置、音色/语速/试听/停止和保守实时完成检测；`src/tts-host.js` 同源 owner-only 认证路由与懒启动CPU worker。仅提供正文，不传 reasoning/工具日志。

使用 DSH 的 Session 实时 turn/start 和正常 completed turn/end 加 Chat turn-tail 数据，不把任意 assistant/message 当最终回复。只读启用后新开始且正常完成的轮次，不补播历史/重连/HMR记录。默认朗读关闭；录音、发起新轮、换会话、页面失焦或隐藏、停插件时停止并取消请求。浏览器一边播放当前句、一边最多预取一句。HTTP限制16KiB正文、160字符、一个执行与两个排队任务、120秒总超时，取消活动任务时终止完整Python进程树。

真实Node Host到Python桥接测试通过：同一持久worker连续生成两个有效WAV，停止后确认进程树已清理。完整JS单测另覆盖状态、边界、队列与生命周期；Python输入校验4项通过。默认npm test跳过实际模型smoke，设置TTS_HOST_SMOKE=1显式执行。尚未进行真实GUI集成验收；源码和打包检查不等于已安装使用。

后续本地开发版已安装到现有GUI，真实试听播放完成；iOS用户参与手动自动朗读测试。新的中英混读、诊断增强按下节单独验证，不将桌面浏览器测试等同真实Safari验收。

## 常驻原型（不自动启动）

`scripts/tts-worker.py` 仅在启动时加载一份本地 FP32 模型，使用 stdin/stdout JSONL，不监听网络端口。关闭 CPU arena 与 memory pattern 以测试常驻内存高水位，具体性能见 smoke 报告。可用 `.venv-tts/Scripts/python.exe -B scripts/tts-worker-smoke.py` 发送两条请求、校验24kHz单声道PCM WAV并在EOF退出，不遗留常驻进程。

请求形如 `{"id":"1","text":"你好，这是中文朗读。","voice":"zf_001","speed":1.0}`；首条为 ready，后续返回音频base64或错误。限制单行16KiB、文本160字符、三种固定音色、语速0.7～1.5、音素510；早期原型拒绝英文字母；现已使用离线英语回调支持混读，详情见下一节；0.1.10 发布包含该实现但不包含模型。

禁arena版worker真实EOF测试：加载约3.46秒；第一句3.8秒音频用2.38秒生成（含首次G2P约0.57秒），第二句3.825秒音频用1.81秒生成；外侧递归采样含Windows Python redirector及其实际推理子进程，合计峰值约827.6 MiB。两条样本不能证明长时间内存上限，需进一步混合长度压测。输出严格为ready+两条JSON，24kHz单声道PCM16音频有效，EOF正常退出，无遗留worker。

## 中英混读与诊断增强

使用Misaki中文v1.1原生en_callable，直接读取已有wheel中的us_gold/us_silver发音词典，不导入会触发Torch/BART和spaCy下载的misaki.en.G2P。普通词按美式词典、缩写逐字母、未知词逐字母兜底，并检查输入/回调英文字母数量一致。三音色×六类文本加长英文共19项真实CPU样本全部成功。zf_001的iOS Safari混合句生成3.875秒音频耗时2.696秒；HTTP400/API句5.1秒音频耗时2.791秒；159字符未知英文574音素分两段生成29.8秒音频耗时16.687秒，无截断。报告和WAV在`.local-tts/mixed-smoke/`；报告包含人工测试用文字/音素，仅作本地试验证据，不是生产诊断日志。

生产诊断只留安全metadata：宿主固定`.local-tts/logs/tts-host.jsonl`，1MiB轮转加两个备份；浏览器内存最近200事件可通过「复制诊断日志」导出。每个HTTP请求返回X-TTS-Request-Id，失败返回具体code和同一requestId；不记录正文、音频、凭据或原始异常。错误提示区分HTTP输入校验、worker合成失败、Safari授权和媒体解码失败。

## 环境排查记录

期间出现Python写缓存目录失败。已在用户切换完全权限后运行内置诊断工具，仅给 `scripts` 目录补当前用户权限，验证权限变更成功；原始字节码缓存写入仍失败，因此不宣称故障已修好。随后使用不产出字节码的运行方式，实际依赖安装、模型推理和测试通过。权限恢复脚本及诊断报告保留于 `.local-tts/acl-recovery/`，未改文件内容或所有者。没有对工作区以外的父目录做权限变更。
