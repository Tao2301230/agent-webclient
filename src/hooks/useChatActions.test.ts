import { createReplayState, replayEvent } from './useChatActions';

describe('replayEvent tool migration', () => {
  it('stores viewportKey from new MCP payload and keeps toolName for display', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'call_f1494c0a4c4646cc81a41585',
      toolName: 'email.search',
      viewportKey: 'viewport_email_search',
      runId: 'run_1',
      timestamp: 100,
    });

    const toolState = state.toolStates.get('call_f1494c0a4c4646cc81a41585');
    const nodeId = state.toolNodeById.get('call_f1494c0a4c4646cc81a41585');
    const node = nodeId ? state.timelineNodes.get(nodeId) : null;

    expect(toolState?.viewportKey).toBe('viewport_email_search');
    expect(toolState).not.toHaveProperty('toolApi');
    expect(node?.toolName).toBe('email.search');
    expect(node?.viewportKey).toBe('viewport_email_search');
  });

  it('falls back to legacy toolKey during compatibility period', () => {
    const state = createReplayState();

    replayEvent(state, {
      type: 'tool.start',
      toolId: 'tool_legacy',
      toolKey: 'legacy_viewport',
      timestamp: 100,
    });

    expect(state.toolStates.get('tool_legacy')?.viewportKey).toBe('legacy_viewport');
  });
});
