"""Offline English callback for Misaki Chinese v1.1.

Uses pronunciation data already bundled in misaki-fork, NOT misaki.en.G2P:
that class imports Torch/Transformers and can download spaCy/BART models.
Common words use US dictionary DEFAULT pronunciations (no POS disambiguation).
Uppercase abbreviations and unknown words are explicitly spelled letter by letter.
No English token is silently omitted. Only ASCII English is supported here.
"""
import importlib.resources
import json
import re


class OfflineEnglish:
    def __init__(self, dictionaries=None):
        if dictionaries is None:
            root = importlib.resources.files('misaki').joinpath('data')
            dictionaries = [json.loads(root.joinpath(name).read_text(encoding='utf-8'))
                            for name in ('us_gold.json', 'us_silver.json')]
        self.gold, self.silver = dictionaries
        self.events = []
        self.letters = {}
        for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            value = self.gold.get(letter)
            if not isinstance(value, str) or not value:
                raise ValueError('offline English letter dictionary is incomplete')
            self.letters[letter] = value

    def reset(self):
        self.events.clear()

    def spell(self, text):
        return ' '.join(self.letters[letter.upper()] for letter in text if letter.isalpha())

    def word(self, word):
        key = word.lower()
        # Preserve product/acronym pronunciations instead of treating IOS as a word.
        if key == 'ios':
            return self.spell('IOS'), 'product-spelling'
        if key == 'chatgpt':
            return self.word('chat')[0] + ' ' + self.spell('GPT'), 'product-word-and-spelling'
        if word.isupper() and len(word) > 1:
            return self.spell(word), 'acronym-spelling'
        value = self.gold.get(key, self.silver.get(key))
        if isinstance(value, dict):
            value = value.get('DEFAULT')
        if isinstance(value, str) and value:
            return value, 'dictionary'
        # Hyphens/apostrophes get a word boundary; every actual letter is spoken.
        return self.spell(word), 'unknown-letter-fallback'

    def __call__(self, text):
        result = []
        for token in re.findall(r"[A-Za-z]+(?:['-][A-Za-z]+)*|[^A-Za-z]+", text):
            if not re.search('[A-Za-z]', token):
                if token.strip():
                    raise ValueError('unexpected non-English callback content')
                continue
            phones, path = self.word(token)
            if not phones:
                raise ValueError('English callback produced no pronunciation')
            self.events.append({'path': path, 'letters': sum(char.isalpha() for char in token),
                                'phonemes': phones})
            result.append(phones)
        if not result:
            raise ValueError('English callback contains no letters')
        return ' '.join(result)


def split_phonemes(phones, limit=500):
    """Split at existing word/punctuation boundaries, never drop any phoneme.

    The 510 model input-token limit applies per inference, not per user request.
    A pathological single overlong phonetic word fails rather than truncating it.
    """
    pieces, current = [], ''
    for word in phones.split():
        if len(word) > limit:
            raise ValueError('single phonetic word exceeds model limit')
        candidate = (current + ' ' + word).strip()
        if len(candidate) > limit:
            pieces.append(current)
            current = word
        else:
            current = candidate
    if current:
        pieces.append(current)
    if not pieces:
        raise ValueError('empty phonetic transcription')
    return pieces
