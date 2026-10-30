import { readFile, writeFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
// DSH's browser loader expects a lazy CommonJS module factory, not ESM.
if (/\b(?:import|export)\s/.test(source)) throw new Error('Client source must be CommonJS')
const visual = await readFile(new URL('../src/visual.js', import.meta.url), 'utf8')
const visualModule = `(function(){const exports={};\n${visual}\nreturn exports;})()`
const inline = source.replace("require('./visual.js')", visualModule)
const bundle = `window.__ModuleLoader__.load({id:"dsh-plugin-voiceinputwithpress",factory:(require)=>{\nconst module={exports:{}};const exports=module.exports;\n${inline}\nreturn module.exports;\n}});\n`
await writeFile(new URL('../client.js', import.meta.url), bundle)
