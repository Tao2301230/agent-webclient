import type { AgentEvent } from '../context/types';

export function resolveViewportKey(event: Pick<AgentEvent, 'viewportKey' | 'toolKey'>): string {
  return String(event.viewportKey || event.toolKey || '').trim();
}

export function pickToolName(...candidates: Array<unknown>): string {
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (text) return text;
  }
  return '';
}
