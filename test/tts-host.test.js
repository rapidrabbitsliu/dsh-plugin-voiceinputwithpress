import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { TtsHost, Config, normalizeConfig, validateInput, createTtsHandler, createDiagnosticLogger, killProcessTree, LIMITS, TTS_PATH } from '../src/tts-host.js';
import { apply, inject } from '../index.js';

const config = { ttsEnabled: true, pythonPath: resolve('.venv-tts/Scripts/python.exe'), workerPath: resolve('scripts/tts-worker.py') };
const tick = () => new Promise(resolve => setImmediate(resolve));
function wav() {
  const bytes = Buffer.alloc(48);
  bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40);
  return bytes;
}
const ready = { type: 'ready', voices: ['zf_001', 'zf_002', 'zm_010'], sampleRate: 24000, provider: 'CPUExecutionProvider' };
function harness(options = {}) {
  const children = [], kills = [], writes = [], spawns = [];
  const spawn = (...args) => {
    spawns.push(args);
    if (options.spawnError) throw new Error('secret path failure');
    const child = new EventEmitter();
    child.pid = 123 + children.length; child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, encoding, callback) { writes.push(JSON.parse(chunk)); callback(); } });
    children.push(child);
    if (options.autoReady !== false) queueMicrotask(() => child.stdout.write(JSON.stringify(ready) + '\n'));
    return child;
  };
  const host = new TtsHost(config, { logger: options.logger || (() => {}), spawn, killTree: async child => { kills.push(child.pid); await options.kill?.(); }, limits: { ...LIMITS, timeoutMs: 5000, ...options.limits } });
  const emit = value => children.at(-1).stdout.write(JSON.stringify(value) + '\n');
  const success = (overrides = {}) => emit({ id: writes.at(-1).id, mime: 'audio/wav', sampleRate: 24000, audioBase64: wav().toString('base64'), ...overrides });
  return { host, children, kills, writes, spawns, emit, success };
}
function request(body = { text: '你好' }, extras = {}) {
  return new Request('http://localhost/api/voiceinputwithpress.tts', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost', ...extras.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...Object.fromEntries(Object.entries(extras).filter(([key]) => key !== 'headers')),
  });
}

test('diagnostic file rotation is bounded and whitelists metadata without raw data', () => {
  const root = mkdtempSync(join(tmpdir(), 'tts-log-test-'));
  try {
    const logger = createDiagnosticLogger({ workerPath: join(root, 'scripts', 'worker.py') }, { maxBytes: 600, backups: 2 });
    for (let i = 0; i < 60; i++) logger('request', { requestId: 'safe-id', characters: 20, text: 'PRIVATE TEXT', audioBase64: 'SECRET', stderr: 'SECRET', code: 'C:\\secret\\path', authorization: 'SECRET' });
    const dir = join(root, '.local-tts', 'logs');
    const files = readdirSync(dir);
    assert.equal(files.length, 3);
    for (const file of files) {
      const data = readFileSync(join(dir, file), 'utf8');
      assert.ok(Buffer.byteLength(data) <= 600);
      assert.doesNotMatch(data, /PRIVATE|SECRET|secret|authorization|audioBase64|stderr|text/);
      for (const line of data.trim().split('\n')) assert.equal(JSON.parse(line).requestId, 'safe-id');
    }
    const blocked = createDiagnosticLogger({ workerPath: '\0' });
    assert.doesNotThrow(() => blocked('request', {}));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('diagnostic lifecycle correlates requests and ignores throwing logger', async () => {
  const entries = [], h = harness({ logger: (event, metadata) => entries.push({ event, ...metadata }) });
  const responsePromise = createTtsHandler(h.host)(request({ text: '你好 Safari' }));
  await tick();
  h.children[0].stderr.write('SECRET RAW STDERR');
  h.success({ phonemes: 42, segments: 2, inferenceSeconds: .5, englishCounts: { dictionary: 1, 'unknown-letter-fallback': 2, 'PRIVATE': 999 } });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-tts-request-id');
  assert.equal(h.writes[0].id, requestId);
  await h.host.stop();
  for (const event of ['request', 'validation_ok', 'queue_enter', 'queue_start', 'worker_start', 'worker_ready', 'worker_metrics', 'synthesis_success', 'response_success', 'worker_kill_success']) assert.ok(entries.some(entry => entry.event === event), event);
  assert.equal(entries.find(entry => entry.event === 'worker_metrics').englishFallback, 2);
  assert.doesNotMatch(JSON.stringify(entries), /Safari|SECRET|audioBase64|pythonPath|PRIVATE/);
  const broken = harness({ logger() { throw Error('IO failure'); } });
  const run = broken.host.synthesize({ text: '好' }); await tick(); broken.success(); await run; await broken.host.stop();
});

test('Host config opt-in, Standard Schema, absolute paths and lazy construction', async () => {
  assert.deepEqual(normalizeConfig(), { ttsEnabled: false });
  assert.deepEqual(Config['~standard'].validate({}).value, { ttsEnabled: false });
  for (const value of [null, [], { ttsEnabled: 'true' }, { ttsEnabled: true }, { pythonPath: 'python' }, { workerPath: '/tmp/evil\n' }]) {
    assert.ok(Config['~standard'].validate(value).issues);
  }
  let spawned = 0;
  const host = new TtsHost({}, { spawn() { spawned++; } });
  await assert.rejects(host.synthesize({ text: '你好' }), { status: 503, code: 'disabled' });
  await host.stop(); assert.equal(spawned, 0);
  const h = harness(); assert.equal(h.children.length, 0); await h.host.stop();
});

test('strict request fields, codepoint length, voice and finite speed validation', () => {
  assert.deepEqual(validateInput({ text: ' 你好 ' }), { text: '你好', voice: 'zf_001', speed: 1 });
  assert.equal(validateInput({ text: '你好 iOS Safari' }).text, '你好 iOS Safari');
  for (const [text, code] of [['', 'empty_text'], ['中'.repeat(161), 'text_too_long'], ['中\0', 'unsupported_control'], ['\ud800', 'invalid_unicode']]) {
    assert.throws(() => validateInput({ text }), { status: 400, code });
  }
  assert.equal([...validateInput({ text: '𠀀'.repeat(160), voice: 'zm_010', speed: .7 }).text].length, 160);
  for (const value of [null, [], {}, { text: ' ' }, { text: '中'.repeat(161) }, { text: '𠀀'.repeat(161) },
    { text: '中\0' }, { text: '\ud800' }, { text: '中', pythonPath: 'evil' },
    { text: '中', workerPath: 'evil' }, { text: '中', id: 'evil' }, { text: '中', voice: '../../x' },
    ...[true, null, '1', NaN, Infinity, .69, 1.51].map(speed => ({ text: '中', speed }))]) {
    assert.throws(() => validateInput(value), { status: 400 });
  }
});

test('one persistent shell-free worker, -B and serial bounded FIFO', async () => {
  const h = harness();
  const first = h.host.synthesize({ text: '一' });
  const second = h.host.synthesize({ text: '二' });
  const third = h.host.synthesize({ text: '三' });
  await assert.rejects(h.host.synthesize({ text: '四' }), { status: 429 });
  await tick();
  assert.equal(h.writes.length, 1); assert.equal(h.spawns.length, 1);
  assert.equal(h.spawns[0][0], config.pythonPath); assert.deepEqual(h.spawns[0][1], ['-B', config.workerPath]);
  assert.equal(h.spawns[0][2].shell, false); assert.deepEqual(h.spawns[0][2].stdio, ['pipe', 'pipe', 'pipe']);
  assert.equal(h.spawns[0][2].env.TEMP, resolve('.local-tts/tmp'));
  assert.equal(h.spawns[0][2].env.TMP, resolve('.local-tts/tmp'));
  assert.equal(h.spawns[0][2].env.TMPDIR, resolve('.local-tts/tmp'));
  h.success(); assert.deepEqual(await first, wav()); await tick();
  assert.equal(h.writes[1].text, '二'); h.success(); await second; await tick();
  assert.equal(h.writes[2].text, '三'); h.success(); await third;
  assert.equal(h.children.length, 1); await h.host.stop(); assert.deepEqual(h.kills, [123]);
});

test('queued abort does not kill active worker; already aborted never spawns', async () => {
  const h = harness(); const controller = new AbortController(); const already = AbortSignal.abort();
  await assert.rejects(h.host.synthesize({ text: '一' }, { signal: already }), { status: 499 });
  const first = h.host.synthesize({ text: '一' });
  const second = h.host.synthesize({ text: '二' }, { signal: controller.signal });
  controller.abort(); await assert.rejects(second, { status: 499 }); await tick();
  assert.equal(h.kills.length, 0); h.success(); await first; await h.host.stop();
});

test('active abort kills tree and replacement waits for cleanup', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const h = harness({ kill: () => gate }); const controller = new AbortController();
  const first = h.host.synthesize({ text: '一' }, { signal: controller.signal });
  const second = h.host.synthesize({ text: '二' }); await tick();
  controller.abort(); await assert.rejects(first, { status: 499 }); await tick();
  assert.equal(h.children.length, 1); assert.deepEqual(h.kills, [123]);
  release(); await tick(); assert.equal(h.children.length, 2); h.success(); await second; await h.host.stop();
});

test('initialization and synthesis timeout invalidate worker', async () => {
  for (const autoReady of [false, true]) {
    const h = harness({ autoReady, limits: { timeoutMs: 15 } });
    await assert.rejects(h.host.synthesize({ text: '一' }), { status: 504 });
    await h.host.stop(); assert.equal(h.kills.length, 1);
  }
});

test('stop rejects active and queued jobs, kills once, and prevents restart', async () => {
  const h = harness();
  const first = assert.rejects(h.host.synthesize({ text: '一' }), { status: 503 });
  const second = assert.rejects(h.host.synthesize({ text: '二' }), { status: 503 });
  await tick(); await h.host.stop(); await Promise.all([first, second]); await h.host.stop();
  assert.equal(h.kills.length, 1);
  await assert.rejects(h.host.synthesize({ text: '三' }), { status: 503 });
});

test('spawn failure and asynchronous exit/errors return sanitized 502', async () => {
  const h = harness({ spawnError: true });
  await assert.rejects(h.host.synthesize({ text: '一' }), error => error.status === 502 && !error.message.includes('secret'));
  await h.host.stop();
  for (const event of ['error', 'close']) {
    const x = harness(); const pending = x.host.synthesize({ text: '一' }); await tick();
    x.children[0].emit(event, new Error('secret')); await assert.rejects(pending, { status: 502 }); await x.host.stop();
  }
});

test('cleanup failure fails closed instead of launching a second worker', async () => {
  const h = harness({ kill: async () => { throw new Error('kill failed'); } });
  const first = h.host.synthesize({ text: '一' }); await tick(); h.children[0].emit('close');
  await assert.rejects(first, { status: 502 }); await tick();
  await assert.rejects(h.host.synthesize({ text: '二' }), { status: 503 });
  assert.equal(h.children.length, 1); await h.host.stop();
});

test('split JSONL chunks and drained stderr preserve valid WAV', async () => {
  const h = harness(); const pending = h.host.synthesize({ text: '一' }); await tick();
  h.children[0].stderr.write('private details'.repeat(100));
  const record = JSON.stringify({ id: h.writes[0].id, mime: 'audio/wav', sampleRate: 24000, audioBase64: wav().toString('base64') }) + '\n';
  h.children[0].stdout.write(record.slice(0, 23)); h.children[0].stdout.write(record.slice(23));
  assert.deepEqual(await pending, wav()); await h.host.stop();
});

test('invalid ready, wrong ids, bad JSON, oversized records and invalid WAV kill tree', async () => {
  for (const mode of ['ready', 'id', 'json', 'oversize', 'base64', 'wav', 'utf8']) {
    const h = harness({ autoReady: mode !== 'ready', limits: { responseBytes: 1024 } });
    const pending = h.host.synthesize({ text: '一' }); await tick();
    if (mode === 'ready') h.emit({ ...ready, provider: 'CUDAExecutionProvider' });
    if (mode === 'id') h.success({ id: 'wrong' });
    if (mode === 'json') h.children[0].stdout.write('not-json\n');
    if (mode === 'oversize') h.children[0].stdout.write('x'.repeat(1025));
    if (mode === 'base64') h.success({ audioBase64: '!!!!' });
    if (mode === 'wav') h.success({ audioBase64: Buffer.alloc(48).toString('base64') });
    if (mode === 'utf8') h.children[0].stdout.write(Buffer.from([255, 10]));
    await assert.rejects(pending, { status: 502 }); await h.host.stop(); assert.equal(h.kills.length, 1, mode);
  }
});

test('worker rejection is sanitized and next request reuses worker', async () => {
  const h = harness();
  for (const [code, status] of [['invalid_request', 400], ['synthesis_failed', 502]]) {
    const pending = h.host.synthesize({ text: '一' }); await tick();
    h.emit({ id: h.writes.at(-1).id, error: { code, message: 'private path' } });
    await assert.rejects(pending, error => error.status === status && !error.message.includes('private'));
  }
  assert.equal(h.children.length, 1); await h.host.stop();
});

test('route enforces origin, method, JSON/size/input, no-store and disabled gate', async () => {
  const h = harness(); const handler = createTtsHandler(h.host);
  const cases = [
    [new Request('http://localhost' + TTS_PATH), 405],
    [request(undefined, { headers: { origin: 'http://evil' } }), 403],
    [request(undefined, { headers: { origin: 'null' } }), 403],
    [request(undefined, { headers: { 'sec-fetch-site': 'same-site' } }), 403],
    [request(undefined, { headers: { 'content-type': 'text/plain' } }), 415],
    [request('{'), 400], [request({ text: '\u0000' }), 400],
    [request({ text: '中', pythonPath: 'evil' }), 400],
    [request(undefined, { headers: { 'content-length': '16385' } }), 413],
    [request(' '.repeat(16385)), 413],
  ];
  for (const [req, status] of cases) {
    const response = await handler(req); assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const error = (await response.json()).error;
    assert.ok(error.code);
    assert.equal(error.requestId, response.headers.get('x-tts-request-id'));
    assert.match(error.requestId, /^[a-f0-9-]{36}$/u);
  }
  assert.equal(h.children.length, 0); await h.host.stop();
  const disabled = new TtsHost({});
  const response = await createTtsHandler(disabled)(request()); assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'disabled'); await disabled.stop();
});

test('bridge internal URL preserves same-origin Host including HTTPS reverse proxy', async () => {
  const disabled = new TtsHost({});
  const handler = createTtsHandler(disabled);
  const good = new Request('http://dsh.internal' + TTS_PATH, { method: 'POST', headers: { host: 'secure.example', origin: 'https://secure.example', 'sec-fetch-site': 'same-origin' } });
  assert.equal((await handler(good)).status, 503); // Disabled, not false cross-origin.
  const bad = new Request('http://dsh.internal' + TTS_PATH, { method: 'POST', headers: { host: 'secure.example', origin: 'https://evil.example' } });
  assert.equal((await handler(bad)).status, 403);
  await disabled.stop();
});

test('stalled request body abort does not wait for producer', async () => {
  const h = harness(); const controller = new AbortController();
  const body = new ReadableStream({ pull() { return new Promise(() => {}); } });
  const req = new Request('http://localhost' + TTS_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half', signal: controller.signal });
  const pending = createTtsHandler(h.host)(req); await tick(); controller.abort();
  assert.equal((await pending).status, 499); assert.equal(h.children.length, 0); await h.host.stop();
});

test('route returns binary WAV and no-store, propagates abort', async () => {
  const h = harness(); const handler = createTtsHandler(h.host);
  const pending = handler(request()); await tick(); h.success();
  const response = await pending;
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('content-length'), '48');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), wav());
  const controller = new AbortController(); const aborted = handler(request(undefined, { signal: controller.signal }));
  await tick(); controller.abort(); assert.equal((await aborted).status, 499); await h.host.stop();
});

test('Host lifecycle registers only authenticated exact streaming POST and removes on stop', async () => {
  const disposers = []; let route, removed = 0;
  const ctx = { connection: { fetch: { register(value) { route = value; return async () => { removed++; }; } } },
    effect(factory) { const dispose = factory(); disposers.push(dispose); return dispose; } };
  apply(ctx); assert.deepEqual(inject, ['connection']);
  assert.equal(route.path, TTS_PATH); assert.deepEqual(route.methods, ['POST']); assert.equal(route.requestBody, 'streaming');
  assert.equal((await route.fetch(request())).status, 503);
  for (const dispose of disposers.reverse()) await dispose(); assert.equal(removed, 1);
});

test('Windows tree kill uses absolute taskkill /PID /T /F without shell', async () => {
  const calls = [];
  await killProcessTree({ pid: 42, exitCode: null }, { platform: 'win32', spawn(...args) {
    calls.push(args); const child = new EventEmitter(); queueMicrotask(() => child.emit('close', 0)); return child;
  } });
  assert.ok(calls[0][0].endsWith('System32\\taskkill.exe'));
  assert.deepEqual(calls[0][1], ['/PID', '42', '/T', '/F']); assert.equal(calls[0][2].shell, false);
});

// Explicit local smoke only: no network, no DSH route registration or service
// changes. Invoked by setting TTS_HOST_SMOKE=1; models must already exist.
test('actual existing CPU worker bridge smoke', { skip: process.env.TTS_HOST_SMOKE !== '1', timeout: 180000 }, async () => {
  const events = [], fileLogger = createDiagnosticLogger(config);
  const host = new TtsHost(config, { logger(event, metadata) { events.push({ event, ...metadata }); fileLogger(event, metadata); } });
  try {
    const first = await host.synthesize({ text: '你好，iOS Safari和ChatGPT开始本地测试。', voice: 'zf_001', speed: 1 });
    const pid = host.session.child.pid;
    const second = await host.synthesize({ text: '这是第二次测试。', voice: 'zm_010', speed: 1.1 });
    assert.equal(host.session.child.pid, pid);
    assert.ok(first.length > 44); assert.ok(second.length > 44);
    const metrics = events.filter(entry => entry.event === 'worker_metrics');
    assert.equal(metrics.length, 2);
    assert.ok(metrics[0].phonemes > 0 && metrics[0].segments > 0 && metrics[0].inferenceSeconds > 0);
    assert.ok(metrics[0].englishProductSpelling > 0 && metrics[0].englishProductMixed > 0);
    console.log(JSON.stringify({ smoke: 'cpu-tts-host', firstWavBytes: first.length, secondWavBytes: second.length, persistentWorkerPid: pid, metrics }));
  } finally { await host.stop(); assert.equal(host.cleanupFailed, false, 'worker tree termination confirmed'); }
});
