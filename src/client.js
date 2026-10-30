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
function install(doc = document) {
  let run = null, disposed = false
  const win = doc.defaultView
  // The start label is rendered only when the native voice provider is usable.
  // Keep setup and disabled controls visible; hiding the usable button does not
  // disable its programmatic click. Native recording controls remain available.
  const style = doc.createElement?.('style')
  if (style) {
    style.textContent = `
      [data-composer-card] button[aria-label="Start recording"],
      [data-composer-card] button[aria-label="开始录音"],
      [data-composer-card] span:has(> button[aria-label="Start recording"]),
      [data-composer-card] span:has(> button[aria-label="开始录音"]),
      [data-composer-card] div:has(> span > button[aria-label="Start recording"]),
      [data-composer-card] div:has(> span > button[aria-label="开始录音"]) { display: none !important; }
      [data-composer-card]:has(button[aria-label="Start recording"]:not(:disabled)) [data-composer-placeholder],
      [data-composer-card]:has(button[aria-label="开始录音"]:not(:disabled)) [data-composer-placeholder] { font-size: 0; }
      [data-composer-card]:has(button[aria-label="Start recording"]:not(:disabled)) [data-composer-placeholder]::after,
      [data-composer-card]:has(button[aria-label="开始录音"]:not(:disabled)) [data-composer-placeholder]::after {
        content: "Hold to speak · Release to send · Slide up to cancel";
        font-size: 13px; line-height: inherit;
      }
      [data-composer-card]:has(button[aria-label="开始录音"]:not(:disabled)) [data-composer-placeholder]::after {
        content: "长按说话，松开发送，上滑取消";
      }
      html[data-press-selection-lock], html[data-press-selection-lock] *, [data-press-gesture], [data-press-gesture] * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }
      [data-composer-card]:has([data-composer-placeholder]):has(button[aria-label="开始录音"]) [data-composer-input],
      [data-composer-card]:has([data-composer-placeholder]):has(button[aria-label="Start recording"]) [data-composer-input] { -webkit-touch-callout: none; touch-action: none; }
    `
    ;(doc.head || doc.documentElement).appendChild(style)
  }
  const unlockSelection = r => {
    if (!r?.selectionLocked) return
    r.selectionLocked = false
    doc.documentElement?.removeAttribute('data-press-selection-lock')
    r.input.removeAttribute?.('data-press-gesture')
    if (r.observer) win.getSelection?.()?.removeAllRanges()
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
    if (disposed || run || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const input = e.target instanceof win.Element ? e.target.closest('[data-composer-input][contenteditable="true"]') : null
    const card = input?.closest('[data-composer-card]'), session = card?.closest('[data-conversation-session]')
    if (!card || !session || !button(card, LABELS.start) || card.querySelector('[data-voice-activity]')) return
    // Placeholder is rendered only when the draft AND attachment list are empty.
    const empty = !!card.querySelector('[data-composer-placeholder]') && !input.textContent && !input.querySelector('[data-composer-chip], [data-composer-command], [contenteditable="false"]')
    if (!empty) return
    const r = run = { input, card, session, sessionId: session.getAttribute('data-conversation-session'), id: e.pointerId, x: e.clientX, y: e.clientY, safe: empty, released: false, stopped: false, sawActive: false, sawTranscribing: false, inserted: false, cancelled: false }
    // Safari's prevention must not intercept desktop mousedown/caret focus.
    r.pointerType = e.pointerType
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      input.setAttribute?.('data-press-gesture', '')
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
      win.getSelection?.()?.removeAllRanges()
      input.blur?.()
      r.visual = createVisual(doc, win, card)
      r.visual.update('requesting', false, 0)
      r.observer.observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-voice-activity', 'contenteditable', 'disabled'] })
      r.timeout = setTimeout(() => { cancel(r); clear() }, TIMEOUT_MS)
      start.click(); check(r)
    }, HOLD_MS)
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
    r.released = true
    unlockSelection(r)
    if (!r.observer) {
      const focus = r.nativeTouchBlocked || r.pointerType === 'mouse'
      clear()
      if (focus && live(r) && doc.activeElement !== r.input && (e.target === r.input || r.input.contains(e.target))) r.input.focus?.({ preventScroll: true })
      return
    }
    if (r.armed) { cancel(r); return }
    check(r)
  }
  function pointerCancel(e) { if (run && e.pointerId === run.id) cancel(run) }
  function edit(e) { if (run && e.target === run.input) run.safe = false }
  function nativeSelection(e) {
    if (run?.selectionLocked) e.preventDefault()
  }
  function selectionChanged() {
    if (!run?.selectionLocked || !run.observer) return
    const selection = win.getSelection?.()
    if (selection?.rangeCount) selection.removeAllRanges()
  }
  function touchStart(e) {
    const r = run
    if (!r || r.released || !(e.target === r.input || r.input.contains(e.target))) return
    // WebKit's caret magnifier is initiated by touchstart, not selectstart.
    // Cancel it before the native recognizer starts; short taps focus on release.
    if (e.cancelable !== false) {
      e.preventDefault()
      r.nativeTouchBlocked = true
      r.input.blur?.()
      win.getSelection?.()?.removeAllRanges()
    }
  }
  function touchMove(e) {
    if (run?.selectionLocked && run.observer) { e.preventDefault(); selectionChanged() }
  }
  function blur() { if (run) cancel(run) }
  function visibility() { if (doc.hidden && run) cancel(run) }
  doc.addEventListener('pointerdown', pointerDown, true); doc.addEventListener('pointermove', pointerMove, { capture: true, passive: false })
  doc.addEventListener('pointerup', pointerUp, true); doc.addEventListener('pointercancel', pointerCancel, true)
  doc.addEventListener('beforeinput', edit, true); doc.addEventListener('input', edit, true)
  doc.addEventListener('touchstart', touchStart, { capture: true, passive: false })
  doc.addEventListener('touchmove', touchMove, { capture: true, passive: false })
  doc.addEventListener('selectionchange', selectionChanged)
  doc.addEventListener('selectstart', nativeSelection, true); doc.addEventListener('contextmenu', nativeSelection, true)
  doc.addEventListener('visibilitychange', visibility); win.addEventListener('blur', blur)
  return () => {
    disposed = true; if (run) { cancel(run); clear() }
    style?.remove()
    doc.removeEventListener('pointerdown', pointerDown, true); doc.removeEventListener('pointermove', pointerMove, true)
    doc.removeEventListener('pointerup', pointerUp, true); doc.removeEventListener('pointercancel', pointerCancel, true)
    doc.removeEventListener('beforeinput', edit, true); doc.removeEventListener('input', edit, true)
    doc.removeEventListener('touchstart', touchStart, true)
    doc.removeEventListener('touchmove', touchMove, true)
    doc.removeEventListener('selectionchange', selectionChanged)
    doc.removeEventListener('selectstart', nativeSelection, true); doc.removeEventListener('contextmenu', nativeSelection, true)
    doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('blur', blur)
  }
}
exports.install = install
exports.apply = function apply(ctx) { ctx.effect(() => install(document), 'voice-input-with-press: DOM adapter') }
