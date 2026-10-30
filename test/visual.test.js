import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'

test('waveform reads native role=img SVG, not preceding cancel icon', () => {
  class El {
    constructor() { this.attrs = {}; this.style = { setProperty() {} }; this.children = []; this.isConnected = true }
    setAttribute(k,v) { this.attrs[k] = v }
    getAttribute(k) { return this.attrs[k] ?? null }
    removeAttribute(k) { delete this.attrs[k] }
    appendChild(el) { this.children.push(el) }
    remove() { this.removed = true }
    querySelector(name) { return this.parts?.[name] }
  }
  const parts = Object.fromEntries(['.pv-card','.pv-wave','.pv-orb','.pv-message','.pv-card-label','.pv-track'].map(k=>[k,new El()]))
  let root, selector, frame
  const doc = { head: new El(), body: new El(), createElement(tag) { const el = new El(); if(tag === 'div') { root=el; el.parts=parts }; return el }, createElementNS() { return new El() } }
  let span = 36
  const native = { viewBox:{baseVal:{height:40}}, querySelectorAll() { return Array.from({length:80},()=>({getAttribute(k) {return k === 'y1' ? String(20-span/2) : String(20+span/2)}})) } }
  const card = new El()
  card.getBoundingClientRect = () => ({left:0,top:0,width:400,height:100})
  card.querySelector = s => {selector=s; return s.endsWith('svg[role="img"]') ? native : {querySelectorAll:()=>[]} }
  const win = { requestAnimationFrame(fn) { frame=fn; return 1 }, cancelAnimationFrame() {} }
  const exports={}
  vm.runInNewContext(readFileSync(new URL('../src/visual.js',import.meta.url),'utf8'),{exports})
  const visual=exports.createVisual(doc,win,card)
  visual.update('recording',false,0); frame()
  assert.match(selector,/svg\[role="img"\]/)
  assert.equal(parts['.pv-wave'].children[0].getAttribute('y1'),'7')
  assert.notEqual(parts['.pv-orb'].style.transform,'scale(1)')
  span=2; frame()
  assert.equal(parts['.pv-wave'].children[0].getAttribute('y1'),'39')
  visual.dispose(); assert.equal(root.removed,true)
})
