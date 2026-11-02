/* Pure readout preparation. The caller must supply assistant body text only,
 * never reasoning, tool arguments, or raw conversation logs. This is a small
 * Markdown text adapter, not a Markdown parser or a reasoning detector.
 * All length limits count Unicode code points, not UTF-16 code units.
 */
const MAX_TEXT = 6000
const TARGET_CHUNK = 80
const MAX_CHUNK = 160

/** Clean body Markdown and bound the result to 6000 Unicode code points. */
function cleanReadoutText(body) {
  if (typeof body !== 'string') throw new TypeError('Readout body must be a string')
  const lines = []
  let fence = null
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      const close = /^ {0,3}(`+|~+)\s*$/.exec(line)
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
      continue
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open) { fence = { char: open[1][0], length: open[1].length }; continue }
    // Conservatively omit Markdown indented code (also omits indented prose).
    if (/^(?: {4}|\t)/.test(line)) continue
    // Reference definitions and Markdown-only separators are not spoken.
    if (/^\s*\[[^\]]+\]:\s*\S/.test(line)) continue
    if (/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) continue
    lines.push(line)
  }
  const text = lines.join('\n')
    .replace(/(`+)[\s\S]*?\1/g, '')
    .replace(/!\[[^\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '')
    .replace(/!\[[^\]\n]*\](?:\[[^\]\n]*\])?/g, '')
    .replace(/\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
    .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/g, '$1')
    .replace(/<(?:https?:\/\/|www\.)[^>\n]*>/gi, '')
    // Stop before Chinese punctuation so removing a URL preserves sentence ends.
    .replace(/(?:https?:\/\/|www\.)[^\s<>\u3000，。！？；：、（）【】「」『』“”‘’]+/gi, '')
    .replace(/<[^>\n]+>/g, '')
    .replace(/^\s*(?:>\s*)+/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-+*]|\d+[.)、])\s+/gm, '')
    .replace(/^\s*\[[ xX]\]\s*/gm, '')
    .replace(/\s+#+\s*$/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return Array.from(text).slice(0, MAX_TEXT).join('').trim()
}

/**
 * Split already-clean body text near 80 code points, never above 160 per chunk
 * or 6000 overall. Chinese sentence punctuation is retained. Newlines and
 * punctuation are preferred boundaries; unpunctuated text is cut at 160.
 */
function splitReadoutText(text) {
  if (typeof text !== 'string') throw new TypeError('Readout text must be a string')
  const chars = Array.from(text.trim()).slice(0, MAX_TEXT)
  const chunks = []
  let start = 0
  while (start < chars.length) {
    while (start < chars.length && /\s/u.test(chars[start])) start++
    if (start === chars.length) break
    const limit = Math.min(start + MAX_CHUNK, chars.length)
    let end = limit
    if (chars.length - start > TARGET_CHUNK) {
      let best = -1, distance = Infinity
      for (let i = start; i < limit; i++) {
        if (!/[。！？!?；;，,、：:\n]/u.test(chars[i])) continue
        let candidate = i + 1
        // Keep closing quotes with the sentence when the hard limit permits.
        while (candidate < limit && /[”’」』）】]/u.test(chars[candidate])) candidate++
        const delta = Math.abs(candidate - start - TARGET_CHUNK)
        if (delta < distance) { best = candidate; distance = delta }
      }
      if (best !== -1) end = best
    }
    const chunk = chars.slice(start, end).join('').trim()
    if (chunk) chunks.push(chunk)
    start = end
  }
  return chunks
}

/** Clean assistant body text and return bounded, speakable chunks. */
function prepareReadoutText(body) {
  return splitReadoutText(cleanReadoutText(body))
}

exports.cleanReadoutText = cleanReadoutText
exports.splitReadoutText = splitReadoutText
exports.prepareReadoutText = prepareReadoutText
