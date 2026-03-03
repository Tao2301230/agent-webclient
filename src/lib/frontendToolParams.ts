interface ToolEvent {
  toolId?: string;
  toolParams?: Record<string, unknown>;
  function?: { arguments?: unknown };
  arguments?: Record<string, unknown> | string;
}

function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const trimmed = raw.trim();
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('arguments JSON must be an object');
  }
  return parsed as Record<string, unknown>;
}

function clipSnippet(raw: unknown): string {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= 180) {
    return text;
  }
  return `${text.slice(0, 180)}...`;
}

export interface FrontendToolParamsResult {
  found: boolean;
  source: string;
  params: Record<string, unknown> | null;
  error?: string;
}

export function parseFrontendToolParams(event: ToolEvent): FrontendToolParamsResult {
  const toolId = String(event?.toolId || '').trim();
  const fromToolParams = event?.toolParams;
  if (fromToolParams && typeof fromToolParams === 'object' && !Array.isArray(fromToolParams)) {
    return {
      found: true,
      source: 'toolParams',
      params: fromToolParams,
    };
  }

  const fnArgs = event?.function?.arguments;
  if (fnArgs && typeof fnArgs === 'object' && !Array.isArray(fnArgs)) {
    return {
      found: true,
      source: 'function.arguments',
      params: fnArgs as Record<string, unknown>,
    };
  }
  if (typeof fnArgs === 'string' && fnArgs.trim()) {
    try {
      return {
        found: true,
        source: 'function.arguments',
        params: safeParseJsonObject(fnArgs) || {},
      };
    } catch (error) {
      return {
        found: true,
        source: 'function.arguments',
        params: {},
        error: `[tool:${toolId || 'unknown'}] parse function.arguments failed: ${(error as Error).message}; raw=${clipSnippet(fnArgs)}`,
      };
    }
  }

  const rawArgs = event?.arguments;
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    return {
      found: true,
      source: 'arguments',
      params: rawArgs as Record<string, unknown>,
    };
  }
  if (typeof rawArgs === 'string' && rawArgs.trim()) {
    try {
      return {
        found: true,
        source: 'arguments',
        params: safeParseJsonObject(rawArgs) || {},
      };
    } catch (error) {
      return {
        found: true,
        source: 'arguments',
        params: {},
        error: `[tool:${toolId || 'unknown'}] parse arguments failed: ${(error as Error).message}; raw=${clipSnippet(rawArgs)}`,
      };
    }
  }

  return {
    found: false,
    source: '',
    params: null,
  };
}
