import { Config, TtsHost, createTtsHandler, TTS_PATH } from './src/tts-host.js';

export { Config };
export const inject = ['connection'];

// The authenticated owner-only connection API is the sole HTTP surface. Host
// configuration never crosses the Client request boundary. Construction is lazy:
// even an enabled plugin starts Python only on its first admitted synthesis.
export function apply(ctx, config = {}) {
  const host = new TtsHost(config);
  ctx.effect(() => () => host.stop(), 'voiceinputwithpress: stop TTS worker tree');
  ctx.effect(() => ctx.connection.fetch.register({
    path: TTS_PATH,
    methods: ['POST'],
    requestBody: 'streaming',
    fetch: createTtsHandler(host),
  }), 'voiceinputwithpress: authenticated TTS route');
}
