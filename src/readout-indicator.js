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
