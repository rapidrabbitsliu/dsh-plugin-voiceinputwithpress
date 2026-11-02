import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

function fixture() {
  const observers = new Set(), pending = []
  let prepends = 0
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.parentElement = null }
    get firstChild() { return this.children[0] || null }
    get textContent() { throw Error('must never read DOM text') }
    set textContent(value) { this.styleSource = value }
    setAttribute(name, value) { this.attributes.set(name, value); pending.push({ type: 'attributes', target: this, attributeName: name }) }
    getAttribute(name) { return this.attributes.get(name) ?? null }
    contains(node) { for (let at = node; at; at = at.parentElement) if (at === this) return true; return false }
    matches(selector) { return selector.split(',').some(part => this.attributes.has(part.trim().slice(1, -1))) }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]) }
    closest(selector) { for (let at = this; at; at = at.parentElement) if (at.matches(selector)) return at; return null }
    appendChild(node) { node.remove(); node.parentElement = this; this.children.push(node); pending.push({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] }); return node }
    prepend(node) { prepends++; node.remove(); node.parentElement = this; this.children.unshift(node); pending.push({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] }) }
    remove() { const parent = this.parentElement; if (!parent) return; parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null; pending.push({ type: 'childList', target: parent, addedNodes: [], removedNodes: [this] }) }
    addEventListener(type, listener) { this.listeners.set(type, listener) }
    removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type) }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback }
    observe(target, options) { this.options = options; observers.add(this) }
    disconnect() { observers.delete(this) }
  }
  const doc = new Element('document')
  doc.createElement = tag => new Element(tag)
  doc.createElementNS = (ns, tag) => new Element(tag)
  doc.defaultView = { MutationObserver }
  doc.documentElement = doc.appendChild(new Element('html'))
  doc.head = doc.documentElement.appendChild(new Element('head'))
  doc.body = doc.documentElement.appendChild(new Element('body'))
  const session = id => { const element = new Element('section'); element.setAttribute('data-conversation-session', id); doc.body.appendChild(element); return element }
  const seat = (parent, key) => { const element = new Element('article'); element.setAttribute('data-chat-node-key', key); parent.appendChild(element); return element }
  const flush = () => { let loops = 0; while (pending.length) { assert.ok(++loops < 10, 'observer should not loop'); const records = pending.splice(0); for (const observer of observers) observer.callback(records.filter(r => r.type !== 'attributes' || observer.options.attributeFilter.includes(r.attributeName))) } }
  const exports = {}
  vm.runInNewContext(readFileSync(new URL('../src/readout-indicator.js', import.meta.url), 'utf8'), { exports })
  let stopped = 0
  const played = []
  const indicator = exports.installReadoutIndicator(doc, () => stopped++, identity => played.push(identity))
  flush()
  return { doc, session, seat, flush, indicator, observers, played, get stopped() { return stopped }, get prepends() { return prepends }, buttons: () => doc.querySelectorAll('[data-voice-readout-indicator]') }
}

test('only exact session/key, key priority and tail fallback; no DOM text read', () => {
  const f = fixture(), other = f.session('other'), correct = f.session('a"[]')
  f.seat(other, 'final'); const tail = f.seat(correct, 'tail')
  assert.equal(f.buttons().length, 0)
  const identity = { sessionId: 'a"[]', nodeKeys: ['final', 'tail'] }
  f.indicator.setAvailable([identity]); f.flush()
  assert.equal(f.buttons()[0].getAttribute('data-voice-state'), 'idle')
  assert.equal(f.buttons()[0].parentElement.parentElement, tail)
  const final = f.seat(correct, 'final'); f.flush()
  assert.equal(f.buttons()[0].parentElement.parentElement, final)
  assert.equal(final.firstChild.getAttribute('data-voice-readout-indicator-wrapper'), '')
  identity.nodeKeys.splice(0); f.indicator.setAvailable([{ sessionId: 'a"[]', nodeKeys: ['final', 'tail'] }]); f.flush()
  assert.equal(f.buttons().length, 1)
  const count = f.prepends
  f.seat(other, 'irrelevant'); f.flush()
  assert.equal(f.prepends, count)
  f.indicator.dispose()
})

test('renderer replacement and identity attribute changes remount without duplication or loop', () => {
  const f = fixture(), session = f.session('one'), old = f.seat(session, 'final')
  f.indicator.setAvailable([{ sessionId: 'one', nodeKeys: ['final'] }]); f.flush()
  const initial = f.prepends; f.flush(); assert.equal(f.prepends, initial)
  old.remove(); const replacement = f.seat(session, 'final'); f.flush()
  assert.equal(f.buttons().length, 1)
  assert.equal(f.buttons()[0].parentElement.parentElement, replacement)
  replacement.firstChild.remove(); f.flush()
  assert.equal(f.buttons().length, 1)
  replacement.setAttribute('data-chat-node-key', 'changed'); f.flush()
  assert.equal(f.buttons().length, 0)
  replacement.setAttribute('data-chat-node-key', 'final'); f.flush()
  assert.equal(f.buttons().length, 1)
  session.setAttribute('data-conversation-session', 'other'); f.flush()
  assert.equal(f.buttons().length, 0)
  f.indicator.dispose()
})

test('persistent idle/pending/playing clicks delegate and parent resets state without removing controls', () => {
  const f = fixture(), session = f.session('one'); f.seat(session, 'final')
  const identity = { sessionId: 'one', nodeKeys: ['final'], turn: 12 }
  f.indicator.setAvailable([identity]); f.flush()
  const button = f.buttons()[0], calls = []
  const click = () => button.listeners.get('click')({ preventDefault() { calls.push('prevent') }, stopPropagation() { calls.push('stop') } })
  assert.equal(button.getAttribute('aria-label'), '朗读此回复')
  click(); assert.equal(f.played.length, 1); assert.equal(f.played[0].turn, 12)
  f.played[0].nodeKeys.push('mutated')
  f.indicator.setPending({ sessionId: 'one', nodeKeys: ['final'] }); f.flush()
  assert.equal(button.getAttribute('data-voice-state'), 'pending')
  assert.equal(button.getAttribute('aria-label'), '正在合成此回复')
  assert.equal(button.disabled, true)
  assert.equal(button.parentElement.querySelectorAll('[data-voice-readout-status]')[0].styleSource, '正在合成…')
  assert.equal(button.getAttribute('aria-busy'), 'true')
  click(); assert.equal(f.stopped, 0)
  assert.equal(button.getAttribute('data-voice-state'), 'pending') // parent owns reset
  f.indicator.set(null); f.flush()
  assert.equal(button.getAttribute('data-voice-state'), 'idle')
  f.indicator.set({ sessionId: 'one', nodeKeys: ['final'] }); f.flush()
  assert.equal(button.getAttribute('aria-label'), '停止朗读此回复')
  assert.equal(button.getAttribute('aria-busy'), 'false')
  assert.equal(button.getAttribute('title'), '正在朗读，点击停止')
  assert.equal(button.disabled, false)
  assert.equal(button.parentElement.querySelectorAll('[data-voice-readout-status]')[0].styleSource, '正在朗读…')
  click(); assert.equal(f.stopped, 1)
  assert.deepEqual(calls, ['prevent', 'stop', 'prevent', 'stop', 'prevent', 'stop'])
  f.indicator.set(null); f.flush(); assert.equal(f.buttons().length, 1)
  assert.equal(button.getAttribute('data-voice-state'), 'idle')
  f.indicator.setStatus(identity, '模型合成失败'); f.flush()
  assert.equal(button.parentElement.querySelectorAll('[data-voice-readout-status]')[0].styleSource, '模型合成失败')
  assert.equal(button.disabled, false)
  f.indicator.dispose(); f.indicator.dispose(); f.flush()
  assert.equal(f.buttons().length, 0); assert.equal(f.observers.size, 0)
  assert.equal(f.doc.querySelectorAll('[data-voice-readout-indicator-style]').length, 0)
  assert.equal(button.listeners.size, 0)
  f.indicator.setAvailable([identity]); f.indicator.set(identity); f.flush()
  assert.equal(f.buttons().length, 0)
})

test('available snapshots deduplicate and remove stale controls, only one plays across sessions', () => {
  const f = fixture(), one = f.session('one'), other = f.session('other')
  f.seat(one, 'same'); f.seat(one, 'second'); f.seat(other, 'same')
  const a = { sessionId: 'one', nodeKeys: ['same', 'tail'], turn: 1 }
  const b = { sessionId: 'one', nodeKeys: ['second'], turn: 2 }
  const c = { sessionId: 'other', nodeKeys: ['same'], turn: 1 }
  f.indicator.setAvailable([a, b, c, { sessionId: 'one', nodeKeys: ['tail'] }, null]); f.flush()
  assert.equal(f.buttons().length, 3)
  f.indicator.set({ sessionId: 'one', nodeKeys: ['tail'] }); f.flush()
  assert.deepEqual(f.buttons().map(button => button.getAttribute('data-voice-state')), ['playing', 'idle', 'idle'])
  f.indicator.set(c); f.flush()
  assert.deepEqual(f.buttons().map(button => button.getAttribute('data-voice-state')), ['idle', 'idle', 'playing'])
  f.indicator.setPending(b); f.flush()
  assert.deepEqual(f.buttons().map(button => button.getAttribute('data-voice-state')), ['idle', 'pending', 'idle'])
  const retained = f.buttons()[0], removed = f.buttons()[1]
  f.indicator.setAvailable([{ ...a, turn: 99 }]); f.flush()
  assert.equal(f.buttons().length, 1); assert.equal(f.buttons()[0], retained)
  assert.equal(removed.listeners.size, 0)
  f.indicator.set(null); f.indicator.setAvailable([]); f.flush()
  assert.equal(f.buttons().length, 0)
  f.indicator.dispose()
})

test('speaker has two waves animated only while playing and reduced-motion disables animation', () => {
  const f = fixture(), session = f.session('one'); f.seat(session, 'final')
  f.indicator.setAvailable([{ sessionId: 'one', nodeKeys: ['final'] }]); f.flush()
  const waves = f.buttons()[0].querySelectorAll('[data-voice-wave]')
  assert.equal(waves.length, 2)
  assert.deepEqual(waves.map(w => w.getAttribute('data-voice-wave')), ['1', '2'])
  const css = f.doc.querySelectorAll('[data-voice-readout-indicator-style]')[0].styleSource
  assert.match(css, /\[data-voice-state="playing"\] \[data-voice-wave\] \{ animation:/)
  assert.doesNotMatch(css, /\[data-voice-readout-indicator\] \[data-voice-wave\] \{[^}]*animation:/)
  assert.match(css, /@keyframes voice-readout-indicator-wave/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation:none/)
  f.indicator.dispose()
})
