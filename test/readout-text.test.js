import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const exports = {}
vm.runInNewContext(readFileSync(new URL('../src/readout-text.js', import.meta.url), 'utf8'), { exports })
const { cleanReadoutText: clean, splitReadoutText: split, prepareReadoutText: prepare } = exports
const chunks = text => Array.from(split(text))
const length = text => Array.from(text).length

test('removes fenced code, including unmatched fences and longer closing fences', () => {
  assert.equal(clean('正文。\n```js\nsecret()\n```\n继续。'), '正文。\n继续。')
  assert.equal(clean('正文\n~~~python\nsecret\n~~~~\n结尾'), '正文\n结尾')
  assert.equal(clean('正文\n````\n```\nstill hidden'), '正文')
})

test('omits inline and indented code conservatively', () => {
  assert.equal(clean('请看`secret()`后继续。\n    hidden()\n\talsoHidden()\n正文'), '请看后继续。\n正文')
  assert.equal(clean('开始``含`符号``结束。'), '开始结束。')
})

test('retains link labels, omits images and URLs, and preserves Chinese punctuation', () => {
  assert.equal(clean('[文档](https://example.com/a_(b))。![图](image.png)请访问https://example.com/path，完成！'), '文档。请访问，完成！')
  assert.equal(clean('[标签][ref]\n[ref]: https://example.com\n![图][image]\nwww.example.com'), '标签')
  assert.equal(clean('图片![图](https://example.com/a_(b))结束。<https://example.com>下一句。'), '图片结束。下一句。')
})

test('cleans headings, quotes, tasks, lists and table separators', () => {
  assert.equal(clean('# 标题\n> 引用\n- [x] 完成\n1. 下一项\n| 名称 | 结果 |\n| :--- | ---: |\n| 项目 | 成功 |\n---'), '标题\n引用\n完成\n下一项\n名称 结果\n项目 成功')
})

test('does not pretend to detect reasoning in supplied text', () => {
  assert.equal(clean('这段正文提及 reasoning，也保留 analysis 字样。'), '这段正文提及 reasoning，也保留 analysis 字样。')
})

test('preserves Chinese punctuation and prefers a boundary near 80 characters', () => {
  const first = '甲'.repeat(79) + '。'
  assert.deepEqual(chunks(first + '乙'.repeat(79) + '！'), [first, '乙'.repeat(79) + '！'])
  assert.deepEqual(chunks('短句。你好！'), ['短句。你好！'])
  const quoted = '甲'.repeat(78) + '。”'
  assert.equal(chunks(quoted + '乙'.repeat(90))[0], quoted)
})

test('hard splits unpunctuated text at 160 and never splits surrogate pairs', () => {
  const result = chunks('😀'.repeat(321))
  assert.deepEqual(result.map(length), [160, 160, 1])
  assert.equal(result.join(''), '😀'.repeat(321))
})

test('enforces overall 6000-character cap and per-chunk limit', () => {
  const body = '中'.repeat(7000)
  assert.equal(length(clean(body)), 6000)
  const result = Array.from(prepare(body))
  assert.equal(length(result.join('')), 6000)
  assert.ok(result.every(text => length(text) <= 160 && text.trim()))
  assert.equal(length(chunks('😀'.repeat(7000)).join('')), 6000)
})

test('handles blank input and rejects non-string input', () => {
  assert.equal(clean(' \r\n\t '), '')
  assert.deepEqual(chunks(' '), [])
  assert.deepEqual(Array.from(prepare('```\ncode\n```')), [])
  assert.throws(() => clean(null), /must be a string/)
  assert.throws(() => split({}), /must be a string/)
})

test('splitting preserves non-whitespace content across varied boundary positions', () => {
  for (let position = 1; position <= 180; position++) {
    const text = '甲'.repeat(position) + '，' + '乙'.repeat(190) + '。'
    const result = chunks(text)
    assert.equal(result.join(''), text)
    assert.ok(result.every(part => length(part) <= 160))
  }
})
