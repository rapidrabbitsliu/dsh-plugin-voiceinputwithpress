import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// A small deterministic DOM model: it exercises the adapter, not browser/React integration.
function fixture({ empty = true } = {}) {
  let now = 0, next = 1
  const timers = new Map(), observers = new Set()
  const setTimeout = (fn, delay) => { const id = next++; timers.set(id, { fn, at: now + delay }); return id }
  const clearTimeout = id => timers.delete(id)
  function tick(ms) {
    const until = now + ms
    while (true) {
      const due = [...timers].filter(([, v]) => v.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      timers.delete(due[0]); now = due[1].at; due[1].fn()
    }
    now = until
  }
  class Target {
    constructor() { this.listeners = new Map() }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn) }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
    emit(type, values = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, ...values }) }
    count() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0) }
  }
  class Element extends Target {
    constructor(kind, parent = null) { super(); this.kind = kind; this.parent = parent; this.parentElement = parent; this.nodeType = 1; this.children = []; if (parent) parent.children.push(this); this.outerHTML = `<${kind}></${kind}>`; this.isConnected = true; this.textContent = ''; this.disabled = false }
    matches(selector) { return selector === '[data-composer-overlay]' && this.kind === 'overlay' }
    compareDocumentPosition(other) { return this.parent && this.parent === other.parent && this.parent.children.indexOf(this) < this.parent.children.indexOf(other) ? 4 : 2 }
    contains(other) { for (let p = other; p; p = p.parent) if (p === this) return true; return false }
    closest(selector) {
      for (let p = this; p; p = p.parent) {
        if (selector.startsWith('[data-composer-input]') && p.kind === 'input') return p
        if (selector === '[data-composer-card]' && p.kind === 'card') return p
        if (selector === '[data-conversation-session]' && p.kind === 'session') return p
      }
      return null
    }
    getAttribute(name) { if (name === 'aria-label') return this.label; if (name === 'data-voice-activity') return this.activity; if (name === 'data-conversation-session') return this.sessionId; return null }
    querySelector(selector) {
      if (selector === '[data-voice-activity]') return this.kind === 'card' ? row : null
      if (selector === '[data-input-scroll]') return this.kind === 'card' ? scroll : null
      if (selector === '[data-composer-placeholder]') return this.kind === 'card' && empty ? placeholder : null
      if (selector.startsWith('[data-composer-chip]')) return this.kind === 'input' && this.hasChip ? chip : null
      return null
    }
    querySelectorAll(selector) {
      if (selector !== 'button[aria-label]') return []
      if (this.kind === 'card') return [start, send, ...(row ? [cancel, ...(row.activity === 'recording' ? [stop] : [])] : [])]
      if (this.kind === 'row') return [cancel, ...(row.activity === 'recording' ? [stop] : [])]
      return []
    }
    click() { this.clicks = (this.clicks || 0) + 1; this.onClick?.() }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback }
    observe() { observers.add(this) }
    disconnect() { observers.delete(this) }
  }
  const doc = new Target(), win = new Target()
  doc.hidden = false; doc.defaultView = win; win.Element = Element; win.Node = { DOCUMENT_POSITION_FOLLOWING: 4 }; win.MutationObserver = MutationObserver
  const session = new Element('session'); session.sessionId = 'one'
  const card = new Element('card', session), overlay = new Element('overlay', card), scroll = new Element('scroll', card), input = new Element('input', scroll), placeholder = new Element('placeholder', scroll), chip = new Element('chip', input)
  const makeButton = label => { const b = new Element('button', card); b.label = label; return b }
  const start = makeButton('Start recording'), stop = makeButton('Stop and transcribe'), cancel = makeButton('Cancel'), send = makeButton('Send message')
  let row = null
  function mutate(target = card) { for (const observer of [...observers]) observer.callback([{ target }]) }
  function phase(value, message = '') { row = value === 'idle' ? null : new Element('row', card); if (row) { row.activity = value; row.textContent = message }; mutate() }
  start.onClick = () => phase('requesting')
  stop.onClick = () => phase('transcribing')
  cancel.onClick = () => phase('idle')
  const exports = {}
  vm.runInNewContext(readFileSync(new URL('../src/client.js', import.meta.url), 'utf8'), { exports, require: () => ({ createVisual: () => ({ update() {}, dispose() {} }) }), setTimeout, clearTimeout, Math })
  const dispose = exports.install(doc)
  const pointer = (type, changes = {}) => doc.emit(type, { target: input, isPrimary: true, pointerType: 'touch', button: 0, pointerId: 1, clientX: 100, clientY: 100, ...changes })
  const insert = text => { input.textContent = text; mutate(input) }
  return { doc, win, input, card, session, start, stop, cancel, send, pointer, phase, insert, tick, dispose, timers, observers }
}

function begin(f) { f.pointer('pointerdown'); f.tick(500) }
function complete(f, text = 'hello') { f.phase('recording'); f.pointer('pointerup'); f.insert(text); f.phase('idle'); f.tick(100) }

test('native touch magnifier is blocked, short tap restores editing focus', () => {
  const f = fixture(); let prevented = 0, focused = 0
  f.input.focus = () => focused++
  f.pointer('pointerdown')
  f.doc.emit('touchstart', {target:f.input,cancelable:true,preventDefault(){prevented++}})
  assert.equal(prevented,1)
  f.pointer('pointerup'); assert.equal(focused,1)
  assert.equal(f.start.clicks || 0,0); f.dispose()
})

test('any existing text leaves long press and touch defaults to the editor', () => {
  for (const text of ['draft', ' ', '\n']) {
    const f = fixture(); f.input.textContent = text; let prevented = 0
    f.pointer('pointerdown')
    f.doc.emit('touchstart', {target:f.input,cancelable:true,preventDefault(){prevented++}})
    f.tick(700)
    assert.equal(f.start.clicks || 0,0); assert.equal(prevented,0); f.dispose()
  }
})

test('short press and movement before hold never start recording', () => {
  const f = fixture(); f.pointer('pointerdown'); f.tick(499); f.pointer('pointerup'); f.tick(1000)
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 120 }); f.tick(1000)
  assert.equal(f.start.clicks || 0, 0); f.dispose()
})

test('release while permission is pending stops only after recording starts', () => {
  const f = fixture(); begin(f); f.pointer('pointerup'); assert.equal(f.stop.clicks || 0, 0)
  f.phase('recording'); assert.equal(f.stop.clicks, 1)
  f.insert('hello'); f.phase('idle'); f.tick(100); assert.equal(f.send.clicks, 1); f.dispose()
})

test('cancellation while permission is pending cannot later send', () => {
  const f = fixture(); begin(f); f.pointer('pointercancel'); assert.equal(f.cancel.clicks, 1)
  f.phase('recording'); f.insert('late'); f.phase('idle'); f.tick(1000)
  assert.equal(f.stop.clicks || 0, 0); assert.equal(f.send.clicks || 0, 0); f.dispose()
})

test('cancellation before the requesting row commits cancels when it appears', () => {
  const f = fixture(); f.start.onClick = () => {}; begin(f)
  f.pointer('pointercancel'); assert.equal(f.cancel.clicks || 0, 0)
  f.phase('requesting'); assert.equal(f.cancel.clicks, 1)
  f.phase('recording'); f.insert('late'); f.phase('idle'); f.tick(1000)
  assert.equal(f.send.clicks || 0, 0); f.dispose()
})

test('upward gesture, window blur and hidden document cancel', () => {
  for (const action of [f => f.pointer('pointermove', { clientY: 30 }), f => f.win.emit('blur'), f => { f.doc.hidden = true; f.doc.emit('visibilitychange') }]) {
    const f = fixture(); begin(f); f.phase('recording'); action(f)
    f.pointer('pointerup'); assert.equal(f.cancel.clicks, 1); f.phase('idle'); f.tick(1000)
    assert.equal(f.send.clicks || 0, 0); f.dispose()
  }
})

test('slide to cancel is armed until release, and sliding back allows sending', () => {
  const f = fixture(); begin(f); f.phase('recording')
  f.pointer('pointermove', { clientY: 20 }); assert.equal(f.cancel.clicks || 0, 0)
  f.pointer('pointermove', { clientY: 80 }); f.pointer('pointerup')
  f.insert('hello'); f.phase('idle'); f.tick(100)
  assert.equal(f.send.clicks, 1); f.dispose()
})

test('empty speech restores idle without retry controls; real errors stay visible', () => {
  const f = fixture(); begin(f); f.phase('recording'); f.pointer('pointerup')
  f.phase('feedback', '未识别到语音'); assert.equal(f.cancel.clicks, 1)
  assert.equal(f.send.clicks || 0, 0); f.dispose()
  const error = fixture(); begin(error); error.phase('feedback', '麦克风权限未开启')
  assert.equal(error.cancel.clicks || 0, 0); error.dispose()
})

test('only an untouched empty draft with a completed transcript is automatically sent', () => {
  const good = fixture(); begin(good); complete(good); assert.equal(good.send.clicks, 1); good.dispose()
  const existing = fixture({ empty: false }); existing.input.textContent = 'draft'; begin(existing); complete(existing, 'draft hello'); assert.equal(existing.send.clicks || 0, 0); existing.dispose()
  const edit = fixture(); begin(edit); edit.doc.emit('beforeinput', { target: edit.input }); complete(edit); assert.equal(edit.send.clicks || 0, 0); edit.dispose()
  const chip = fixture(); begin(chip); chip.input.hasChip = true; complete(chip); assert.equal(chip.send.clicks || 0, 0); chip.dispose()
})

test('feedback, changed session, and changed final draft prevent sending', () => {
  const feedback = fixture(); begin(feedback); feedback.phase('feedback'); feedback.phase('idle'); feedback.tick(200); assert.equal(feedback.send.clicks || 0, 0); feedback.dispose()
  const session = fixture(); begin(session); session.phase('recording'); session.pointer('pointerup'); session.insert('hello'); session.session.sessionId = 'two'; session.phase('idle'); session.tick(200); assert.equal(session.send.clicks || 0, 0); session.dispose()
  const changed = fixture(); begin(changed); changed.phase('recording'); changed.pointer('pointerup'); changed.insert('hello'); changed.phase('idle'); changed.input.textContent = 'changed'; changed.tick(200); assert.equal(changed.send.clicks || 0, 0); changed.dispose()
})

test('disposing before hold removes the pending timer and prevents a late start', () => {
  const f = fixture(); f.pointer('pointerdown'); f.dispose(); f.tick(1000)
  assert.equal(f.start.clicks || 0, 0); assert.equal(f.timers.size, 0); assert.equal(f.doc.count(), 0)
})

test('dispose cancels active recording and removes listeners, timers and observer', () => {
  const f = fixture(); begin(f); f.dispose()
  assert.equal(f.cancel.clicks, 1); assert.equal(f.doc.count(), 0); assert.equal(f.win.count(), 0)
  assert.equal(f.timers.size, 0); assert.equal(f.observers.size, 0)
  f.pointer('pointerdown'); f.tick(200000); assert.equal(f.start.clicks, 1); assert.equal(f.send.clicks || 0, 0)
})
