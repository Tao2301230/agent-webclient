import type { AppState } from '../context/types';
import { initVoiceRuntime } from './voiceRuntime';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;

  CONNECTING = 0;
  OPEN = 1;
  readyState = MockWebSocket.CONNECTING;
  binaryType = 'arraybuffer';
  url: string;
  sentFrames: string[] = [];
  private listeners = new Map<string, Array<(event?: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    });
  }

  addEventListener(type: string, handler: (event?: unknown) => void) {
    const current = this.listeners.get(type) || [];
    current.push(handler);
    this.listeners.set(type, current);
  }

  send(frame: string) {
    this.sentFrames.push(frame);
  }

  close() {
    this.readyState = 3;
  }

  emit(type: string, event?: unknown) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }
}

class HangingWebSocket {
  static instances: HangingWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;

  CONNECTING = 0;
  OPEN = 1;
  readyState = HangingWebSocket.CONNECTING;
  binaryType = 'arraybuffer';
  url: string;

  constructor(url: string) {
    this.url = url;
    HangingWebSocket.instances.push(this);
  }

  addEventListener() {
    return undefined;
  }

  send() {
    return undefined;
  }

  close() {
    this.readyState = 3;
  }
}

class MockAudioBuffer {
  duration: number;
  private channels: Float32Array[];

  constructor(channelCount: number, frameCount: number, sampleRate: number) {
    this.duration = frameCount / sampleRate;
    this.channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  }

  getChannelData(index: number) {
    return this.channels[index];
  }
}

class MockAudioBufferSource {
  buffer: MockAudioBuffer | null = null;

  connect() {
    return undefined;
  }

  start() {
    return undefined;
  }
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }

  createBuffer(channels: number, frameCount: number, sampleRate: number) {
    return new MockAudioBuffer(channels, frameCount, sampleRate) as unknown as AudioBuffer;
  }

  createBufferSource() {
    return new MockAudioBufferSource() as unknown as AudioBufferSourceNode;
  }
}

describe('voiceRuntime debug status', () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    MockWebSocket.instances = [];
    HangingWebSocket.instances = [];
    jest.useRealTimers();
    if (originalWindow) {
      (globalThis as unknown as { window?: Window & typeof globalThis }).window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    if (originalWebSocket) {
      (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as Record<string, unknown>).WebSocket;
    }
  });

  it('reports token errors and resets debug status to idle', async () => {
    const statuses: string[] = [];
    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: '' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    await expect(runtime.debugSpeakTtsVoice('hello')).rejects.toThrow(
      'voice access_token is required',
    );

    expect(statuses[statuses.length - 1]).toBe('error: voice access_token is required');

    runtime.resetVoiceRuntime();
    expect(statuses[statuses.length - 1]).toBe('idle');
  });

  it('tracks debug playback status transitions', async () => {
    const statuses: string[] = [];
    (globalThis as unknown as { window?: Window & typeof globalThis }).window = {
      location: { protocol: 'http:', host: 'localhost:3000' },
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
    } as Window & typeof globalThis;
    (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;

    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: 'token_abc', chatId: 'chat_1' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    const requestId = await runtime.debugSpeakTtsVoice('hello world');
    expect(statuses[statuses.length - 1]).toBe('socket open');

    const socket = MockWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.started',
        requestId,
        sampleRate: 24000,
        channels: 1,
      }),
    });
    expect(statuses[statuses.length - 1]).toBe('tts started');

    socket.emit('message', {
      data: new Uint8Array([0, 0, 0, 0]).buffer,
    });
    expect(statuses[statuses.length - 1]).toBe('playing (1 frames, 4 bytes)');

    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.done',
        requestId,
      }),
    });
    expect(statuses[statuses.length - 1]).toBe('done (1 frames, 4 bytes)');

    runtime.stopAllVoiceSessions('debug_stop', { mode: 'stop' });
    expect(statuses[statuses.length - 1]).toBe('stopped');
  });

  it('marks debug sessions with no audio payload as connected but no audio frames', async () => {
    const statuses: string[] = [];
    (globalThis as unknown as { window?: Window & typeof globalThis }).window = {
      location: { protocol: 'http:', host: 'localhost:3000' },
      WebSocket: MockWebSocket as unknown as typeof WebSocket,
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
    } as Window & typeof globalThis;
    (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;

    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: 'token_abc', chatId: 'chat_1' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    const requestId = await runtime.debugSpeakTtsVoice('hello world');
    const socket = MockWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.started',
        requestId,
        sampleRate: 24000,
        channels: 1,
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'tts.done',
        requestId,
      }),
    });

    expect(statuses[statuses.length - 1]).toBe('connected but no audio frames');
  });

  it('times out pending websocket handshakes instead of waiting forever', async () => {
    jest.useFakeTimers();

    const statuses: string[] = [];
    (globalThis as unknown as { window?: Window & typeof globalThis }).window = {
      location: { protocol: 'http:', host: 'localhost:3000' },
      WebSocket: HangingWebSocket as unknown as typeof WebSocket,
      AudioContext: MockAudioContext as unknown as typeof AudioContext,
      setTimeout,
      clearTimeout,
    } as Window & typeof globalThis;
    (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket =
      HangingWebSocket as unknown as typeof WebSocket;

    const runtime = initVoiceRuntime({
      getState: () => ({ accessToken: 'token_abc', chatId: 'chat_1' } as AppState),
      onPatchBlock: () => undefined,
      onRemoveInactiveBlocks: () => undefined,
      onDebugStatus: (status) => statuses.push(status),
    });

    const pending = runtime.debugSpeakTtsVoice('hello world');
    const assertion = expect(pending).rejects.toThrow('voice websocket connect timeout');
    await jest.advanceTimersByTimeAsync(8000);

    await assertion;
    expect(statuses[statuses.length - 1]).toBe('error: voice websocket connect timeout');
  });
});
