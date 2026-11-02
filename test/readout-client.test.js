import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/readout-client.js', import.meta.url), 'utf8')
const textExports = {}
vm.runInNewContext(readFileSync(new URL('../src/readout-text.js', import.meta.url), 'utf8'), { exports: textExports })
const api = {}
let latestIndicator
vm.runInNewContext(source, { exports: api, require: name => name === './readout-text.js' ? textExports : { installReadoutIndicator: (doc, onStop, onPlay) => (latestIndicator = { onStop, onPlay, available: [], set() {}, setStatus() {}, setPending() {}, setAvailable(value) { this.available = value }, dispose() {} }) }, Promise, Set })
const event = (type, turn = 1, reason = 'completed') => ({ event: { type, data: { turn, reason: { kind: reason } } } })
const delta = (revision, entries, kind = 'append') => ({ revision, change: { kind, entries } })
function chat({ reason = 'completed', status = 'settled', id = 'message', tail = true, text = '正文' } = {}) {
  const data = { turn: 1, closing: { status, finalNode: { messageId: id }, blocks: [{ kind: 'reasoning', text: '私密推理' }, { kind: 'tool-call', argsRaw: '私密工具' }, { kind: 'text', text }] } }
  return { timeline: { turnOrder: [1], turns: new Map([[1, { status: 'closed', end: { data: { reason: { kind: reason } } } }]]) }, locations: { getTurn: () => ['tail'] }, nodes: { get: () => tail ? { kind: 'turn-tail', data } : undefined } }
}

test('built lazy CommonJS factory resolves only platform React at apply', () => {
  let registered
  const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load: value => { registered = value } } } })
  const module = registered.factory(request => { throw new Error(`unexpected factory-time require: ${request}`) })
  assert.equal(registered.id, 'dsh-plugin-voiceinputwithpress')
  assert.deepEqual([...module.inject], ['slots', 'sessions', 'uiConversation', 'connection'])
  assert.equal(typeof module.apply, 'function')
  assert.doesNotMatch(bundle, /require\(['"]\.\/readout-(?:client|text)\.js['"]\)/)
})

test('only settled normal Turn closing body is spoken, not reasoning/tools', () => {
  assert.equal(api.closingText(chat(), 1), '正文')
  for (const reason of ['aborted', 'error', 'max-tokens', 'interrupted', 'blocked', 'forked', 'disposed']) assert.equal(api.closingText(chat({ reason }), 1), '')
  assert.equal(api.closingText(chat({ status: 'interrupted' }), 1), '')
  assert.equal(api.closingText(chat({ id: null }), 1), '')
  assert.equal(api.closingText(chat({ tail: false }), 1), '')
})
test('click identity matches only current session latest completed reply, not old turns or other controls', () => {
  const snapshot = chat()
  const click = (sessionId = 'one', key = 'tail') => ({ closest: selector => selector === '[data-chat-node-key]' ? {
    getAttribute: () => key, closest: () => ({ getAttribute: () => sessionId }),
  } : null })
  assert.equal(api.isLatestReplyClick(click(), 'one', snapshot), true)
  assert.equal(api.isLatestReplyClick(click('two'), 'one', snapshot), false)
  assert.equal(api.isLatestReplyClick(click('one', 'old'), 'one', snapshot), false)
  assert.equal(api.isLatestReplyClick({ closest: () => null }, 'one', snapshot), false)
  assert.equal(api.isLatestReplyClick(click(), 'one', chat({ reason: 'aborted' })), false)
  assert.equal(api.isLatestReplyClick(click(), 'one', chat({ tail: false })), false)
  assert.equal(api.isLatestReplyClick(null, 'one', snapshot), false)
  const tail = snapshot.nodes.get('tail')
  snapshot.locations.getTurn = () => ['earlier-step', 'final-step', 'tail']
  snapshot.nodes.get = key => key === 'tail' ? tail : { kind: 'assistant-step', data: { turn: 1, finalNode: { messageId: key === 'final-step' ? 'message' : 'earlier' } } }
  assert.equal(api.isLatestReplyClick(click('one', 'final-step'), 'one', snapshot), true)
  assert.equal(api.isLatestReplyClick(click('one', 'earlier-step'), 'one', snapshot), false)
  assert.equal(api.isLatestReplyClick(click('one', 'tail'), 'one', snapshot), true)
})

test('gate requires fresh live start plus completed end; history/prepend never qualify', () => {
  const g = api.createCompletionGate()
  g.observe(delta(1, [event('turn/start'), event('turn/end')], 'replace'), true)
  assert.equal(g.take(chat()).length, 0)
  g.observe(delta(2, [event('turn/end')]), true)
  assert.equal(g.take(chat()).length, 0)
  g.observe(delta(3, [event('turn/start')], 'prepend'), true)
  g.observe(delta(4, [event('turn/end')]), true)
  assert.equal(g.take(chat()).length, 0)
  g.observe(delta(5, [event('turn/start'), event('turn/end')]), true)
  assert.deepEqual([...g.take(chat())], ['正文'])
  assert.equal(g.take(chat()).length, 0)
  g.observe(delta(5, [event('turn/start'), event('turn/end')]), true)
  assert.equal(g.take(chat()).length, 0)
})
test('reset/reconnect/HMR, background tab and abnormal completion suppress playback', () => {
  for (const mode of ['reset', 'replace', 'background', 'error']) {
    const g = api.createCompletionGate()
    g.observe(delta(1, [event('turn/start')]), true)
    if (mode === 'reset') g.reset()
    if (mode === 'replace') g.observe(delta(2, [], 'replace'), true)
    g.observe(delta(3, [event('turn/end', 1, mode === 'error' ? 'error' : 'completed')]), mode !== 'background')
    assert.equal(g.take(chat()).length, 0)
  }
  const g = api.createCompletionGate() // new HMR instance has no old-start evidence
  g.observe(delta(100, [event('turn/end')]), true)
  assert.equal(g.take(chat()).length, 0)
})
test('gate waits for timeline end, but missing closing tail is conservatively skipped', () => {
  const g = api.createCompletionGate()
  g.observe(delta(1, [event('turn/start'), event('turn/end')]), true)
  assert.equal(g.take({ timeline: { turns: new Map() } }).length, 0)
  assert.deepEqual([...g.take(chat())], ['正文'])
  g.observe(delta(2, [event('turn/start'), event('turn/end')]), true)
  assert.equal(g.take(chat({ tail: false })).length, 0)
  assert.equal(g.take(chat()).length, 0)
})
test('storage corrupt/unavailable safely defaults; values are clamped', () => {
  for (const storage of [undefined, { getItem() { throw Error('blocked') } }, { getItem: () => '{bad' }]) {
    assert.equal(api.readPreferences(storage).auto, false)
    assert.equal(api.readPreferences(storage).voice, 'zf_001')
    assert.equal(api.readPreferences(storage).pressEnabled, true)
    assert.equal(api.readPreferences(storage).holdMs, 500)
  }
  const prefs = api.readPreferences({ getItem: () => '{"auto":true,"voice":"arbitrary","speed":99}' })
  assert.equal(prefs.voice, 'zf_001'); assert.equal(prefs.speed, 1.5); assert.equal(prefs.auto, true)
  assert.equal(prefs.holdMs, 500); assert.equal(prefs.pressEnabled, true)
  assert.equal(api.readPreferences({ getItem: () => '{"pressEnabled":false,"holdMs":99}' }).holdMs, 300)
  assert.equal(api.readPreferences({ getItem: () => '{"pressEnabled":false,"holdMs":9000}' }).holdMs, 1500)
  assert.equal(api.readPreferences({ getItem: () => '{"pressEnabled":false,"holdMs":500}' }).pressEnabled, false)
})

const turn = () => new Promise(resolve => setImmediate(resolve))
function playback() {
  const requests = [], audios = [], revoked = [], statuses = [], identities = []
  let active = true, number = 0
  class Audio {
    constructor(url) { this.url = url; audios.push(this) }
    play() { return env.rejectPlayback ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve() }
    pause() { this.paused = true }
    removeAttribute() {}
    load() {}
  }
  const diagnostics = api.createDiagnostics(() => 'test-time')
  const env = { onPlayback: identity => identities.push(identity), diagnostics, Audio, AbortController, active: () => active, URL: { createObjectURL: () => `blob:${++number}`, revokeObjectURL: url => revoked.push(url) }, fetch(url, init) { return new Promise((resolve, reject) => { requests.push({ url, init, resolve, reject }) }) } }
  const queue = api.createAudioQueue(env, status => statuses.push(status))
  const resolve = (index, { status = 200, type = 'audio/wav', size = 20 } = {}) => requests[index].resolve({ ok: status === 200, status, headers: { get: () => type }, blob: async () => ({ size }) })
  return { queue, requests, audios, revoked, statuses, identities, diagnostics, resolve, blockPlayback() { env.rejectPlayback = true }, inactive() { active = false } }
}
test('reply identity prefers the actual final assistant body and never a different message', () => {
  const snapshot = chat(), tail = snapshot.nodes.get('tail')
  snapshot.locations.getTurn = () => ['wrong', 'body', 'tail']
  snapshot.nodes.get = key => key === 'tail' ? tail : { kind: 'assistant-step', data: { finalNode: { messageId: key === 'body' ? 'message' : 'other' } } }
  const identity = api.replyIdentity(snapshot, 'one')
  assert.equal(identity.sessionId, 'one')
  assert.deepEqual([...identity.nodeKeys], ['body', 'tail'])
  assert.equal(api.replyIdentity(chat({ reason: 'aborted' }), 'one'), null)
})

test('playing badge identity exists only during actual audio, clears on end, stop and failure', async () => {
  const identity = { sessionId: 'one', nodeKeys: ['body'] }
  const p = playback(), running = p.queue.play('正文', { voice: 'zf_001', speed: 1 }, identity)
  assert.equal(p.identities.at(-1), null)
  p.resolve(0); await turn()
  assert.equal(p.identities.at(-1), identity)
  p.audios[0].onended(); await running
  assert.equal(p.identities.at(-1), null)
  const second = p.queue.play('正文', { voice: 'zf_001', speed: 1 }, identity)
  p.resolve(1); await turn(); p.queue.stop(); await second
  assert.equal(p.identities.at(-1), null)
  const failed = playback(); failed.blockPlayback()
  const failure = failed.queue.play('正文', { voice: 'zf_001', speed: 1 }, identity)
  failed.resolve(0); await failure
  assert.equal(failed.identities.includes(identity), false)
})

test('fetch is authenticated, bounded to one ahead and chunks <=160; URL is revoked', async () => {
  const p = playback()
  const running = p.queue.play('字'.repeat(500), { voice: 'zf_001', speed: 1 })
  assert.equal(p.requests.length, 1)
  assert.equal(p.requests[0].url, '/api/voiceinputwithpress.tts')
  assert.equal(p.requests[0].init.credentials, 'same-origin')
  assert.equal(p.requests[0].init.redirect, 'error')
  assert.equal(Array.from(JSON.parse(p.requests[0].init.body).text).length, 160)
  p.resolve(0); await turn()
  assert.equal(p.audios.length, 1); assert.equal(p.requests.length, 2)
  p.resolve(1); await turn()
  assert.equal(p.requests.length, 2) // never two ahead
  p.audios[0].onended(); await turn()
  assert.equal(p.audios.length, 1); assert.equal(p.requests.length, 3) // reuse authorized element
  assert.deepEqual(p.revoked, ['blob:1'])
  p.queue.stop(); await running
  assert.equal(p.audios[0].paused, true)
  assert.equal(p.requests[2].init.signal.aborted, true)
  p.resolve(2); await turn()
  assert.equal(p.audios.length, 1)
})
test('diagnostics are bounded and omit supplied text, audio, secrets and unknown fields', () => {
  const log = api.createDiagnostics(() => 'test')
  for (let i = 0; i < 220; i++) log.log('synthesis.request', { chunk: i, characters: 10, text: 'private secret', audioBase64: 'secret', token: 'secret', requestId: 'req-123' })
  const records = log.snapshot()
  assert.equal(records.length, 200)
  assert.equal(records[0].chunk, 20)
  assert.doesNotMatch(JSON.stringify(records), /private|secret|audioBase64|token/)
})
test('HTTP errors show safe code and request id and write correlation diagnostics', async () => {
  const p = playback(), running = p.queue.play('隐私测试Safari', { voice: 'zf_001', speed: 1 })
  p.requests[0].resolve({ ok: false, status: 400, headers: { get: key => key === 'x-tts-request-id' ? 'req-123' : null }, text: async () => JSON.stringify({ error: { code: 'text_too_long', message: 'private server detail' } }) })
  await running
  assert.match(p.statuses.at(-1), /400.*长度.*text_too_long.*req-123/)
  const log = p.diagnostics.snapshot()
  assert.ok(log.some(row => row.event === 'synthesis.error' && row.requestId === 'req-123' && row.code === 'text_too_long'))
  assert.doesNotMatch(JSON.stringify(log), /隐私|Safari|private/)
})

test('gesture unlock synchronously creates one player reused across delayed automatic replies', async () => {
  const p = playback()
  p.queue.unlock()
  assert.equal(p.audios.length, 1)
  assert.match(p.audios[0].src, /^data:audio\/wav/)
  await turn()
  for (let index = 0; index < 2; index++) {
    const running = p.queue.play('你好', { voice: 'zf_001', speed: 1 })
    p.resolve(index); await turn()
    assert.equal(p.audios.length, 1)
    assert.match(p.audios[0].src, /^blob:/)
    p.audios[0].onended(); await running
  }
})

test('stop during fetch or prefetch never plays a late result', async () => {
  for (const prefetch of [false, true]) {
    const p = playback()
    const running = p.queue.play('字'.repeat(400), { voice: 'zm_010', speed: 1.2 })
    if (prefetch) { p.resolve(0); await turn() }
    p.queue.stop()
    p.resolve(prefetch ? 1 : 0)
    await running; await turn()
    assert.equal(p.audios.length, prefetch ? 1 : 0)
    assert.equal(p.requests.at(-1).init.signal.aborted, true)
    assert.equal(p.revoked.length, prefetch ? 1 : 0)
  }
})
test('HTTP, MIME, oversized, autoplay errors become visible; no queue advance', async () => {
  for (const value of [{ status: 401 }, { type: 'text/html' }, { size: 0 }, { size: 17 * 1024 * 1024 }]) {
    const p = playback(); const running = p.queue.play('你好', { voice: 'zf_002', speed: .7 })
    p.resolve(0, value); await running
    assert.match(p.statuses.at(-1), /401|WAV|大小/)
    assert.equal(p.audios.length, 0)
  }
  const p = playback()
  const running = p.queue.play('你好', { voice: 'zf_001', speed: 1 })
  p.resolve(0); await turn(); p.audios[0].onerror(); await running
  assert.match(p.statuses.at(-1), /无法播放/)
  assert.deepEqual(p.revoked, ['blob:1'])
  const blocked = playback(); blocked.blockPlayback()
  const denied = blocked.queue.play('你好', { voice: 'zf_001', speed: 1 })
  blocked.resolve(0); await denied
  assert.match(blocked.statuses.at(-1), /播放失败/)
  assert.deepEqual(blocked.revoked, ['blob:1'])
})
test('NotAllowedError keeps WAV and retries synchronously without synthesis; stop clears retry', async () => {
  const p = playback(), identity = { sessionId: 'one', nodeKeys: ['body'] }
  const running = p.queue.play('你好', { voice: 'zf_001', speed: 1 }, identity)
  p.resolve(0); await turn()
  let calls = 0
  p.audios[0].play = () => { calls++; return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })) }
  // Simulate a fresh browser denial using this player's persistent play hook.
  p.queue.stop(); await running
  const denied = p.queue.play('你好', { voice: 'zf_001', speed: 1 }, identity)
  p.resolve(1); await turn()
  assert.match(p.statuses.at(-1), /点击这条回复的喇叭/)
  assert.equal(p.revoked.length, 1) // only prior audio; denied WAV retained
  assert.equal(p.queue.retry({ sessionId: 'other', nodeKeys: ['body'] }), false)
  p.audios[0].play = () => { calls++; return Promise.resolve() }
  assert.equal(p.queue.retry(identity), true)
  assert.equal(calls, 2) // invoked synchronously in gesture, no await or new fetch
  assert.equal(p.requests.length, 2)
  await turn(); p.audios[0].onended(); await denied
  assert.equal(p.queue.retry(identity), false)
  p.queue.stop()
})

test('inactive tab never starts playback even when an outstanding fetch resolves', async () => {
  const p = playback(), running = p.queue.play('你好', { voice: 'zf_001', speed: 1 })
  p.inactive(); p.resolve(0); await running
  assert.equal(p.audios.length, 0)
})

function observable(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, set(next) { value = next; for (const fn of [...listeners]) fn() }, count: () => listeners.size }
}
function mountedReadout({ storageDenied = false } = {}) {
  const docListeners = new Map(), winListeners = new Map(), effects = [], entries = new Map(), removed = []
  const audios = [], requests = [], saved = []
  const add = map => (name, fn) => map.set(name, fn)
  const remove = map => name => map.delete(name)
  const win = {
    Audio: class { constructor() { audios.push(this) } play() { return Promise.resolve() } pause() { this.paused = true } }, AbortController,
    URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, headers: { get: key => key === 'content-type' ? 'audio/wav' : null }, blob: async () => ({ size: 20 }) } },
    addEventListener: add(winListeners), removeEventListener: remove(winListeners),
  }
  if (storageDenied) Object.defineProperty(win, 'localStorage', { get() { throw Error('denied') } })
  else win.localStorage = { getItem: () => null, setItem: (key, value) => saved.push(JSON.parse(value)) }
  const doc = { defaultView: win, hidden: false, hasFocus: () => true, addEventListener: add(docListeners), removeEventListener: remove(docListeners) }
  const list = observable({ byId: { one: { retainedBy: { mainView: 1 } } } }), generation = observable({ id: 1 }), eventSource = observable(delta(0, [])), target = observable(chat())
  const React = { useRef: value => ({ current: value }), createElement: (...args) => args, useEffect: fn => effects.push(fn()), useSyncExternalStore: (subscribe, snapshot) => snapshot() }
  const ctx = { sessions: { list, binding: id => ({ sessionId: id, eventSource }) }, connection: { generation }, uiConversation: { binding: () => ({ target: name => { assert.equal(name, 'chat'); return target } }) }, slots: {
    inject(name, fn) { fn(); return () => removed.push(name) },
    register(spec, component) { entries.set(spec.name, { spec, component }); return () => {} },
  } }
  const instance = api.installReadout(ctx, doc, React)
  return { indicator: latestIndicator, instance, entries, effects, removed, eventSource, target, list, generation, docListeners, winListeners, requests, audios, saved }
}
function elements(tree, predicate) {
  if (!Array.isArray(tree)) return []
  const own = typeof tree[0] === 'string' && predicate(tree) ? [tree] : []
  return own.concat(...tree.slice(2).map(child => elements(child, predicate)))
}
test('historical reply buttons read official body on explicit click even with auto disabled', async () => {
  const m = mountedReadout()
  m.entries.get('conversation.session.header.utilities').component({ sessionId: 'one' })
  assert.equal(m.indicator.available.length, 1)
  assert.equal(m.requests.length, 0) // history never automatically speaks
  m.indicator.onPlay(m.indicator.available[0]); await turn()
  assert.equal(m.requests.length, 1)
  assert.equal(JSON.parse(m.requests[0].init.body).text, '正文')
  assert.equal(m.audios.length, 1)
  m.indicator.onStop()
  assert.equal(m.requests[0].init.signal.aborted, true)
  m.instance.dispose()
})

test('registers only root Voice settings and session header speaker; lifecycle removes both', () => {
  const m = mountedReadout({ storageDenied: true })
  assert.deepEqual([...m.entries.keys()].sort(), ['conversation.session.header.utilities', 'settings.section'])
  const settings = m.entries.get('settings.section')
  assert.equal(settings.spec.label, '语音')
  settings.component({})
  assert.equal(m.eventSource.count(), 0) // root settings must not bind a session
  const header = m.entries.get('conversation.session.header.utilities').component
  const button = header({ sessionId: 'one' })
  assert.equal(button[0], 'button'); assert.equal(button[1]['aria-pressed'], false)
  assert.equal(elements(button, e => e[0] === 'svg').length, 1)
  assert.equal(elements(button, e => e[0] === 'select' || e[0] === 'input').length, 0)
  assert.equal(m.eventSource.count(), 1)
  m.docListeners.get('click')({ target: { closest: () => ({ getAttribute: () => 'Start recording' }) } })
  m.winListeners.get('blur')()
  m.list.set({ byId: {} }); m.generation.set(undefined)
  m.instance.dispose(); m.instance.dispose()
  assert.deepEqual(m.removed.sort(), ['conversation.session.header.utilities', 'settings.section'])
  assert.equal(m.eventSource.count(), 0); assert.equal(m.target.count(), 0)
  assert.equal(m.list.count(), 0); assert.equal(m.generation.count(), 0)
  assert.equal(m.docListeners.size, 0); assert.equal(m.winListeners.size, 0)
  for (const cleanup of m.effects) cleanup?.()
})
test('settings persist input preferences with bounded hold delay and notify only input changes', () => {
  const m = mountedReadout(), Settings = m.entries.get('settings.section').component
  let updates = 0
  const unInput = m.instance.subscribeInputPreferences(() => updates++)
  const inputs = elements(Settings({}), e => e[0] === 'input')
  inputs[0][1].onChange({ target: { checked: false } })
  inputs[1][1].onChange({ target: { value: '2000' } })
  assert.deepEqual({ ...m.instance.getInputPreferences() }, { pressEnabled: false, holdMs: 1500 })
  assert.equal(updates, 2)
  inputs[2][1].onChange({ target: { checked: true } })
  assert.equal(updates, 2)
  assert.equal(m.saved.at(-1).pressEnabled, false)
  assert.equal(m.saved.at(-1).holdMs, 1500)
  unInput(); m.instance.dispose()
})
test('header toggle unlocks synchronously and disabling aborts a settings preview immediately', async () => {
  const m = mountedReadout(), Header = m.entries.get('conversation.session.header.utilities').component
  let button = Header({ sessionId: 'one' })
  button[1].onClick()
  assert.equal(m.audios.length, 1)
  assert.equal(m.saved.at(-1).auto, true)
  const tree = m.entries.get('settings.section').component({})
  const preview = elements(tree, e => e[0] === 'button' && e[2] === '试听')[0]
  preview[1].onClick(); await turn()
  assert.equal(m.requests.length, 1)
  button = Header({ sessionId: 'one' })
  assert.equal(button[1]['aria-pressed'], true)
  button[1].onClick()
  assert.equal(m.saved.at(-1).auto, false)
  assert.equal(m.requests[0].init.signal.aborted, true)
  assert.equal(m.audios[0].paused, true)
  m.instance.dispose()
})
test('root settings can preview without a mounted conversation header', async () => {
  const m = mountedReadout()
  const tree = m.entries.get('settings.section').component({})
  const preview = elements(tree, e => e[0] === 'button' && e[2] === '试听')[0]
  preview[1].onClick(); await turn()
  assert.equal(m.requests.length, 1)
  assert.equal(m.eventSource.count(), 0)
  m.instance.stop(); m.instance.dispose()
})
