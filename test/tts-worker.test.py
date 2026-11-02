"""Validation tests: importing worker must not import inference dependencies."""
import importlib.util
import io
from pathlib import Path
import sys
import unittest

spec = importlib.util.spec_from_file_location('tts_worker', Path(__file__).resolve().parents[1] / 'scripts' / 'tts-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ValidationTests(unittest.TestCase):
    def test_import_is_lightweight(self):
        self.assertNotIn('onnxruntime', sys.modules)
        self.assertNotIn('misaki', sys.modules)

    def test_defaults_and_boundaries(self):
        self.assertEqual(worker.validate_request({'id': '1', 'text': '你好'})['voice'], 'zf_001')
        for voice in worker.VOICES:
            for speed in (0.7, 1.5):
                self.assertEqual(worker.validate_request({'id': '1', 'text': '中' * 160, 'voice': voice, 'speed': speed})['speed'], speed)

    def test_rejections(self):
        for change in ({'text': ''}, {'text': '中' * 161}, {'text': '\ud800'}, {'text': '\x00'},
                       {'speed': True}, {'speed': float('nan')}, {'speed': 0.69}, {'speed': 1.51},
                       {'voice': '../model'}, {'voice': []}, {'id': None}, {'url': 'http://invalid'}):
            with self.subTest(change=change), self.assertRaises(worker.InputError):
                worker.validate_request({'id': '1', 'text': '你好', **change})
        self.assertEqual(worker.validate_request({'id': '1', 'text': '中文API iOS Safari'})['text'], '中文API iOS Safari')
        with self.assertRaises(worker.InputError):
            worker.validate_request([])

    def test_oversized_line_drains_then_recovers(self):
        stream = io.BytesIO(b'x' * (worker.MAX_LINE_BYTES * 3) + b'\n{}\n')
        self.assertEqual(list(worker.input_records(stream)), [None, b'{}\n'])


class EnglishFrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / 'scripts' / 'tts_english.py'
        spec = importlib.util.spec_from_file_location('tts_english_test', path)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def frontend(self):
        letters = {letter: 'letter' + letter for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}
        return self.module.OfflineEnglish([{**letters, 'hello': 'həlˈO', 'chat': 'ʧˈæt',
                                           'safari': 'səfˈɑɹi', 'read': {'DEFAULT': 'ɹˈid'}}, {}])

    def test_common_words_products_acronyms_and_unknown_never_disappear(self):
        front = self.frontend()
        for text, path in [('hello Safari', 'dictionary'), ('iOS', 'product-spelling'),
                           ('HTTP API', 'acronym-spelling'), ('ChatGPT', 'product-word-and-spelling'),
                           ('qzunknown', 'unknown-letter-fallback'), ('read', 'dictionary')]:
            front.reset()
            phones = front(text)
            self.assertTrue(phones)
            self.assertIn(path, [event['path'] for event in front.events])
            self.assertEqual(sum(event['letters'] for event in front.events), sum(char.isalpha() for char in text))
        self.assertIn('letterG letterP letterT', front('ChatGPT'))

    def test_segmentation_preserves_all_phonemes_and_model_boundaries(self):
        phones = ' '.join(['abcdef'] * 150)
        chunks = self.module.split_phonemes(phones)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) <= 500 for chunk in chunks))
        self.assertEqual(' '.join(chunks), phones)
        with self.assertRaises(ValueError):
            self.module.split_phonemes('x' * 501)
        with self.assertRaises(ValueError):
            self.module.split_phonemes(' ')


if __name__ == '__main__':
    unittest.main()
