"""Explicit real CPU mixed-language test; writes local WAV/phoneme evidence.
Run: .venv-tts/Scripts/python.exe -B test/tts-mixed-smoke.py
No downloads, DSH installation, ports or persistent worker processes.
"""
import base64
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.local-tts' / 'mixed-smoke'
OUT.mkdir(parents=True, exist_ok=True)
TMP = ROOT / '.local-tts' / 'tmp'
TMP.mkdir(exist_ok=True)
for key in ('TEMP', 'TMP', 'TMPDIR'):
    os.environ[key] = str(TMP)
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', CUDA_VISIBLE_DEVICES='-1')
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('tts_worker_smoke', ROOT / 'scripts' / 'tts-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
texts = [
    ('ios', '请在iOS Safari里面启用声音。'),
    ('http', '朗读服务返回HTTP 400，请检查API。'),
    ('chatgpt', 'ChatGPT可以讲中文，也可以说Hello world。'),
    ('chinese', '晚风轻轻吹过窗台，小猫趴在月光里睡着了。'),
    ('english', 'Hello world. This is a local speech test.'),
    ('fallback', '未知词qzunknown仍然逐字母读出。'),
]
report = {'frontend': 'misaki.zh.ZHG2P(version=1.1,en_callable=OfflineEnglish)', 'samples': []}
with (OUT / 'frontend-stderr.log').open('w', encoding='utf-8') as log, contextlib.redirect_stdout(log):
    started = time.perf_counter()
    engine = worker.Synthesizer()
    report['loadSeconds'] = time.perf_counter() - started
    for voice in worker.VOICES:
        for key, text in texts:
            request = worker.validate_request({'id': key, 'text': text, 'voice': voice})
            result = engine.synthesize(request)
            audio = base64.b64decode(result.pop('audioBase64'))
            target = OUT / f'{key}-{voice}.wav'
            target.write_bytes(audio)
            engine.english.reset()
            phones, _ = engine.g2p(text)
            result.update(wav=str(target), wavBytes=len(audio), text=text, phonetic=phones,
                          englishEvents=list(engine.english.events))
            report['samples'].append(result)
            print(json.dumps({k: v for k, v in result.items() if k not in ('phonetic', 'englishEvents')}, ensure_ascii=False), file=sys.__stdout__, flush=True)
    # Maximum request full of unknown English letters exceeds one inference.
    text = ' '.join(['qzxv'] * 32)  # 159 characters, all deliberately unknown
    result = engine.synthesize(worker.validate_request({'id': 'long-fallback', 'text': text}))
    audio = base64.b64decode(result.pop('audioBase64'))
    target = OUT / 'long-fallback-zf_001.wav'
    target.write_bytes(audio)
    result.update(wav=str(target), wavBytes=len(audio))
    assert result['segments'] > 1
    report['samples'].append(result)
    print(json.dumps(result, ensure_ascii=False), file=sys.__stdout__, flush=True)
report['totalSeconds'] = time.perf_counter() - started
(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('Report:', OUT / 'report.json')
