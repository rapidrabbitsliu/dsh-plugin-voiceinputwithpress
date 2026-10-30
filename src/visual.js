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
