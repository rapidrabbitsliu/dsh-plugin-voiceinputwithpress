/* DOM adapter for the current experimental voice-input UI; no core patches. */
const LABELS = {
  start: ['Start recording', '开始录音'],
  stop: ['Stop and transcribe', '停止并识别'],
  cancel: ['Cancel', '取消'],
  send: ['Send message', '发送消息'],
}
const { createVisual } = require('./visual.js')
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
    const { installReadout } = require('./readout-client.js')
    const readout = installReadout(ctx, document, require('react'))
    const disposeGesture = install(document, () => readout.stop('已停止：开始录音'), readout.getInputPreferences, readout.subscribeInputPreferences)
    return () => { disposeGesture(); readout.dispose() }
  }, 'voice-input-with-press: gesture and readout')
}
