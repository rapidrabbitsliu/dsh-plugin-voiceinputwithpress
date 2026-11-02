import { readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
// DSH's browser loader expects a lazy CommonJS module factory, not ESM.
if (/\b(?:import|export)\s/.test(source)) throw new Error('Client source must be CommonJS')
const visual = await readFile(new URL('../src/visual.js', import.meta.url), 'utf8')
const visualModule = `(function(){const exports={};\n${visual}\nreturn exports;})()`
const text = await readFile(new URL('../src/readout-text.js', import.meta.url), 'utf8')
const textModule = `(function(){const exports={};\n${text}\nreturn exports;})()`
const readout = await readFile(new URL('../src/readout-client.js', import.meta.url), 'utf8')
const indicator = await readFile(new URL('../src/readout-indicator.js', import.meta.url), 'utf8')
const indicatorModule = `(function(){const exports={};\n${indicator}\nreturn exports;})()`
const readoutModule = `(function(){const exports={};\n${readout.replace("require('./readout-text.js')", textModule).replace("require('./readout-indicator.js')", indicatorModule)}\nreturn exports;})()`
const inline = source.replace("require('./visual.js')", visualModule).replace("require('./readout-client.js')", readoutModule)
const bundle = `window.__ModuleLoader__.load({id:"dsh-plugin-voiceinputwithpress",factory:(require)=>{\nconst module={exports:{}};const exports=module.exports;\n${inline}\nreturn module.exports;\n}});\n`
await writeFile(new URL('../client.js', import.meta.url), bundle)
