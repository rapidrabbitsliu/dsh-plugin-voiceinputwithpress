/* Browser readout uses official Session event deltas and Chat target data only.
 * No transcript DOM scraping. A Turn must start AND complete live in this
 * focused main-view tab after opt-in; replacement/reconnect never earns credit. */
const { prepareReadoutText } = require('./readout-text.js')
const { installReadoutIndicator } = require('./readout-indicator.js')

function replyIdentity(snapshot, sessionId, turn = snapshot?.timeline.turnOrder.at(-1)) {
  if (!closingText(snapshot, turn)) return null
  const keys = snapshot.locations.getTurn(turn)
  const tailKey = keys.find(key => snapshot.nodes.get(key)?.kind === 'turn-tail')
  const messageId = snapshot.nodes.get(tailKey)?.data.closing?.finalNode?.messageId
  const nodeKeys = keys.filter(key => {
    const node = snapshot.nodes.get(key)
    return node?.kind === 'assistant-step' && node.data.finalNode?.messageId === messageId
  })
  if (tailKey) nodeKeys.push(tailKey)
  return nodeKeys.length ? { sessionId, nodeKeys, turn } : null
}
const VOICES = ['zf_001', 'zf_002', 'zm_010']
const STORAGE_KEY = 'voiceinputwithpress.readout.v1'

function readPreferences(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}')
    return {
      auto: value.auto === true, voice: VOICES.includes(value.voice) ? value.voice : VOICES[0],
      speed: Number.isFinite(value.speed) ? Math.max(.7, Math.min(1.5, value.speed)) : 1,
      pressEnabled: value.pressEnabled !== false,
      holdMs: Number.isFinite(value.holdMs) ? Math.round(Math.max(300, Math.min(1500, value.holdMs))) : 500,
    }
  } catch { return { auto: false, voice: VOICES[0], speed: 1, pressEnabled: true, holdMs: 500 } }
}

/** Only finalized body text from the closing assistant of a normally closed Turn. */
function closingText(snapshot, turn) {
  if (!snapshot) return ''
  const location = snapshot.timeline.turns.get(turn)
  if (location?.status !== 'closed' || location.end?.data.reason.kind !== 'completed') return ''
  for (const key of snapshot.locations.getTurn(turn)) {
    const node = snapshot.nodes.get(key)
    if (node?.kind !== 'turn-tail' || node.data.turn !== turn) continue
    const closing = node.data.closing
    if (closing?.status !== 'settled' || !closing.finalNode?.messageId) return ''
    return closing.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n')
  }
  return ''
}

/** DOM is used only for click identity, never to obtain spoken text. */
function isLatestReplyClick(element, sessionId, snapshot) {
  const seat = element?.closest?.('[data-chat-node-key]')
  const session = seat?.closest?.('[data-conversation-session]')
  if (!seat || session?.getAttribute('data-conversation-session') !== sessionId || !snapshot) return false
  const turn = snapshot.timeline.turnOrder.at(-1)
  if (!closingText(snapshot, turn)) return false
  const key = seat.getAttribute('data-chat-node-key')
  const node = snapshot.nodes.get(key)
  if (!node || node.data.turn !== turn || !snapshot.locations.getTurn(turn).includes(key)) return false
  if (node.kind === 'turn-tail') return true
  if (node.kind !== 'assistant-step') return false
  for (const tailKey of snapshot.locations.getTurn(turn)) {
    const tail = snapshot.nodes.get(tailKey)
    if (tail?.kind === 'turn-tail') return node.data.finalNode?.messageId === tail.data.closing?.finalNode.messageId
  }
  return false
}

/** Deliberately conservative freshness gate; never infer completion from text. */
function createCompletionGate() {
  const started = new Set(), pending = new Set()
  let revision = -1
  return {
    reset() { started.clear(); pending.clear() },
    observe(window, active) {
      if (window.revision === revision) return
      revision = window.revision
      if (!active || window.change.kind === 'replace') { this.reset(); return }
      if (window.change.kind !== 'append') return
      for (const { event } of window.change.entries) {
        if (event.type === 'turn/start') started.add(event.data.turn)
        if (event.type === 'turn/end') {
          if (started.delete(event.data.turn) && event.data.reason.kind === 'completed') pending.add(event.data.turn)
        }
      }
    },
    take(snapshot) {
      const result = []
      for (const turn of pending) {
        // Target assembly can publish after eventSource. Wait for official end.
        if (!snapshot?.timeline.turns.get(turn)?.end) continue
        pending.delete(turn)
        if (snapshot.timeline.turnOrder.at(-1) !== turn) continue
        const text = closingText(snapshot, turn)
        if (text) result.push(text)
      }
      return result
    },
  }
}

const ERROR_LABELS = {
  invalid_request: '朗读请求字段无效', empty_text: '没有可朗读的文字',
  invalid_json: '朗读请求格式无效', missing_body: '缺少朗读请求内容', unsupported_media_type: '请求格式不支持',
  forbidden: '朗读请求未通过访问校验', method_not_allowed: '朗读请求方法不支持',
  text_too_long: '分句超过长度限制', invalid_text: '朗读文字为空或格式错误',
  unsupported_control: '文字包含不支持的控制字符', invalid_unicode: '文字编码无效',
  invalid_voice: '音色无效', invalid_speed: '语速无效', disabled: '宿主尚未启用本地朗读',
  queue_full: '合成队列已满，请稍后重试', timeout: '本地合成超时',
  unsupported_voice: '音色无效', aborted: '合成已取消', stopped: '朗读服务已停止',
  worker_failed: '本地语音进程启动或运行失败', invalid_response: '模型返回了无效音频', synthesis_failed: '模型合成失败',
  worker_error: '本地语音模型处理失败', unavailable: '本地朗读服务不可用',
}
function createDiagnostics(now = () => new Date().toISOString()) {
  const records = []
  return {
    log(event, fields = {}) {
      const safe = {}
      for (const key of ['generation', 'chunk', 'chunks', 'characters', 'latinCharacters', 'voice', 'speed', 'requestId', 'status', 'code', 'durationMs', 'bytes', 'browserError', 'active']) {
        const value = fields[key]
        if (typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && /^[\w .:-]{1,100}$/.test(value))) safe[key] = value
      }
      records.push({ time: now(), event, ...safe })
      if (records.length > 200) records.shift()
    },
    snapshot: () => records.map(record => ({ ...record })),
  }
}

/** One fetch and one Audio at a time; no unbounded synthesis prefetch. */
function createAudioQueue(env, report) {
  const diagnostics = env.diagnostics || createDiagnostics()
  const log = (event, fields) => diagnostics.log(event, fields)
  let generation = 0, controller = null, audio = null, player = null, url = null, release = null, retryPlayback = null, blockedIdentity = null
  // Keep the same media element: mobile browsers grant playback per element.
  // Invoke play synchronously inside a real user gesture, before any fetch.
  function unlock() {
    if (retryPlayback) { retryPlayback(); return }
    log('audio.unlock.request')
    player ||= new env.Audio()
    if (audio) return
    const ticket = generation
    player.src = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA=='
    try {
      Promise.resolve(player.play()).then(() => {
        log('audio.unlock.success')
        if (generation === ticket && !audio) player.pause()
      }).catch(error => { log('audio.unlock.error', { browserError: error?.name }); report('请允许此站点播放声音，再点击试听') })
    } catch { report('请允许此站点播放声音，再点击试听') }
  }
  function stop() {
    log('queue.stop', { generation, active: !!(audio || controller) })
    generation++
    retryPlayback = null; blockedIdentity = null
    controller?.abort(); controller = null
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null }
    release?.(); release = null
    if (url) { env.URL.revokeObjectURL(url); url = null }
    env.onPlayback?.(null)
    env.onPending?.(null)
  }
  async function play(body, preferences, identity = null) {
    stop()
    const ticket = generation
    const chunks = prepareReadoutText(body)
    log('queue.start', { generation, chunks: chunks.length, voice: preferences.voice, speed: preferences.speed })
    if (!chunks.length) { report('没有可朗读的正文'); return }
    env.onPending?.(identity)
    controller = new env.AbortController()
    const signal = controller.signal
    report('正在合成…', identity)
    try {
      async function synthesize(text, chunk) {
        const started = Date.now()
        log('synthesis.request', { generation: ticket, chunk, characters: Array.from(text).length, latinCharacters: (text.match(/[A-Za-z]/g) || []).length, voice: preferences.voice, speed: preferences.speed })
        const response = await env.fetch('/api/voiceinputwithpress.tts', {
          method: 'POST', credentials: 'same-origin', redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, voice: preferences.voice, speed: preferences.speed }), signal,
        })
        let requestId = response.headers.get('x-tts-request-id') || ''
        if (!response.ok) {
          let code = ''
          try {
            const declared = Number(response.headers.get('content-length'))
            if (!declared || declared < 16384) {
              const raw = await response.text()
              const detail = raw.length < 16384 ? JSON.parse(raw)?.error : null
              if (/^[a-z0-9_]{1,64}$/.test(detail?.code || '')) code = detail.code
              if (!requestId && /^[\w-]{1,80}$/.test(detail?.requestId || '')) requestId = detail.requestId
            }
          } catch { /* old Host or non-JSON proxy error */ }
          log('synthesis.error', { generation: ticket, chunk, status: response.status, code, requestId, durationMs: Date.now() - started })
          const explanation = ERROR_LABELS[code] || (response.status === 400 ? '文字或朗读参数未通过校验' : '请查看诊断日志')
          throw new Error(`朗读服务 ${response.status}：${explanation}${code ? `（${code}）` : ''}${/^[\w-]{1,80}$/.test(requestId) ? `；请求 ${requestId}` : ''}`)
        }
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'audio/wav') throw new Error('朗读服务未返回 WAV 音频')
        const blob = await response.blob()
        if (!blob.size || blob.size > 16 * 1024 * 1024) throw new Error('朗读音频大小无效')
        log('synthesis.success', { generation: ticket, chunk, requestId, bytes: blob.size, durationMs: Date.now() - started })
        return blob
      }
      // At most one future WAV and one request, while the current WAV plays.
      // Convert rejections to values immediately to avoid unhandled rejections
      // if playback is cancelled before the prefetched response is consumed.
      const request = (text, chunk) => synthesize(text, chunk).then(blob => ({ blob }), error => ({ error }))
      let next = request(chunks[0], 1)
      for (let index = 0; index < chunks.length; index++) {
        const result = await next
        if (ticket !== generation || !env.active()) return
        if (result.error) throw result.error
        const blob = result.blob
        next = index + 1 < chunks.length ? request(chunks[index + 1], index + 2) : null
        url = env.URL.createObjectURL(blob)
        player ||= new env.Audio()
        audio = player
        audio.src = url
        report('正在朗读…', identity)
        await new Promise((resolve, reject) => {
          release = resolve
          audio.onended = () => { env.onPlayback?.(null); log('audio.ended', { generation: ticket, chunk: index + 1 }); resolve() }
          audio.onerror = () => { log('audio.error', { generation: ticket, chunk: index + 1, code: String(audio?.error?.code || 'unknown') }); reject(new Error('无法播放朗读音频')) }
          const attempt = () => {
            if (ticket !== generation) return
            retryPlayback = null; blockedIdentity = null
            env.onPending?.(identity)
            log('audio.play.request', { generation: ticket, chunk: index + 1 })
            const failed = error => {
              if (ticket !== generation) return
              const name = error?.name || 'Error'
              log('audio.play.error', { generation: ticket, chunk: index + 1, browserError: name })
              if (name === 'NotAllowedError') {
                retryPlayback = attempt; blockedIdentity = identity
                env.onPending?.(null); env.onPlayback?.(null)
                report('声音待授权，请点击这条回复的喇叭播放', identity)
                return
              }
              reject(new Error(name === 'NotSupportedError' ? '浏览器不支持或无法解码朗读音频；请复制诊断日志' : name === 'AbortError' ? '播放被浏览器中断，请重试（AbortError）' : `播放失败（${/^[A-Za-z]{1,40}$/.test(name) ? name : 'Error'}）；请复制诊断日志`))
            }
            try {
              // Must be invoked before any await in the retry click handler.
              Promise.resolve(audio.play()).then(() => {
                if (ticket !== generation) return
                log('audio.play.success', { generation: ticket, chunk: index + 1 })
                env.onPlayback?.(identity)
                report('正在朗读…', identity)
              }).catch(failed)
            } catch (error) { failed(error) }
          }
          attempt()
        })
        if (ticket !== generation) return
        audio.onended = null; audio.onerror = null; audio = null; release = null
        env.URL.revokeObjectURL(url); url = null
      }
      if (ticket === generation) { controller = null; env.onPending?.(null); report('朗读完成', identity) }
    } catch (error) {
      if (ticket !== generation || signal.aborted) return
      stop(); report(error?.message || '朗读失败', identity)
    }
  }
  function retry(identity) {
    if (!retryPlayback || !identity || blockedIdentity?.sessionId !== identity.sessionId || !blockedIdentity.nodeKeys.some(key => identity.nodeKeys.includes(key))) return false
    retryPlayback()
    return true
  }
  return { stop, play, unlock, retry }
}

function installReadout(ctx, doc, React) {
  const win = doc.defaultView
  let storage
  try { storage = win.localStorage } catch { /* private mode: in-memory preferences */ }
  let preferences = readPreferences(storage), state = { ...preferences, status: '仅当前聚焦标签页；自动朗读默认关闭' }
  let disposed = false, current = null
  const listeners = new Set(), inputListeners = new Set(), gate = createCompletionGate()
  const publish = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const main = id => (ctx.sessions.list.getSnapshot().byId[id]?.retainedBy.mainView ?? 0) > 0
  const previewActive = () => !disposed && !doc.hidden && doc.hasFocus() && ctx.connection.generation.getSnapshot() !== undefined
  const active = () => previewActive() && !!current && main(current.id)
  const diagnostics = createDiagnostics()
  const indicator = installReadoutIndicator(doc, () => stop('已停止：点击朗读标记'), identity => manualReply(identity))
  const queue = createAudioQueue({ Audio: win.Audio, AbortController: win.AbortController, URL: win.URL, fetch: win.fetch.bind(win), active: previewActive, diagnostics, onPending: identity => indicator.setPending(identity), onPlayback: identity => indicator.set(identity) }, (status, identity) => { indicator.setStatus(identity, status); publish({ status }) })
  function stop(status = '已停止') {
    diagnostics.log('readout.stop', { code: status.includes('录音') ? 'recording' : status.includes('最后回复') ? 'reply_click' : status.includes('失焦') ? 'inactive_view' : 'user_or_lifecycle' })
    queue.stop(); indicator.setStatus(null, ''); gate.reset(); publish({ status })
  }
  function configure(patch) {
    stop()
    const inputChanged = ('pressEnabled' in patch && patch.pressEnabled !== preferences.pressEnabled) || ('holdMs' in patch && patch.holdMs !== preferences.holdMs)
    preferences = { ...preferences, ...patch }
    if (inputChanged) for (const listener of inputListeners) listener()
    let status = '设置已保存'
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(preferences)); if (!storage) status = '设置仅在本页有效（本地存储不可用）' }
    catch { status = '设置仅在本页有效（本地存储不可用）' }
    publish({ ...preferences, status })
  }
  function refreshAvailable() {
    const snapshot = current?.target.getSnapshot()
    const identities = snapshot ? snapshot.timeline.turnOrder.map(turn => replyIdentity(snapshot, current.id, turn)).filter(Boolean) : []
    indicator.setAvailable(identities)
  }
  function flush() {
    refreshAvailable()
    if (!active() || !preferences.auto) { gate.reset(); return }
    const snapshot = current.target.getSnapshot()
    for (const text of gate.take(snapshot)) void queue.play(text, preferences, replyIdentity(snapshot, current.id))
  }
  function bind(id) {
    if (disposed) return () => {}
    current?.dispose()
    stop()
    const binding = ctx.sessions.binding(id)
    if (!binding) { publish({ status: '会话尚未就绪' }); return () => {} }
    const target = ctx.uiConversation.binding(binding).target('chat')
    const token = { id, target, dispose: null }
    current = token
    // Baseline is NOT observed: even an append cached at mount is historical.
    const unEvent = binding.eventSource.subscribe(() => {
      const window = binding.eventSource.getSnapshot()
      if (window.change.kind === 'replace') queue.stop()
      if (window.change.kind === 'append' && window.change.entries.some(({ event }) => event.type === 'turn/start')) {
        queue.stop(); publish({ status: '新一轮开始，已停止上一轮朗读' })
      }
      gate.observe(window, active() && preferences.auto)
      flush()
    })
    const unTarget = target.subscribe(flush)
    token.dispose = () => {
      unEvent(); unTarget()
      if (current === token) { current = null; stop(); indicator.setAvailable([]) }
    }
    refreshAvailable()
    return token.dispose
  }
  function manualReply(identity) {
    if (!active() || identity.sessionId !== current.id) return
    const snapshot = current.target.getSnapshot()
    const verified = replyIdentity(snapshot, current.id, identity.turn)
    if (!verified || !verified.nodeKeys.some(key => identity.nodeKeys.includes(key))) return
    if (queue.retry(verified)) return
    queue.unlock()
    const text = closingText(snapshot, identity.turn)
    if (text) void queue.play(text, preferences, verified)
  }
  function manual() {
    queue.unlock()
    if (!active()) { publish({ status: '请在当前会话的聚焦标签页操作' }); return }
    const snapshot = current.target.getSnapshot()
    const text = closingText(snapshot, snapshot?.timeline.turnOrder.at(-1))
    if (!text) { publish({ status: '最后一轮没有正常完成的可朗读正文' }); return }
    void queue.play(text, preferences, replyIdentity(snapshot, current.id))
  }
  function activity() { if (!active()) stop('已停止：页面失焦、隐藏或会话切换') }
  function reconnect() { stop('连接变化，旧回复不会补播') }
  const unList = ctx.sessions.list.subscribe(activity)
  const unConnection = ctx.connection.generation.subscribe(reconnect)
  doc.addEventListener('visibilitychange', activity)
  win.addEventListener('blur', activity)
  win.addEventListener('pagehide', reconnect)
  // The press adapter calls stop before starting native recording. This listener
  // also catches use of the standard native recording button.
  function nativeRecord(e) {
    if (e.target?.closest?.('[data-voice-readout-indicator]')) return
    const label = e.target?.closest?.('button')?.getAttribute('aria-label')
    if (label === 'Start recording' || label === '开始录音') stop('已停止：开始录音')
    else if (current && isLatestReplyClick(e.target, current.id, current.target.getSnapshot())) stop('已停止：点击最后回复')
  }
  doc.addEventListener('click', nativeRecord, true)

  async function copyDiagnostics() {
    const payload = JSON.stringify({ plugin: 'voiceinputwithpress', schema: 1, records: diagnostics.snapshot() }, null, 2)
    try {
      if (win.navigator?.clipboard?.writeText) {
        await win.navigator.clipboard.writeText(payload)
        publish({ status: '诊断日志已复制（不含回复正文）' })
      } else win.prompt('复制诊断日志（不含回复正文）', payload)
    } catch { win.prompt?.('复制诊断日志（不含回复正文）', payload) }
  }
  const h = React.createElement
  const useState = () => React.useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => state)
  function toggleAuto() {
    const auto = !preferences.auto
    configure({ auto })
    if (auto) queue.unlock()
  }
  function HeaderToggle({ sessionId }) {
    React.useEffect(() => bind(sessionId), [sessionId])
    const value = useState()
    const control = React.useRef(null)
    React.useEffect(() => {
      const button = control.current
      const home = button?.parentElement
      const header = button?.closest('header')
      if (!button || !home || !header) return
      // The current DSH tab row has no direct-control slot (its action slot is
      // a More menu). Keep slot lifecycle ownership, adapt only this control.
      let row, previousPadding
      const place = () => {
        const tabs = header.querySelector('[data-conversation-tabs]')
        const next = tabs?.parentElement
        if (!next || row === next) return
        if (row) { row.style.paddingRight = previousPadding; home.appendChild(button) }
        row = next; previousPadding = row.style.paddingRight
        row.style.paddingRight = '40px'
        row.appendChild(button)
        // Tab labels occupy a 16px text line; the tab's lower 9px is
        // underline spacing, not part of the visual alignment target.
        Object.assign(button.style, { position: 'absolute', right: '0', top: '-8px' })
      }
      place()
      const observer = win.MutationObserver ? new win.MutationObserver(place) : null
      observer?.observe(header, { childList: true, subtree: true })
      return () => {
        observer?.disconnect()
        if (row) row.style.paddingRight = previousPadding
        home.appendChild(button)
        Object.assign(button.style, { position: '', right: '', top: '' })
      }
    }, [sessionId])
    const label = value.auto ? '关闭回复朗读' : '开启回复朗读'
    return h('button', {
      ref: control,
      type: 'button', 'data-voice-readout-toggle': '', 'aria-label': label,
      'aria-pressed': value.auto, title: `${label} · ${value.status}`, onClick: toggleAuto,
      style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: '6px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer', opacity: value.auto ? 1 : .55 },
    }, h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M11 5 6 9H3v6h3l5 4V5Z' }),
      value.auto ? h('path', { d: 'M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14' }) : h('path', { d: 'm16 9 5 6m0-6-5 6' })))
  }
  function VoiceSettings() {
    const value = useState()
    const rowStyle = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }
    return h('section', { 'data-voice-settings': '', style: { display: 'grid', gap: '18px', maxWidth: '680px' } },
      h('h2', null, '语音'),
      h('fieldset', { style: { display: 'grid', gap: '12px', border: '1px solid currentColor', borderRadius: '8px', padding: '16px' } },
        h('legend', null, '长按语音输入'),
        h('label', null, h('input', { type: 'checkbox', checked: value.pressEnabled, onChange: e => configure({ pressEnabled: e.target.checked }) }), ' 启用长按麦克风说话'),
        h('label', null, '长按触发时间（毫秒） ', h('input', { type: 'number', min: 300, max: 1500, step: 50, value: value.holdMs, onChange: e => { const holdMs = Number(e.target.value); if (Number.isFinite(holdMs)) configure({ holdMs: Math.round(Math.max(300, Math.min(1500, holdMs))) }) } })),
        h('p', null, '空白草稿时长按麦克风录音，松开发送，上滑取消。短按或已有文字时使用普通录音，不自动发送；输入框长按始终保留系统粘贴菜单。')),
      h('fieldset', { style: { display: 'grid', gap: '12px', border: '1px solid currentColor', borderRadius: '8px', padding: '16px' } },
        h('legend', null, '回复朗读'),
        h('label', null, h('input', { type: 'checkbox', checked: value.auto, onChange: toggleAuto }), ' 自动朗读新完成回复'),
        h('div', { style: rowStyle },
          h('label', null, '音色 ', h('select', { value: value.voice, onChange: e => configure({ voice: e.target.value }) }, ...VOICES.map(voice => h('option', { key: voice, value: voice }, voice)))),
          h('label', null, '语速 ', h('input', { type: 'number', min: .7, max: 1.5, step: .1, value: value.speed, style: { width: '68px' }, onChange: e => { const speed = Number(e.target.value); if (Number.isFinite(speed)) configure({ speed: Math.max(.7, Math.min(1.5, speed)) }) } }))),
        h('div', { style: rowStyle },
          h('button', { type: 'button', onClick: () => { queue.unlock(); publish({ status: '已请求声音授权，可点试听验证；刷新后可能需重新启用' }) } }, '启用声音'),
          h('button', { type: 'button', onClick: () => { queue.unlock(); if (previewActive()) void queue.play('你好，这是本地回复朗读试听。', preferences) } }, '试听'),
          h('button', { type: 'button', onClick: manual }, '朗读最后回复'),
          h('button', { type: 'button', onClick: () => stop() }, '停止'),
          h('button', { type: 'button', onClick: copyDiagnostics }, '复制诊断日志')),
        h('p', null, '对话右上角喇叭可快速切换自动朗读。仅当前聚焦会话的新回复自动播放，点击最后回复可停止。苹果浏览器刷新后可能需要重新启用声音。'),
        h('span', { role: 'status', 'aria-live': 'polite' }, value.status)))
  }
  const unHeader = ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'voiceinputwithpress-readout-toggle', order: 90 }, HeaderToggle))
  const unSettings = ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'voiceinputwithpress-voice', label: '语音', order: 80 }, VoiceSettings))
  return {
    stop,
    getInputPreferences: () => ({ pressEnabled: preferences.pressEnabled, holdMs: preferences.holdMs }),
    subscribeInputPreferences(listener) { inputListeners.add(listener); return () => inputListeners.delete(listener) },
    dispose() {
      if (disposed) return
      disposed = true; current?.dispose(); queue.stop(); indicator.dispose(); gate.reset(); unHeader(); unSettings(); unList(); unConnection()
      doc.removeEventListener('visibilitychange', activity); doc.removeEventListener('click', nativeRecord, true)
      win.removeEventListener('blur', activity); win.removeEventListener('pagehide', reconnect)
      listeners.clear(); inputListeners.clear()
    },
  }
}
exports.replyIdentity = replyIdentity
exports.createDiagnostics = createDiagnostics
exports.isLatestReplyClick = isLatestReplyClick
exports.readPreferences = readPreferences
exports.closingText = closingText
exports.createCompletionGate = createCompletionGate
exports.createAudioQueue = createAudioQueue
exports.installReadout = installReadout
