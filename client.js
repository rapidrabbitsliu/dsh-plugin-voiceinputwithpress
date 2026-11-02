window.__ModuleLoader__.load({id:"dsh-plugin-voiceinputwithpress",factory:(require)=>{
const module={exports:{}};const exports=module.exports;
/* DOM adapter for the current experimental voice-input UI; no core patches. */
const LABELS = {
  start: ['Start recording', '开始录音'],
  stop: ['Stop and transcribe', '停止并识别'],
  cancel: ['Cancel', '取消'],
  send: ['Send message', '发送消息'],
}
const { createVisual } = (function(){const exports={};
'use strict'

let nextVisual = 0
const SVG_NS = 'http://www.w3.org/2000/svg'

// The native recorder owns the microphone. This module only reads its SVG.
exports.createVisual = function createVisual(doc, win, card) {
  const token = `press-voice-${++nextVisual}`
  const previousAttribute = card.getAttribute('data-press-voice')
  const root = doc.createElement('div')
  root.setAttribute('data-press-voice-visual', token)
  root.setAttribute('aria-hidden', 'true')
  root.hidden = true
  root.innerHTML = `
    <div class="pv-card"><svg class="pv-wave" viewBox="0 0 640 80" preserveAspectRatio="none"></svg><span class="pv-card-label"></span></div>
    <div class="pv-center"><div class="pv-orb"><div class="pv-orb-color"></div><div class="pv-orb-light"></div></div><div class="pv-message"></div></div>
    <div class="pv-track"><div class="pv-target">×</div><div class="pv-rail"><div class="pv-travel"></div></div><div class="pv-point"></div><div class="pv-track-label">上滑取消</div></div>`
  const style = doc.createElement('style')
  const scope = `[data-press-voice-visual="${token}"]`
  style.textContent = `
    [data-press-voice="${token}"] > * { visibility: hidden !important; }
    [data-press-voice="${token}"]::before,
    [data-press-voice="${token}"]::after { visibility: hidden !important; }
    ${scope}, ${scope} * { box-sizing: border-box; pointer-events: none !important; }
    ${scope} { position: fixed; inset: 0; z-index: 2147483000; color: #f4f6ff; font: 500 14px/1.5 system-ui, sans-serif; --pv-accent: #a997ff; --pv-progress: 0; }
    ${scope}[hidden] { display: none !important; }
    ${scope}[data-armed="true"] { --pv-accent: #ff526d; }
    ${scope} .pv-card { position: fixed; overflow: hidden; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--pv-accent) 48%, transparent); background: rgba(25, 23, 43, .96); box-shadow: 0 0 28px color-mix(in srgb, var(--pv-accent) 16%, transparent); }
    ${scope} .pv-wave { position: absolute; inset: 8px 12px 27px; width: calc(100% - 24px); height: calc(100% - 35px); min-height: 8px; color: var(--pv-accent); }
    ${scope} .pv-card-label { position: absolute; bottom: 8px; inset-inline: 10px; text-align: center; color: #d8d4ed; font-size: 12px; }
    ${scope} .pv-center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 22px; }
    ${scope} .pv-orb { position: relative; width: clamp(76px, 13vw, 120px); aspect-ratio: 1; border-radius: 50%; background: #44369b; box-shadow: 0 0 38px #9675ff60, inset 0 0 22px #ffffff50; will-change: transform; }
    ${scope} .pv-orb-color { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, #ff5685, #ffb84d, #fff17b, #5ee7a1, #58cdf7, #7d70ff, #d96af5, #ff5685); filter: saturate(1.3); animation: ${token}-spin 5s linear infinite; }
    ${scope} .pv-orb-light { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 32% 24%, #ffffffb0, transparent 38%), radial-gradient(circle at 65% 78%, #19124c90, transparent 70%); box-shadow: inset -10px -14px 22px #20134c70, inset 3px 4px 15px #ffffff55; }
    ${scope}[data-armed="true"] .pv-orb-color { background: conic-gradient(#ff385c, #ff9b7b, #ff526d, #b51544, #ff385c); }
    ${scope}[data-armed="true"] .pv-orb { box-shadow: 0 0 44px #ff385c65; }
    ${scope}[data-armed="true"] .pv-card { background: rgba(91, 18, 36, .97); border-color: #ff526d; }
    ${scope} .pv-message { white-space: nowrap; padding: 7px 15px; border-radius: 20px; background: #171522d9; color: #f5f2ff; box-shadow: 0 4px 20px #0002; }
    ${scope}[data-armed="true"] .pv-message { color: #ff99ac; }
    ${scope} .pv-track { position: absolute; left: 50%; top: max(12px, calc(50% - 238px)); width: 100px; height: 130px; transform: translateX(-50%); color: var(--pv-accent); }
    ${scope} .pv-target { position: absolute; top: 0; left: 34px; width: 32px; height: 32px; border: 1px solid currentColor; border-radius: 50%; display: grid; place-items: center; font-size: 24px; background: #191624df; opacity: calc(.35 + var(--pv-progress) * .65); }
    ${scope} .pv-rail { position: absolute; top: 39px; bottom: 22px; left: 49px; width: 2px; background: #b9a8ef33; overflow: hidden; }
    ${scope} .pv-travel { position: absolute; bottom: 0; width: 100%; height: calc(var(--pv-progress) * 100%); background: currentColor; }
    ${scope} .pv-point { position: absolute; left: 45px; top: calc(103px - var(--pv-progress) * 92px); width: 10px; height: 10px; border-radius: 50%; background: currentColor; box-shadow: 0 0 14px currentColor; }
    ${scope} .pv-track-label { position: absolute; top: 116px; left: 0; width: 100%; text-align: center; font-size: 12px; }
    @keyframes ${token}-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { ${scope} .pv-orb-color { animation: none; } ${scope} .pv-orb { will-change: auto; } }
    @media (max-height: 460px) { ${scope} .pv-track { left: calc(50% + 112px); top: calc(50% - 65px); } }
  `
  ;(doc.head || doc.documentElement).appendChild(style)
  ;(doc.body || doc.documentElement).appendChild(root)
  const overlay = root.querySelector('.pv-card')
  const waveform = root.querySelector('.pv-wave')
  const orb = root.querySelector('.pv-orb')
  const message = root.querySelector('.pv-message')
  const label = root.querySelector('.pv-card-label')
  const track = root.querySelector('.pv-track')
  const bars = Array.from({ length: 64 }, (_, index) => {
    const line = doc.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(index * 10 + 5))
    line.setAttribute('x2', String(index * 10 + 5))
    line.setAttribute('y1', '39')
    line.setAttribute('y2', '41')
    line.setAttribute('stroke', 'currentColor')
    line.setAttribute('stroke-width', '3')
    line.setAttribute('stroke-linecap', 'round')
    waveform.appendChild(line)
    return line
  })
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)')
  let phase = 'idle', armed = false, disposed = false, frame = null, level = 0

  function releaseCard() {
    if (card.getAttribute('data-press-voice') !== token) return
    if (previousAttribute === null) card.removeAttribute('data-press-voice')
    else card.setAttribute('data-press-voice', previousAttribute)
  }

  function draw() {
    frame = null
    if (disposed || root.hidden) return
    if (!card.isConnected) { root.hidden = true; releaseCard(); return }
    const rect = card.getBoundingClientRect()
    overlay.style.left = `${rect.left}px`
    overlay.style.top = `${rect.top}px`
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`
    // Native bars have a 2-unit silent baseline and 36-unit full amplitude
    // in a 40-unit viewBox. Preserve the measured history, never invent audio.
    const source = phase === 'recording'
      ? card.querySelector('[data-voice-activity="recording"] svg[role="img"]') : null
    const sourceBars = source ? source.querySelectorAll('line') : []
    const viewHeight = source?.viewBox?.baseVal?.height || 40
    let latest = 0
    for (let index = 0; index < bars.length; index++) {
      const native = sourceBars.length ? sourceBars[Math.round(index * (sourceBars.length - 1) / (bars.length - 1))] : null
      const span = native ? Math.abs(Number(native.getAttribute('y2')) - Number(native.getAttribute('y1'))) : 2
      const normalized = Number.isFinite(span) ? Math.max(0, Math.min(1, (span / viewHeight - .05) / .85)) : 0
      const half = 1 + normalized * 32
      bars[index].setAttribute('y1', String(40 - half))
      bars[index].setAttribute('y2', String(40 + half))
      if (index >= bars.length - 4) latest = Math.max(latest, normalized)
    }
    level += (latest - level) * .3
    orb.style.transform = motion?.matches ? 'scale(1)' : `scale(${1 + level * .28})`
    frame = win.requestAnimationFrame(draw)
  }

  function update(nextPhase, nextArmed, progress) {
    if (disposed) return
    phase = nextPhase
    armed = !!nextArmed
    const active = ['requesting', 'recording', 'transcribing', 'feedback'].includes(phase)
    root.hidden = !active
    if (!active) {
      releaseCard()
      if (frame !== null) win.cancelAnimationFrame(frame)
      frame = null
      level = 0
      return
    }
    if (card.getAttribute('data-press-voice') !== token) card.setAttribute('data-press-voice', token)
    const amount = Number(progress)
    root.style.setProperty('--pv-progress', String(armed ? 1 : Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0))
    if (root.getAttribute('data-armed') !== String(armed)) root.setAttribute('data-armed', String(armed))
    const text = armed ? '松开取消' : phase === 'requesting' ? '正在准备麦克风…' : phase === 'transcribing' ? '正在转写…' : phase === 'feedback' ? '录音已结束' : '松开发送 · 上滑取消'
    if (message.textContent !== text) message.textContent = text
    if (label.textContent !== text) label.textContent = text
    track.hidden = phase !== 'recording' && phase !== 'requesting'
    if (frame === null) frame = win.requestAnimationFrame(draw)
  }

  function dispose() {
    if (disposed) return
    disposed = true
    if (frame !== null) win.cancelAnimationFrame(frame)
    frame = null
    releaseCard()
    root.remove()
    style.remove()
  }
  return { update, dispose }
}

return exports;})()
const HOLD_MS = 500, CANCEL_PX = 70, MOVE_PX = 12, TIMEOUT_MS = 180000

function button(root, labels) {
  return [...root.querySelectorAll('button[aria-label]')].find(el => labels.includes(el.getAttribute('aria-label')) && !el.disabled)
}
function install(doc = document, onRecord = () => {}, getPreferences = () => ({}), subscribePreferences = () => () => {}) {
  let run = null, disposed = false, suppressedMic = null, suppressionTimer = null, invokingStart = false
  const suppressClick = mic => {
    suppressedMic = mic; clearTimeout(suppressionTimer)
    suppressionTimer = setTimeout(() => { suppressedMic = null; suppressionTimer = null }, 1500)
  }
  const win = doc.defaultView
  // Leave editor selection, paste, placeholder and native mic visibility alone.
  // Only the existing usable mic is the optional hold-to-talk touch surface.
  const style = doc.createElement?.('style')
  if (style) {
    style.textContent = `
      html[data-press-enabled] [data-composer-card]:has([data-composer-placeholder]) button[aria-label="Start recording"]:not(:disabled),
      html[data-press-enabled] [data-composer-card]:has([data-composer-placeholder]) button[aria-label="开始录音"]:not(:disabled) {
        -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; touch-action:none;
      }
    `
    ;(doc.head || doc.documentElement).appendChild(style)
  }
  const syncPreferences = () => {
    if (getPreferences().pressEnabled !== false) doc.documentElement?.setAttribute('data-press-enabled', '')
    else { doc.documentElement?.removeAttribute('data-press-enabled'); if (run) cancel(run) }
  }
  const unlockSelection = r => {
    if (!r?.selectionLocked) return
    r.selectionLocked = false
    doc.documentElement?.removeAttribute('data-press-selection-lock')
    r.mic.removeAttribute?.('data-press-gesture')
  }
  const clear = () => {
    if (!run) return
    clearTimeout(run.hold); clearTimeout(run.timeout)
    run.observer?.disconnect(); run.visual?.dispose(); unlockSelection(run); run = null
  }
  const phase = r => r.card.querySelector('[data-voice-activity]')?.getAttribute('data-voice-activity') || 'idle'
  const live = r => r.card.isConnected && r.input.isConnected && r.card.contains(r.input) && r.session.isConnected && r.session.getAttribute('data-conversation-session') === r.sessionId
  const attachmentMarkup = r => {
    const scroll = r.card.querySelector('[data-input-scroll]')
    if (!scroll || scroll.parentElement !== r.card) return null
    return [...r.card.children].slice(0, [...r.card.children].indexOf(scroll)).filter(el => !el.matches('[data-composer-overlay]')).map(el => el.outerHTML).join('')
  }
  const cancel = r => {
    suppressClick(r.mic)
    r.cancelled = true; r.safe = false
    r.visual?.dispose()
    // UI cancellation can wait for React; native editing must never wait.
    unlockSelection(r)
    const row = r.card.querySelector('[data-voice-activity]')
    if (row) { button(row, LABELS.cancel)?.click(); clear() }
    else if (!r.observer || !live(r)) clear()
    // React may not yet have committed requesting. Keep the observer until it does.
  }
  const check = r => {
    if (run !== r) return
    if (!live(r) || doc.hidden) { cancel(r); return }
    const p = phase(r)
    if (attachmentMarkup(r) !== r.attachments) r.safe = false
    if (r.cancelled) { if (p !== 'idle') cancel(r); return }
    r.visual?.update(p, !!r.armed, r.progress || 0)
    if (p === 'feedback') {
      const row = r.card.querySelector('[data-voice-activity]')
      // Empty speech is not an error requiring a dismiss/retry toolbar.
      if (/未识别到语音|未识别到内容|No speech (?:was )?(?:recognized|detected)/i.test(row?.textContent || '')) {
        cancel(r)
      } else {
        // Keep genuine permission/provider/conflict feedback accessible.
        clear()
      }
      return
    }
    if (p === 'requesting' || p === 'recording') r.sawActive = true
    if (p === 'recording' && r.released && !r.stopped) {
      const stop = button(r.card.querySelector('[data-voice-activity]'), LABELS.stop)
      if (stop) { r.stopped = true; stop.click() }
    }
    if (p === 'transcribing') { r.sawTranscribing = true; if (!r.stopped) r.safe = false }
    if (p === 'idle' && r.sawActive) {
      if (!r.stopped || !r.sawTranscribing || !r.safe || !r.inserted || !r.input.textContent.trim() || r.input.querySelector('[data-composer-chip], [data-composer-command], [contenteditable="false"]')) { clear(); return }
      // Yield to React/Lexical before validating the final DOM and enabled send button.
      const text = r.input.textContent
      clearTimeout(r.timeout)
      r.timeout = setTimeout(() => {
        if (run !== r || !r.safe || !live(r) || doc.hidden || phase(r) !== 'idle' || attachmentMarkup(r) !== r.attachments || r.input.textContent !== text || r.input.querySelector('[data-composer-chip], [data-composer-command], [contenteditable="false"]')) { clear(); return }
        // DOM observations are not authoritative proof of transcript provenance or
        // successful insertion: this conservative heuristic cannot guarantee either.
        const send = button(r.card, LABELS.send)
        if (send) { clear(); send.click(); return }
        clear()
      }, 100)
    }
  }
  function pointerDown(e) {
    const preferences = getPreferences()
    if (preferences.pressEnabled === false || disposed || run || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const holdMs = Number.isFinite(preferences.holdMs) ? Math.max(300, Math.min(1500, preferences.holdMs)) : HOLD_MS
    const mic = e.target instanceof win.Element ? e.target.closest('button[aria-label]') : null
    if (!mic || mic.disabled || !LABELS.start.includes(mic.getAttribute('aria-label'))) return
    const card = mic.closest('[data-composer-card]'), session = card?.closest('[data-conversation-session]')
    const input = card?.querySelector('[data-composer-input][contenteditable="true"]')
    if (!input || !card || !session || button(card, LABELS.start) !== mic || card.querySelector('[data-voice-activity]')) return
    // A fresh intentional pointer press ends stale synthetic-click suppression.
    suppressedMic = null; clearTimeout(suppressionTimer); suppressionTimer = null
    // Placeholder is rendered only when the draft AND attachment list are empty.
    const empty = !!card.querySelector('[data-composer-placeholder]') && !input.textContent && !input.querySelector('[data-composer-chip], [data-composer-command], [contenteditable="false"]')
    if (!empty) return
    const r = run = { input, mic, card, session, sessionId: session.getAttribute('data-conversation-session'), id: e.pointerId, x: e.clientX, y: e.clientY, safe: empty, released: false, stopped: false, sawActive: false, sawTranscribing: false, inserted: false, cancelled: false }
    // Safari's prevention must not intercept desktop mousedown/caret focus.
    r.pointerType = e.pointerType
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      mic.setAttribute?.('data-press-gesture', '')
      r.selectionLocked = true
      doc.documentElement?.setAttribute('data-press-selection-lock', '')
    }
    r.lastText = input.textContent
    r.attachments = attachmentMarkup(r)
    if (r.attachments === null) r.safe = false
    r.hold = setTimeout(() => {
      if (run !== r || !live(r) || r.released) { clear(); return }
      const start = button(card, LABELS.start)
      if (!start || phase(r) !== 'idle' || input.textContent || !card.querySelector('[data-composer-placeholder]')) { clear(); return }
      // Any edit after the initial check disables automatic sending, even if undone.
      r.observer = new win.MutationObserver(records => {
        for (const record of records) {
          if (input.contains(record.target)) {
            const text = input.textContent
            if (text !== r.lastText) {
              if (r.sawTranscribing && r.stopped) r.inserted = true
              else r.safe = false
              r.lastText = text
            }
          } else {
            const scroll = card.querySelector('[data-input-scroll]')
            const node = record.target.nodeType === 1 ? record.target : record.target.parentElement
            const child = node && [...card.children].find(el => el === node || el.contains(node))
            if (child && scroll && child !== scroll && !child.matches('[data-composer-overlay]') && (child.compareDocumentPosition(scroll) & win.Node.DOCUMENT_POSITION_FOLLOWING)) r.safe = false
          }
        }
        check(r)
      })
      r.visual = createVisual(doc, win, card)
      r.visual.update('requesting', false, 0)
      r.observer.observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-voice-activity', 'contenteditable', 'disabled'] })
      r.timeout = setTimeout(() => { cancel(r); clear() }, TIMEOUT_MS)
      // Native recording replaces the mic button; release implicit touch capture
      // first so its removal cannot strand the gesture on a detached element.
      try { r.mic.releasePointerCapture?.(r.id) } catch { /* capture may already be absent */ }
      r.startInvoked = true
      onRecord()
      invokingStart = true
      try { start.click() } finally { invokingStart = false }
      check(r)
    }, holdMs)
  }
  function pointerMove(e) {
    const r = run; if (!r || e.pointerId !== r.id) return
    // Recover a mouse release outside the document before it becomes a stale hold.
    if (r.pointerType === 'mouse' && e.buttons === 0 && !r.released) { cancel(r); return }
    if (!r.observer) {
      if (Math.hypot(e.clientX - r.x, e.clientY - r.y) > MOVE_PX) clear()
      return
    }
    e.preventDefault?.()
    r.progress = Math.max(0, Math.min(1, (r.y - e.clientY) / CANCEL_PX))
    r.armed = r.progress >= 1
    r.visual?.update(phase(r), r.armed, r.progress)
  }
  function pointerUp(e) {
    const r = run; if (!r || e.pointerId !== r.id) return
    if (r.startInvoked) suppressClick(r.mic)
    r.released = true
    unlockSelection(r)
    if (!r.observer) {
      clear()
      return
    }
    if (r.armed) { cancel(r); return }
    check(r)
  }
  function pointerCancel(e) { if (run && e.pointerId === run.id) cancel(run) }
  function edit(e) { if (run && e.target === run.input) run.safe = false }
  function nativeSelection(e) {
    if (run?.selectionLocked && (e.target === run.mic || run.mic.contains(e.target))) e.preventDefault()
  }
  function micClick(e) {
    if (invokingStart) return
    const mic = e.target instanceof win.Element ? e.target.closest('button[aria-label]') : null
    if (mic && (suppressedMic === mic || (run?.startInvoked && run.mic === mic))) {
      e.preventDefault?.(); e.stopImmediatePropagation?.()
      suppressedMic = null; clearTimeout(suppressionTimer); suppressionTimer = null
    }
  }
  function touchStart(e) {
    const r = run
    if (!r || r.released || !(e.target === r.mic || r.mic.contains(e.target))) return
    // CSS touch-action/callout suppression is confined to the mic. Do not
    // cancel touchstart: a short tap must retain Safari's native click.
  }
  function touchMove(e) {
    if (run?.selectionLocked && run.observer && (e.target === run.mic || run.mic.contains(e.target))) e.preventDefault()
  }
  function blur() { if (run) cancel(run) }
  function visibility() { if (doc.hidden && run) cancel(run) }
  doc.addEventListener('pointerdown', pointerDown, true); doc.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
  doc.addEventListener('pointerup', pointerUp, true); doc.addEventListener('pointercancel', pointerCancel, true)
  doc.addEventListener('beforeinput', edit, true); doc.addEventListener('input', edit, true)
  doc.addEventListener('touchstart', touchStart, { capture: true, passive: false })
  doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
  doc.addEventListener('click', micClick, true)
  doc.addEventListener('selectstart', nativeSelection, true); doc.addEventListener('contextmenu', nativeSelection, true)
  doc.addEventListener('visibilitychange', visibility); win.addEventListener('blur', blur)
  syncPreferences()
  const unsubscribePreferences = subscribePreferences(syncPreferences)
  return () => {
    unsubscribePreferences?.()
    doc.documentElement?.removeAttribute('data-press-enabled')
    disposed = true; if (run) { cancel(run); clear() }
    style?.remove()
    doc.removeEventListener('pointerdown', pointerDown, true); doc.removeEventListener('pointermove', pointerMove, true)
    doc.removeEventListener('pointerup', pointerUp, true); doc.removeEventListener('pointercancel', pointerCancel, true)
    doc.removeEventListener('beforeinput', edit, true); doc.removeEventListener('input', edit, true)
    doc.removeEventListener('touchstart', touchStart, true)
    doc.removeEventListener('touchmove', touchMove, true)
    doc.removeEventListener('click', micClick, true)
    clearTimeout(suppressionTimer); suppressedMic = null; suppressionTimer = null
    doc.removeEventListener('selectstart', nativeSelection, true); doc.removeEventListener('contextmenu', nativeSelection, true)
    doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('blur', blur)
  }
}
exports.install = install
exports.inject = ['slots', 'sessions', 'uiConversation', 'connection']
exports.apply = function apply(ctx) {
  ctx.effect(() => {
    const { installReadout } = (function(){const exports={};
/* Browser readout uses official Session event deltas and Chat target data only.
 * No transcript DOM scraping. A Turn must start AND complete live in this
 * focused main-view tab after opt-in; replacement/reconnect never earns credit. */
const { prepareReadoutText } = (function(){const exports={};
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

return exports;})()
const { installReadoutIndicator } = (function(){const exports={};
/* Reply controls use official identities only; DOM text is never consulted. */
const CSS = `
[data-voice-readout-indicator-wrapper] { display:flex; align-items:center; margin:0 0 8px; pointer-events:none; }
[data-voice-readout-indicator] { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:28px; padding:4px 8px; border:1px solid color-mix(in srgb,currentColor 18%,transparent); border-radius:999px; background:color-mix(in srgb,currentColor 5%,transparent); color:var(--dsw-alias-text-primary,currentColor); opacity:.8; cursor:pointer; pointer-events:auto; line-height:1; transition:opacity .15s,background .15s; }
[data-voice-readout-status] { font-size:12px; line-height:1.5; opacity:.7; margin-left:8px; overflow-wrap:anywhere; }
[data-voice-readout-indicator]:disabled { opacity:.4; cursor:wait; }
[data-voice-readout-indicator]:hover { opacity:1; background:color-mix(in srgb,currentColor 10%,transparent); }
[data-voice-readout-indicator]:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
[data-voice-readout-indicator] svg { width:18px; height:18px; flex:none; overflow:visible; }
[data-voice-readout-indicator] [data-voice-wave] { transform-origin:10px 12px; }
[data-voice-readout-indicator][data-voice-state="playing"] [data-voice-wave] { animation:voice-readout-indicator-wave 1.2s ease-in-out infinite; }
[data-voice-readout-indicator][data-voice-state="playing"] [data-voice-wave="2"] { animation-delay:.18s; }
@keyframes voice-readout-indicator-wave { 0%,100% { opacity:.3; transform:scaleX(.92); } 50% { opacity:1; transform:scaleX(1); } }
@media (prefers-reduced-motion: reduce) { [data-voice-readout-indicator][data-voice-state="playing"] [data-voice-wave] { animation:none; opacity:1; transform:none; } }
`

function normalize(value) {
  if (!value || typeof value.sessionId !== 'string' || !Array.isArray(value.nodeKeys)) return null
  const nodeKeys = [...new Set(value.nodeKeys.filter(key => typeof key === 'string' && key.length > 0))]
  if (!nodeKeys.length) return null
  return { sessionId: value.sessionId, nodeKeys, ...(value.turn !== undefined ? { turn: value.turn } : {}) }
}
function sameReply(a, b) {
  return !!a && !!b && a.sessionId === b.sessionId && a.nodeKeys.some(key => b.nodeKeys.includes(key))
}
function copyIdentity(identity) { return { ...identity, nodeKeys: [...identity.nodeKeys] } }

function installReadoutIndicator(doc, onStop, onPlay) {
  let controls = [], playing = null, pending = null, statusIdentity = null, statusText = '', disposed = false
  const style = doc.createElement('style')
  style.setAttribute('data-voice-readout-indicator-style', '')
  style.textContent = CSS
  ;(doc.head || doc.documentElement).appendChild(style)

  function remove(control) {
    control.button.removeEventListener('click', control.click)
    control.wrapper.remove()
    control.seat = null
  }
  function make(identity) {
    const wrapper = doc.createElement('div')
    wrapper.setAttribute('data-voice-readout-indicator-wrapper', '')
    const button = doc.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute('data-voice-readout-indicator', '')
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
    for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(name, value)
    for (const [path, wave] of [['M10 5 5 9H2v6h3l5 4V5Z'], ['M14 8a6 6 0 0 1 0 8', '1'], ['M18 5a10 10 0 0 1 0 14', '2']]) {
      const element = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
      element.setAttribute('d', path)
      if (wave) element.setAttribute('data-voice-wave', wave)
      svg.appendChild(element)
    }
    button.appendChild(svg); wrapper.appendChild(button)
    const status = doc.createElement('span')
    status.setAttribute('data-voice-readout-status', '')
    status.setAttribute('role', 'status')
    wrapper.appendChild(status)
    const control = { identity, button, wrapper, status, seat: null, state: 'idle', click: null }
    control.click = event => {
      event.preventDefault(); event.stopPropagation()
      if (disposed || control.button.disabled || !controls.includes(control)) return
      if (control.state === 'idle') onPlay?.(copyIdentity(control.identity))
      else onStop?.()
      // Parent owns queue state; clicks never remove a persistent control.
    }
    button.addEventListener('click', control.click)
    return control
  }
  function updateStates() {
    // One selected control even if supplied key sets overlap unexpectedly.
    const selectedPlaying = controls.find(control => sameReply(control.identity, playing))
    const selectedPending = controls.find(control => sameReply(control.identity, pending))
    for (const control of controls) {
      const state = control === selectedPlaying ? 'playing' : control === selectedPending ? 'pending' : 'idle'
      control.state = state
      control.button.setAttribute('data-voice-state', state)
      control.button.setAttribute('aria-label', state === 'playing' ? '停止朗读此回复' : state === 'pending' ? '正在合成此回复' : '朗读此回复')
      control.button.setAttribute('title', state === 'playing' ? '正在朗读，点击停止' : state === 'pending' ? '正在合成，请稍候' : '朗读此回复')
      control.button.setAttribute('aria-busy', state === 'pending' ? 'true' : 'false')
      control.button.disabled = state === 'pending'
      control.status.textContent = state === 'pending' ? '正在合成…' : state === 'playing' ? '正在朗读…' : sameReply(control.identity, statusIdentity) ? statusText : ''
    }
  }
  function locate() {
    if (disposed || !controls.length) return
    const seats = [...doc.querySelectorAll('[data-chat-node-key]')], occupied = new Set()
    for (const control of controls) {
      let match = null
      for (const key of control.identity.nodeKeys) {
        match = seats.find(seat => !occupied.has(seat) && seat.getAttribute('data-chat-node-key') === key && seat.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') === control.identity.sessionId)
        if (match) break
      }
      control.seat = match
      if (!match) { control.wrapper.remove(); continue }
      occupied.add(match)
      if (control.wrapper.parentElement !== match || match.firstChild !== control.wrapper) match.prepend(control.wrapper)
    }
  }
  const Observer = doc.defaultView?.MutationObserver
  const observer = Observer ? new Observer(records => {
    if (disposed || !controls.length) return
    const own = node => controls.some(control => node === control.wrapper || control.wrapper.contains(node))
    const intact = () => controls.every(control => !control.seat || (control.wrapper.parentElement === control.seat && control.seat.firstChild === control.wrapper))
    if (intact() && records.every(record => own(record.target) || (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(own)))) return
    const relevant = node => {
      if (!node || own(node)) return false
      if (controls.some(control => control.seat && (node === control.seat || node.contains?.(control.seat)))) return true
      const candidates = [node, ...(node.querySelectorAll?.('[data-chat-node-key], [data-conversation-session]') || [])]
      return candidates.some(element => controls.some(control => control.identity.nodeKeys.includes(element.getAttribute?.('data-chat-node-key')) || element.getAttribute?.('data-conversation-session') === control.identity.sessionId))
    }
    if (records.some(record => record.type === 'attributes' ? relevant(record.target) : [...record.addedNodes, ...record.removedNodes].some(node => relevant(node) || own(node)))) locate()
  }) : null
  observer?.observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-conversation-session', 'data-chat-node-key'] })
  return {
    setStatus(identity, text) {
      if (disposed) return
      statusIdentity = normalize(identity)
      statusText = typeof text === 'string' ? text.slice(0, 300) : ''
      updateStates()
    },
    set(value) {
      if (disposed) return
      playing = normalize(value)
      pending = null
      updateStates()
    },
    setPending(value) {
      if (disposed) return
      pending = normalize(value)
      if (pending) playing = null
      updateStates()
    },
    setAvailable(values) {
      if (disposed) return
      const identities = []
      for (const value of Array.isArray(values) ? values : []) {
        const identity = normalize(value)
        if (identity && !identities.some(existing => sameReply(existing, identity))) identities.push(identity)
      }
      const unused = new Set(controls)
      const next = identities.map(identity => {
        const control = [...unused].find(control => sameReply(control.identity, identity)) || make(identity)
        unused.delete(control); control.identity = identity
        return control
      })
      for (const control of unused) remove(control)
      controls = next
      updateStates(); locate()
    },
    dispose() {
      if (disposed) return
      disposed = true; playing = null; pending = null
      observer?.disconnect()
      for (const control of controls) remove(control)
      controls = []; style.remove()
    },
  }
}
exports.installReadoutIndicator = installReadoutIndicator

return exports;})()

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

return exports;})()
    const readout = installReadout(ctx, document, require('react'))
    const disposeGesture = install(document, () => readout.stop('已停止：开始录音'), readout.getInputPreferences, readout.subscribeInputPreferences)
    return () => { disposeGesture(); readout.dispose() }
  }, 'voice-input-with-press: gesture and readout')
}

return module.exports;
}});
