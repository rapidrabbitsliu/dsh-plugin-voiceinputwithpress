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
    // Suppress native selection before Safari's long-press recognizer starts.
    input.setAttribute?.('data-press-gesture', '')
    r.selectionLocked = true
    doc.documentElement?.setAttribute('data-press-selection-lock', '')
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
      const focus = r.nativeTouchBlocked
      clear()
      if (focus) r.input.focus?.({ preventScroll: true })
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

return module.exports;
}});
