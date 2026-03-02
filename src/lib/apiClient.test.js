import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  createQueryStream,
  getAgent,
  getAgents,
  getSkill,
  getSkills,
  getTool,
  getTools,
  setAccessToken
} from './apiClient.js';

function mockApiResponse(data = {}, options = {}) {
  const { status = 200, code = 0, msg = 'success' } = options;
  return new Response(JSON.stringify({ code, msg, data }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('apiClient auth header', () => {
  beforeEach(() => {
    setAccessToken('');
    globalThis.fetch = vi.fn();
  });

  it('adds bearer header for getAgents when token is set', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('token_abc');

    await getAgents();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/agents');
    expect(options.headers.Authorization).toBe('Bearer token_abc');
  });

  it('omits bearer header when token is cleared', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('token_abc');
    setAccessToken('');

    await getAgents();

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('adds bearer header for createQueryStream', async () => {
    globalThis.fetch.mockResolvedValue(new Response('{}', { status: 200 }));
    setAccessToken('query_token');

    await createQueryStream({
      message: 'hello',
      chatId: 'chat-1'
    });

    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/query');
    expect(options.headers.Authorization).toBe('Bearer query_token');
  });

  it('trims token before adding bearer header', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    setAccessToken('  trimmed_token  ');

    await getAgents();

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer trimmed_token');
  });
});

describe('apiClient agent/skill/tool endpoints', () => {
  beforeEach(() => {
    setAccessToken('');
    globalThis.fetch = vi.fn();
  });

  it('builds getAgent query with encoding', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse({}));

    await getAgent('demo Agent/1');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/agent?agentKey=demo+Agent%2F1');
  });

  it('builds getSkills with optional tag', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));

    await getSkills('slack gif');
    let [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/skills?tag=slack+gif');

    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    await getSkills();
    [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/skills');
  });

  it('builds getSkill detail query', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse({}));

    await getSkill('math_basic');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/skill?skillId=math_basic');
  });

  it('builds getTools with kind and tag', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));

    await getTools({ kind: 'frontend', tag: 'confirm dialog' });
    let [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/tools?tag=confirm+dialog&kind=frontend');

    globalThis.fetch.mockClear();
    globalThis.fetch.mockResolvedValue(mockApiResponse([]));
    await getTools();
    [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/tools');
  });

  it('builds getTool detail query', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse({}));

    await getTool('confirm_dialog');

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/ap/tool?toolName=confirm_dialog');
  });

  it('adds bearer header for new endpoint calls', async () => {
    globalThis.fetch.mockResolvedValue(mockApiResponse({}));
    setAccessToken('new_api_token');

    await getTool('confirm_dialog');

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer new_api_token');
  });
});

describe('apiClient ApiResponse.failure handling', () => {
  beforeEach(() => {
    setAccessToken('');
    globalThis.fetch = vi.fn();
  });

  it('propagates backend 400 error for invalid tools kind', async () => {
    const data = { detail: 'kind should be backend|frontend|action' };
    globalThis.fetch.mockResolvedValue(
      mockApiResponse(data, {
        status: 400,
        code: 400,
        msg: 'Invalid kind: invalid. Use backend|frontend|action'
      })
    );

    try {
      await getTools({ kind: 'invalid' });
      throw new Error('expected getTools to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Invalid kind: invalid. Use backend|frontend|action');
      expect(error.status).toBe(400);
      expect(error.code).toBe(400);
      expect(error.data).toEqual(data);
    }
  });

  it('propagates backend 400 error for unknown skillId', async () => {
    globalThis.fetch.mockResolvedValue(
      mockApiResponse(
        {},
        {
          status: 400,
          code: 400,
          msg: 'Unknown skillId: missing_skill'
        }
      )
    );

    await expect(getSkill('missing_skill')).rejects.toMatchObject({
      message: 'Unknown skillId: missing_skill',
      status: 400,
      code: 400,
      data: {}
    });
  });
});
