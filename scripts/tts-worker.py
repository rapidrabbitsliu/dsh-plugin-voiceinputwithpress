"""Local CPU-only JSONL TTS prototype; no ports, downloads or dynamic paths.

Only main() loads third-party modules/models. Body-only Chinese/ASCII English
uses native Misaki English callback with offline dictionary/letter fallback.
Protocol: one ready record, then one success/error record per input line.
"""
import base64
import contextlib
import io
import json
import math
import os
from pathlib import Path
import re
import sys
import time
import wave

MAX_LINE_BYTES = 16384
MAX_TEXT_CHARS = 160
VOICES = ('zf_001', 'zf_002', 'zm_010')
ROOT = Path(__file__).resolve().parents[1] / '.local-tts' / 'models'


class InputError(ValueError):
    """A safe, user-facing protocol rejection."""


def validate_request(value):
    """Return normalized request fields without importing or loading a model."""
    if not isinstance(value, dict):
        raise InputError('request must be a JSON object')
    if set(value) - {'id', 'text', 'voice', 'speed'}:
        raise InputError('unknown request fields')
    request_id = value.get('id')
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
        raise InputError('id must be a nonempty string of at most 128 characters')
    text = value.get('text')
    if not isinstance(text, str) or not text.strip():
        raise InputError('text must be a nonempty string')
    if len(text) > MAX_TEXT_CHARS:
        raise InputError('text exceeds 160 characters')
    if any(0xD800 <= ord(char) <= 0xDFFF for char in text):
        raise InputError('text contains an unpaired surrogate')
    if any(ord(char) < 32 and char not in '\n\r\t' for char in text):
        raise InputError('text contains unsupported control characters')
    voice = value.get('voice', 'zf_001')
    if not isinstance(voice, str) or voice not in VOICES:
        raise InputError('voice must be zf_001, zf_002 or zm_010')
    speed = value.get('speed', 1.0)
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not math.isfinite(speed) or not 0.7 <= speed <= 1.5:
        raise InputError('speed must be a finite number between 0.7 and 1.5')
    return {'id': request_id, 'text': text.strip(), 'voice': voice, 'speed': float(speed)}


def input_records(stream):
    """Read bounded binary lines; discard an oversized record without retaining it."""
    while True:
        line = stream.readline(MAX_LINE_BYTES + 1)
        if not line:
            return
        if len(line) > MAX_LINE_BYTES:
            while not line.endswith(b'\n'):
                line = stream.readline(MAX_LINE_BYTES + 1)
                if not line:
                    break
            yield None
        else:
            yield line


class Synthesizer:
    def __init__(self):
        import numpy as np
        import onnxruntime as ort
        from misaki import zh
        self.np = np
        opts = ort.SessionOptions()
        opts.enable_cpu_mem_arena = False
        opts.enable_mem_pattern = False
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        opts.add_session_config_entry('session.intra_op.allow_spinning', '0')
        opts.add_session_config_entry('session.inter_op.allow_spinning', '0')
        self.session = ort.InferenceSession(str(ROOT / 'model.onnx'), sess_options=opts, providers=['CPUExecutionProvider'])
        from tts_english import OfflineEnglish
        self.english = OfflineEnglish()
        self.g2p = zh.ZHG2P(version='1.1', en_callable=self.english)
        self.vocab = json.loads((ROOT / 'tokenizer.json').read_text(encoding='utf-8'))['model']['vocab']
        self.styles = {voice: np.fromfile(ROOT / (voice + '.bin'), dtype=np.float32).reshape(-1, 1, 256) for voice in VOICES}

    def synthesize(self, request):
        np = self.np
        begin = time.perf_counter()
        from tts_english import split_phonemes
        self.english.reset()
        phones, _ = self.g2p(request['text'])
        expected_letters = len(re.findall(r'[A-Za-z]', request['text']))
        actual_letters = sum(event['letters'] for event in self.english.events)
        if expected_letters != actual_letters:
            raise InputError('English frontend did not preserve every input letter')
        try:
            segments = split_phonemes(phones)
        except ValueError as error:
            raise InputError(str(error)) from error
        # Whitespace may be formatting; unknown non-whitespace is never dropped.
        unknown = {char for char in phones if char not in self.vocab and not char.isspace()}
        if unknown:
            raise InputError('unsupported phoneme in Chinese transcription')
        token_segments = [[self.vocab[char] for char in segment if char in self.vocab] for segment in segments]
        if any(not 0 < len(ids) <= 510 or len(ids) >= len(self.styles[request['voice']]) for ids in token_segments):
            raise InputError('phoneme length is outside model/style limits')
        g2p_seconds = time.perf_counter() - begin
        inference_begin = time.perf_counter()
        parts, total_samples = [], 0
        for ids in token_segments:
            part = self.session.run(None, {
                'input_ids': np.array([[0, *ids, 0]], dtype=np.int64),
                'style': self.styles[request['voice']][len(ids)],
                'speed': np.array([request['speed']], dtype=np.float32),
            })[0].reshape(-1)
            total_samples += len(part)
            if total_samples > 24000 * 120 or not np.isfinite(part).all():
                raise InputError('model returned invalid or excessive audio')
            parts.append(part)
        audio = np.concatenate(parts)
        inference_seconds = time.perf_counter() - inference_begin
        if not 0 < len(audio) <= 24000 * 120 or not np.isfinite(audio).all():
            raise InputError('model returned invalid or excessive audio')
        pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2').tobytes()
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(pcm)
        elapsed = time.perf_counter() - begin
        duration = len(audio) / 24000
        return {
            'id': request['id'], 'audioBase64': base64.b64encode(buffer.getvalue()).decode('ascii'),
            'mime': 'audio/wav', 'voice': request['voice'], 'sampleRate': 24000,
            'phonemes': sum(map(len, token_segments)), 'segments': len(token_segments),
            'frontend': 'misaki.zh.v1.1+offline-us-lexicon-letter-fallback',
            'englishPaths': sorted({event['path'] for event in self.english.events}),
            'englishCounts': {path: sum(event['path'] == path for event in self.english.events)
                              for path in sorted({event['path'] for event in self.english.events})},
            'audioSeconds': round(duration, 4),
            'g2pSeconds': round(g2p_seconds, 4), 'inferenceSeconds': round(inference_seconds, 4),
            'totalSeconds': round(elapsed, 4), 'rtf': round(elapsed / duration, 4),
        }


def main():
    # Python/library prints must never enter the JSONL stream. Native ORT logs
    # already use stderr. English uses only bundled offline pronunciation data.
    output = sys.stdout
    def emit(value):
        output.write(json.dumps(value, ensure_ascii=False, allow_nan=False) + '\n')
        output.flush()
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
    os.environ['OMP_NUM_THREADS'] = '2'
    with contextlib.redirect_stdout(sys.stderr):
        started = time.perf_counter()
        try:
            engine = Synthesizer()
        except Exception as error:
            print(f'TTS initialization failed: {type(error).__name__}: {error}', file=sys.stderr)
            emit({'type': 'error', 'id': None, 'error': {'code': 'initialization_failed', 'message': 'local TTS initialization failed; see stderr'}})
            return 1
        emit({'type': 'ready', 'voices': list(VOICES), 'sampleRate': 24000,
              'provider': 'CPUExecutionProvider', 'threads': 2, 'loadSeconds': round(time.perf_counter() - started, 4)})
        for line in input_records(sys.stdin.buffer):
            request_id = None
            try:
                if line is None:
                    raise InputError('input line exceeds 16384 bytes')
                value = json.loads(line.decode('utf-8'))
                if isinstance(value, dict) and isinstance(value.get('id'), str) and len(value['id']) <= 128:
                    request_id = value['id']
                request = validate_request(value)
                result = engine.synthesize(request)
            except (InputError, UnicodeError, json.JSONDecodeError, RecursionError) as error:
                result = {'id': request_id, 'error': {'code': 'invalid_request', 'message': str(error)}}
            except Exception as error:
                print(f'TTS synthesis failed: {type(error).__name__}: {error}', file=sys.stderr)
                result = {'id': request_id, 'error': {'code': 'synthesis_failed', 'message': 'local TTS synthesis failed; see stderr'}}
            emit(result)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
