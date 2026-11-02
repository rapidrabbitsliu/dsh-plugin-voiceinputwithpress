import { spawn as nodeSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { isAbsolute, dirname, join } from 'node:path';

export const TTS_PATH = '/api/voiceinputwithpress.tts';
export const VOICES = Object.freeze(['zf_001', 'zf_002', 'zm_010']);
export const LIMITS = Object.freeze({ requestBytes: 16384, responseBytes: 8 * 1024 * 1024,
  wavBytes: 44 + 24000 * 120 * 2, queue: 2, timeoutMs: 120000 });

export class TtsError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => new TtsError(status, code, message);

// Bounded metadata-only diagnostics. Never accept caller-supplied log paths or
// arbitrary error messages: those may contain spoken text, credentials or paths.
const LOG_KEYS = new Set(['requestId', 'code', 'status', 'durationMs', 'queueMs', 'synthesisMs', 'characters', 'voice', 'speed', 'queueDepth', 'bytes', 'pid', 'phonemes', 'segments', 'audioSeconds', 'g2pSeconds', 'inferenceSeconds', 'totalSeconds', 'rtf', 'englishDictionary', 'englishProductSpelling', 'englishProductMixed', 'englishAcronym', 'englishFallback']);
function statSyncSafe(path) { try { return statSync(path).size; } catch { return 0; } }
export function createDiagnosticLogger(config, { maxBytes = 1024 * 1024, backups = 2 } = {}) {
  const root = config.workerPath && join(dirname(config.workerPath), '..', '.local-tts', 'logs');
  const path = root && join(root, 'tts-host.jsonl');
  return (event, metadata = {}) => {
    if (!path) return;
    try {
      const entry = { time: new Date().toISOString(), event: /^[a-z_]{1,48}$/u.test(event) ? event : 'diagnostic_error' };
      for (const [key, value] of Object.entries(metadata)) {
        if (!LOG_KEYS.has(key)) continue;
        if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
        if (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(value)) entry[key] = value;
      }
      const line = JSON.stringify(entry) + '\n';
      mkdirSync(root, { recursive: true });
      let size = 0;
      try { size = statSync(path).size; } catch { /* first write */ }
      if (size + Buffer.byteLength(line) > maxBytes) {
        try { unlinkSync(`${path}.${backups}`); } catch { /* absent */ }
        for (let i = backups - 1; i >= 1; i--) {
          try { renameSync(`${path}.${i}`, `${path}.${i + 1}`); } catch { /* absent */ }
        }
        try { renameSync(path, `${path}.1`); } catch { /* absent */ }
      }
      // If rotation failed (permissions/locked file), drop diagnostics rather
      // than append beyond the cap. Synthesis remains independent of logging.
      if ((statSyncSafe(path)) + Buffer.byteLength(line) > maxBytes) return;
      appendFileSync(path, line, { encoding: 'utf8', mode: 0o600 });
    } catch { /* Diagnostics must never prevent synthesis or expose IO errors. */ }
  };
}

// Only trusted Host configuration is allowed to select executables or scripts.
// No environment discovery, client paths, shell expansion, or default opt-in.
export function normalizeConfig(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TTS config must be an object');
  if (value.ttsEnabled !== undefined && typeof value.ttsEnabled !== 'boolean') throw new Error('ttsEnabled must be boolean');
  const config = { ttsEnabled: value.ttsEnabled === true };
  for (const key of ['pythonPath', 'workerPath']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !isAbsolute(value[key]) || /[\x00\r\n]/u.test(value[key])) {
        throw new Error(`${key} must be an absolute Host path`);
      }
      config[key] = value[key];
    }
    if (config.ttsEnabled && !config[key]) throw new Error(`${key} is required when ttsEnabled is true`);
  }
  return Object.freeze(config);
}

// Standard Schema v1 is accepted by the current DSH loader. This standalone
// plugin does not need to add a schema-library runtime dependency.
export const Config = { '~standard': { version: 1, vendor: 'voiceinputwithpress', validate(value) {
  try { return { value: normalizeConfig(value) }; }
  catch (error) { return { issues: [{ message: error.message }] }; }
} } };

export function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['text', 'voice', 'speed'].includes(key))) {
    throw fail(400, 'invalid_request', 'Expected only text, voice and speed');
  }
  const { text, voice = VOICES[0], speed = 1 } = value;
  if (typeof text !== 'string') throw fail(400, 'invalid_text', 'Text must be a string');
  if (!text.trim()) throw fail(400, 'empty_text', 'Text must not be empty');
  if ([...text].length > 160) throw fail(400, 'text_too_long', 'Text exceeds 160 characters');
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) throw fail(400, 'unsupported_control', 'Text contains unsupported control characters');
  if (/[\uD800-\uDFFF]/u.test(text)) throw fail(400, 'invalid_unicode', 'Text contains unpaired surrogates');
  if (!VOICES.includes(voice)) throw fail(400, 'unsupported_voice', 'Unsupported voice');
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.7 || speed > 1.5) {
    throw fail(400, 'invalid_speed', 'speed must be between 0.7 and 1.5');
  }
  return { text: text.trim(), voice, speed };
}

/** Kill the launcher AND descendants. On Windows venv python.exe is a launcher:
 * killing only child.kill() leaves the model-owning base Python alive. */
export async function killProcessTree(child, { spawn = nodeSpawn, platform = process.platform } = {}) {
  if (!child.pid) return;
  if (platform === 'win32') {
    const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    await new Promise((resolve, reject) => {
      let killer;
      try { killer = spawn(executable, ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); }
      catch (error) { reject(error); return; }
      const timer = setTimeout(() => { killer.kill(); reject(new Error('taskkill timed out')); }, 10000);
      killer.once('error', error => { clearTimeout(timer); reject(error); });
      killer.once('close', code => {
        clearTimeout(timer);
        // 128 means already gone. If the launcher exited, no new worker is
        // started until this cleanup operation has completed.
        if (code === 0 || (code === 128 && child.exitCode !== null)) resolve();
        else reject(new Error('Unable to terminate TTS process tree'));
      });
    });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  // Ready may fail before the pump starts awaiting it.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

/** One lazy, long-lived JSONL subprocess; one active request, at most two waiting.
 * Cancellation/timeout invalidates the process to prevent stale JSONL responses
 * from being attributed to the next request. A replacement waits for tree kill. */
export class TtsHost {
  constructor(config, { spawn = nodeSpawn, killTree = killProcessTree, limits = LIMITS, logger } = {}) {
    this.config = normalizeConfig(config);
    this.logger = logger || createDiagnosticLogger(this.config);
    this.spawn = spawn; this.killTree = killTree; this.limits = limits;
    this.queue = []; this.active = null; this.session = null;
    this.stopped = false; this.cleaning = Promise.resolve(); this.cleanupFailed = false;
  }

  log(event, metadata = {}) { try { this.logger(event, metadata); } catch { /* injected logger isolation */ } }

  synthesize(input, { signal, requestId = randomUUID() } = {}) {
    let value;
    try { value = validateInput(input); } catch (error) {
      this.log('validation_error', { requestId, code: error.code, status: error.status });
      return Promise.reject(error);
    }
    this.log('validation_ok', { requestId, characters: [...value.text].length, voice: value.voice, speed: value.speed });
    if (!this.config.ttsEnabled) return Promise.reject(fail(503, 'disabled', 'Local TTS is disabled'));
    if (this.stopped || this.cleanupFailed) return Promise.reject(fail(503, 'unavailable', 'Local TTS is unavailable'));
    if (signal?.aborted) return Promise.reject(fail(499, 'aborted', 'Request aborted'));
    if (this.active && this.queue.length >= this.limits.queue) return Promise.reject(fail(429, 'queue_full', 'Local TTS queue is full'));
    return new Promise((resolve, reject) => {
      const job = { value, resolve, reject, signal, requestId, createdAt: Date.now(), done: false };
      this.log('queue_enter', { requestId, queueDepth: this.queue.length + (this.active ? 1 : 0) });
      const cancel = error => {
        if (job.done) return;
        this.finish(job, error);
        this.queue = this.queue.filter(item => item !== job);
        if (this.active === job && this.session) this.invalidate(this.session, error);
      };
      job.abort = () => cancel(fail(499, 'aborted', 'Request aborted'));
      job.timer = setTimeout(() => cancel(fail(504, 'timeout', 'Local TTS timed out')), this.limits.timeoutMs);
      signal?.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job);
      void this.pump();
    });
  }

  finish(job, error, result) {
    if (job.done) return;
    job.done = true; clearTimeout(job.timer);
    this.log(error ? (error.code === 'aborted' ? 'request_abort' : 'synthesis_error') : 'synthesis_success', {
      requestId: job.requestId, code: error?.code, status: error?.status,
      durationMs: Date.now() - job.createdAt, synthesisMs: job.synthesisAt ? Date.now() - job.synthesisAt : undefined,
      bytes: result?.length,
    });
    job.signal?.removeEventListener('abort', job.abort);
    if (error) job.reject(error); else job.resolve(result);
  }

  async pump() {
    if (this.active || this.stopped) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    this.log('queue_start', { requestId: job.requestId, queueMs: Date.now() - job.createdAt, queueDepth: this.queue.length });
    try {
      await this.cleaning;
      if (job.done) return;
      if (this.cleanupFailed || this.stopped) throw fail(503, 'unavailable', 'Local TTS is unavailable');
      const session = this.session || this.start();
      await session.ready.promise;
      if (job.done) return;
      const id = job.requestId;
      job.synthesisAt = Date.now();
      const response = deferred();
      session.pending = { id, ...response };
      const line = JSON.stringify({ id, ...job.value }) + '\n';
      if (Buffer.byteLength(line) > this.limits.requestBytes) throw fail(413, 'too_large', 'Request too large');
      session.child.stdin.write(line, error => {
        if (error) this.invalidate(session, fail(502, 'worker_failed', 'Local TTS worker failed'));
      });
      this.finish(job, null, await response.promise);
    } catch (error) {
      this.finish(job, error instanceof TtsError ? error : fail(502, 'worker_failed', 'Local TTS worker failed'));
    } finally {
      this.active = null;
      void this.pump();
    }
  }

  start() {
    const startedAt = Date.now();
    this.log('worker_start', { requestId: this.active?.requestId });
    // Misaki/jieba needs a writable dictionary cache. Keep temporary files
    // beside the trusted local worker/model installation, not in a shared
    // system temp directory (which can be inaccessible under Windows tokens).
    const tempPath = join(dirname(this.config.workerPath), '..', '.local-tts', 'tmp');
    mkdirSync(tempPath, { recursive: true });
    const child = this.spawn(this.config.pythonPath, ['-B', this.config.workerPath], {
      shell: false, windowsHide: true, detached: process.platform !== 'win32',
      cwd: dirname(this.config.workerPath), stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TEMP: tempPath, TMP: tempPath, TMPDIR: tempPath,
        PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1',
        HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', CUDA_VISIBLE_DEVICES: '-1' },
    });
    const session = { child, startedAt, ready: deferred(), initialized: false, pending: null, buffer: Buffer.alloc(0), invalid: false };
    this.session = session;
    const broken = () => this.invalidate(session, fail(502, 'worker_failed', 'Local TTS worker failed'));
    child.on('error', broken); child.on('close', broken);
    child.stdin.on('error', broken);
    child.stderr.on('data', () => {}); // Drain, never retain/log text or local paths.
    child.stdout.on('data', chunk => {
      if (session.invalid) return;
      // Even a chunk with multiple records cannot bypass the per-line cap.
      let offset = 0;
      while (offset < chunk.length && !session.invalid) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline;
        if (session.buffer.length + end - offset > this.limits.responseBytes) { broken(); return; }
        session.buffer = Buffer.concat([session.buffer, chunk.subarray(offset, end)]);
        if (newline < 0) break;
        const line = session.buffer; session.buffer = Buffer.alloc(0);
        this.record(session, line);
        offset = newline + 1;
      }
    });
    return session;
  }

  record(session, line) {
    try {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
      if (!session.initialized) {
        if (value.type !== 'ready' || value.provider !== 'CPUExecutionProvider' || value.sampleRate !== 24000
          || !Array.isArray(value.voices) || !VOICES.every(voice => value.voices.includes(voice))) throw new Error('Invalid ready');
        session.initialized = true;
        this.log('worker_ready', { requestId: this.active?.requestId, pid: session.child.pid, durationMs: Date.now() - session.startedAt });
        session.ready.resolve(); return;
      }
      const pending = session.pending;
      if (!pending || value.id !== pending.id) throw new Error('Unexpected response');
      session.pending = null;
      if (value.error) {
        pending.reject(fail(value.error.code === 'invalid_request' ? 400 : 502,
          value.error.code === 'invalid_request' ? 'invalid_request' : 'synthesis_failed',
          value.error.code === 'invalid_request' ? 'Text is unsupported by the local TTS model' : 'Local TTS synthesis failed'));
        return;
      }
      const encoded = value.audioBase64;
      if (value.mime !== 'audio/wav' || value.sampleRate !== 24000 || typeof encoded !== 'string'
        || encoded.length > Math.ceil(this.limits.wavBytes / 3) * 4 || encoded.length % 4
        || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) {
        session.pending = pending; throw new Error('Invalid WAV response');
      }
      const wav = Buffer.from(encoded, 'base64');
      if (wav.length < 44 || wav.length > this.limits.wavBytes || wav.toString('ascii', 0, 4) !== 'RIFF'
        || wav.toString('ascii', 8, 12) !== 'WAVE' || wav.readUInt32LE(4) !== wav.length - 8
        || wav.toString('ascii', 12, 16) !== 'fmt ' || wav.readUInt32LE(16) !== 16
        || wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 24000
        || wav.readUInt32LE(28) !== 48000 || wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16
        || wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44
        || (wav.length - 44) % 2 !== 0 || wav.length === 44) {
        session.pending = pending; throw new Error('Invalid WAV');
      }
      const metrics = { requestId: pending.id };
      for (const key of ['phonemes', 'segments', 'audioSeconds', 'g2pSeconds', 'inferenceSeconds', 'totalSeconds', 'rtf']) {
        if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1e7) metrics[key] = value[key];
      }
      for (const [path, key] of Object.entries({ dictionary: 'englishDictionary', 'product-spelling': 'englishProductSpelling', 'product-word-and-spelling': 'englishProductMixed', 'acronym-spelling': 'englishAcronym', 'unknown-letter-fallback': 'englishFallback' })) {
        const count = value.englishCounts?.[path];
        if (Number.isInteger(count) && count >= 0 && count <= 10000) metrics[key] = count;
      }
      this.log('worker_metrics', metrics);
      pending.resolve(wav);
    } catch {
      this.invalidate(session, fail(502, 'invalid_response', 'Invalid local TTS worker response'));
    }
  }

  invalidate(session, error) {
    if (session.invalid) return;
    session.invalid = true; session.buffer = Buffer.alloc(0);
    if (this.session === session) this.session = null;
    session.ready.reject(error); session.pending?.reject(error); session.pending = null;
    const requestId = this.active?.requestId;
    this.log('worker_error', { requestId, pid: session.child.pid, code: error.code, status: error.status });
    this.cleaning = this.cleaning.then(async () => {
      const startedAt = Date.now();
      this.log('worker_kill_start', { requestId, pid: session.child.pid });
      await this.killTree(session.child);
      this.log('worker_kill_success', { requestId, pid: session.child.pid, durationMs: Date.now() - startedAt });
    }).catch(() => {
      this.cleanupFailed = true; // Fail closed: never spawn over an unconfirmed tree kill.
      this.log('worker_kill_error', { requestId, pid: session.child.pid, code: 'cleanup_failed' });
    });
  }

  async stop() {
    this.stopped = true;
    const error = fail(503, 'stopped', 'Local TTS stopped');
    for (const job of this.queue.splice(0)) this.finish(job, error);
    if (this.active) this.finish(this.active, error);
    if (this.session) this.invalidate(this.session, error);
    await this.cleaning;
  }
}

async function readJson(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > LIMITS.requestBytes)) throw fail(413, 'too_large', 'Request too large');
  if (!request.body) throw fail(400, 'missing_body', 'Expected JSON body');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  let rejectRead;
  const interrupted = new Promise((resolve, reject) => { rejectRead = reject; });
  const abort = () => rejectRead(fail(499, 'aborted', 'Request aborted'));
  const timer = setTimeout(() => rejectRead(fail(408, 'request_timeout', 'Request body timed out')), 10000);
  request.signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (request.signal.aborted) throw fail(499, 'aborted', 'Request aborted');
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      size += value.byteLength;
      if (size > LIMITS.requestBytes) throw fail(413, 'too_large', 'Request too large');
      chunks.push(value);
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw fail(400, 'invalid_json', 'Invalid JSON'); }
  } finally {
    clearTimeout(timer); request.signal.removeEventListener('abort', abort);
    // Do not await stream cancellation: an untrusted producer may never finish.
    void reader.cancel().catch(() => {}); reader.releaseLock();
  }
}

/** Must only be mounted on connection.fetch (authenticated owner-only API). */
export function createTtsHandler(host) {
  return async request => {
    const requestId = randomUUID(), startedAt = Date.now();
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-tts-request-id': requestId };
    host.log('request', { requestId });
    try {
      if (request.method !== 'POST') { headers.allow = 'POST'; throw fail(405, 'method_not_allowed', 'Use POST'); }
      const origin = request.headers.get('origin');
      const site = request.headers.get('sec-fetch-site');
      // The node HTTP bridge deliberately uses http://dsh.internal as its
      // Fetch URL base. Compare the forwarded original Host authority instead;
      // the physical connection carrier already enforces scheme/Host/Origin
      // trust and authentication before dispatch (including HTTPS proxies).
      const authority = request.headers.get('host') || new URL(request.url).host;
      let originMatches = origin === null;
      if (origin !== null) {
        try {
          const parsed = new URL(origin);
          originMatches = ['http:', 'https:'].includes(parsed.protocol)
            && parsed.host === new URL(`${parsed.protocol}//${authority}`).host;
        } catch { originMatches = false; }
      }
      if (!originMatches || (site !== null && site !== 'same-origin')) {
        throw fail(403, 'forbidden', 'Same-origin requests only');
      }
      if (!host.config.ttsEnabled) throw fail(503, 'disabled', 'Local TTS is disabled');
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw fail(415, 'unsupported_media_type', 'Use application/json');
      }
      const wav = await host.synthesize(await readJson(request), { signal: request.signal, requestId });
      host.log('response_success', { requestId, status: 200, bytes: wav.length, durationMs: Date.now() - startedAt });
      return new Response(wav, { headers: { ...headers, 'content-type': 'audio/wav', 'content-length': String(wav.length) } });
    } catch (error) {
      const known = error instanceof TtsError ? error : request.signal.aborted
        ? fail(499, 'aborted', 'Request aborted') : fail(500, 'internal_error', 'Local TTS request failed');
      host.log('response_error', { requestId, code: known.code, status: known.status, durationMs: Date.now() - startedAt });
      return Response.json({ error: { code: known.code, message: known.message, requestId } }, { status: known.status, headers });
    }
  };
}
