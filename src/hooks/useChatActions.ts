import { useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { getAgents, getChats, getChat, setAccessToken } from '../lib/apiClient';
import type { Chat, Agent, AgentEvent, TimelineNode, Plan, PlanRuntime, ToolState } from '../context/types';
import { parseContentSegments } from '../lib/contentSegments';
import { parseFrontendToolParams } from '../lib/frontendToolParams';

/**
 * Safely extract a string value from an event field.
 */
function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return String(value);
}

/**
 * Replay state — mutable structure used during synchronous event replay.
 * Avoids React batching issues by building up the full timeline locally,
 * then dispatching the complete result via BATCH_UPDATE.
 */
interface ReplayState {
  timelineNodes: Map<string, TimelineNode>;
  timelineOrder: string[];
  contentNodeById: Map<string, string>;
  reasoningNodeById: Map<string, string>;
  toolNodeById: Map<string, string>;
  toolStates: Map<string, ToolState>;
  chatAgentById: Map<string, string>;
  timelineCounter: number;
  activeReasoningKey: string;
  chatId: string;
  runId: string;
  events: AgentEvent[];
  debugLines: string[];
  plan: Plan | null;
  planRuntimeByTaskId: Map<string, PlanRuntime>;
  planCurrentRunningTaskId: string;
  planLastTouchedTaskId: string;
}

function createReplayState(): ReplayState {
  return {
    timelineNodes: new Map(),
    timelineOrder: [],
    contentNodeById: new Map(),
    reasoningNodeById: new Map(),
    toolNodeById: new Map(),
    toolStates: new Map(),
    chatAgentById: new Map(),
    timelineCounter: 0,
    activeReasoningKey: '',
    chatId: '',
    runId: '',
    events: [],
    debugLines: [],
    plan: null,
    planRuntimeByTaskId: new Map(),
    planCurrentRunningTaskId: '',
    planLastTouchedTaskId: '',
  };
}

/**
 * Process a single event into the mutable replay state.
 * This mirrors useAgentEventHandler logic but writes to mutable state.
 */
function replayEvent(rs: ReplayState, event: AgentEvent): void {
  const type = String(event.type || '');
  rs.events.push(event);

  /* request.query */
  if (type === 'request.query') {
    const text = safeText(event.message);
    if (text) {
      const nodeId = `user_${event.requestId || rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'message', role: 'user', text,
        ts: event.timestamp || Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* run.start */
  if (type === 'run.start') {
    if (event.runId) rs.runId = event.runId;
    if (event.chatId) rs.chatId = event.chatId;
    if (event.agentKey && (event.chatId || rs.chatId)) {
      rs.chatAgentById.set(event.chatId || rs.chatId, String(event.agentKey));
    }
    return;
  }

  /* run.end / run.complete / run.error */
  if (type === 'run.end' || type === 'run.error' || type === 'run.complete') {
    if (type === 'run.error' && event.error) {
      const nodeId = `sys_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'message', role: 'system',
        text: safeText(event.error), ts: Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* content.start */
  if (type === 'content.start' && event.contentId) {
    const contentId = String(event.contentId);
    if (!rs.contentNodeById.has(contentId)) {
      const nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      const text = typeof event.text === 'string' ? event.text : '';
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'content', contentId, text,
        segments: text ? parseContentSegments(contentId, text) : [],
        ts: event.timestamp || Date.now(),
      });
      rs.timelineOrder.push(nodeId);
    }
    return;
  }

  /* content.delta */
  if (type === 'content.delta' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    if (!nodeId) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const delta = typeof event.delta === 'string' ? event.delta : '';
    const newText = (existing?.text || '') + delta;
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'content', contentId, text: newText,
      segments: parseContentSegments(contentId, newText),
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    return;
  }

  /* content.end */
  if (type === 'content.end' && event.contentId) {
    const contentId = String(event.contentId);
    const nodeId = rs.contentNodeById.get(contentId);
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        const finalText = typeof event.text === 'string' && event.text.trim()
          ? event.text : existing.text || '';
        rs.timelineNodes.set(nodeId, {
          ...existing, text: finalText,
          segments: parseContentSegments(contentId, finalText),
          status: 'completed',
        });
      }
    }
    return;
  }

  /* content.snapshot */
  if (type === 'content.snapshot' && event.contentId) {
    const contentId = String(event.contentId);
    let nodeId = rs.contentNodeById.get(contentId);
    if (!nodeId) {
      nodeId = `content_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.contentNodeById.set(contentId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const text = typeof event.text === 'string' ? event.text : '';
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'content', contentId, text,
      segments: parseContentSegments(contentId, text),
      status: 'completed',
      ts: event.timestamp || Date.now(),
    });
    return;
  }

  /* reasoning */
  if (type === 'reasoning.start' || type === 'reasoning.delta') {
    let reasoningKey = event.reasoningId ? String(event.reasoningId) : '';
    if (!reasoningKey) {
      if (type === 'reasoning.start' || !rs.activeReasoningKey) {
        reasoningKey = `implicit_reasoning_${rs.timelineCounter}`;
      } else {
        reasoningKey = rs.activeReasoningKey;
      }
    }
    rs.activeReasoningKey = reasoningKey;

    const delta = typeof event.delta === 'string' ? event.delta : '';
    const eventText = typeof event.text === 'string' ? event.text : '';
    let nodeId = rs.reasoningNodeById.get(reasoningKey);
    if (!nodeId) {
      nodeId = `thinking_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.reasoningNodeById.set(reasoningKey, nodeId);
      rs.timelineOrder.push(nodeId);
      rs.timelineNodes.set(nodeId, {
        id: nodeId, kind: 'thinking', text: eventText || delta,
        status: 'running', expanded: false,
        ts: event.timestamp || Date.now(),
      });
    } else {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        rs.timelineNodes.set(nodeId, {
          ...existing, text: (existing.text || '') + delta,
          status: 'running',
        });
      }
    }
    return;
  }

  if (type === 'reasoning.end' || type === 'reasoning.snapshot') {
    const reasoningKey = event.reasoningId ? String(event.reasoningId) : (rs.activeReasoningKey || `implicit_snap_${rs.timelineCounter}`);
    let nodeId = rs.reasoningNodeById.get(reasoningKey);
    if (!nodeId) {
      /* Create node if it doesn't exist — matches original ensureReasoningNode */
      nodeId = `thinking_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.reasoningNodeById.set(reasoningKey, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const text = typeof event.text === 'string' ? event.text : (existing?.text || '');
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'thinking', text, status: 'completed', expanded: false,
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    rs.activeReasoningKey = '';
    return;
  }

  /* tool.start / tool.snapshot */
  if (type === 'tool.start' || type === 'tool.snapshot') {
    const toolId = event.toolId || '';
    if (!toolId) return;
    let nodeId = rs.toolNodeById.get(toolId);
    if (!nodeId) {
      nodeId = `tool_${rs.timelineCounter}`;
      rs.timelineCounter++;
      rs.toolNodeById.set(toolId, nodeId);
      rs.timelineOrder.push(nodeId);
    }
    const existing = rs.timelineNodes.get(nodeId);
    const params = parseFrontendToolParams(event);
    const resolvedParams = params.found && params.params ? params.params : null;
    const argsText = resolvedParams
      ? JSON.stringify(resolvedParams, null, 2)
      : (existing?.argsText || '');
    rs.timelineNodes.set(nodeId, {
      id: nodeId, kind: 'tool', toolId,
      toolName: event.toolName || existing?.toolName || toolId,
      toolApi: event.toolApi || existing?.toolApi || '',
      description: event.description || existing?.description || '',
      argsText,
      status: type === 'tool.snapshot' ? 'completed' : 'running',
      result: existing?.result || null,
      ts: event.timestamp || existing?.ts || Date.now(),
    });
    /* Also update toolStates for the Tools debug tab */
    const existingTs = rs.toolStates.get(toolId);
    rs.toolStates.set(toolId, {
      toolId,
      argsBuffer: existingTs?.argsBuffer || '',
      toolName: event.toolName || existingTs?.toolName || '',
      toolType: event.toolType || existingTs?.toolType || '',
      toolKey: event.toolKey || existingTs?.toolKey || '',
      toolTimeout: event.toolTimeout ?? existingTs?.toolTimeout ?? null,
      toolApi: event.toolApi || existingTs?.toolApi || '',
      toolParams: resolvedParams || existingTs?.toolParams || null,
      description: event.description || existingTs?.description || '',
      runId: event.runId || existingTs?.runId || rs.runId,
    });
    return;
  }

  /* tool.result */
  if (type === 'tool.result') {
    const toolId = event.toolId || '';
    const nodeId = rs.toolNodeById.get(toolId);
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        const resultValue = event.result ?? event.output ?? event.text ?? '';
        const resultText = typeof resultValue === 'string' ? resultValue : JSON.stringify(resultValue, null, 2);
        rs.timelineNodes.set(nodeId, {
          ...existing,
          status: event.error ? 'failed' : 'completed',
          result: { text: resultText, isCode: typeof resultValue !== 'string' },
        });
      }
    }
    return;
  }

  /* tool.end */
  if (type === 'tool.end') {
    const toolId = event.toolId || '';
    const nodeId = rs.toolNodeById.get(toolId);
    if (nodeId) {
      const existing = rs.timelineNodes.get(nodeId);
      if (existing) {
        rs.timelineNodes.set(nodeId, {
          ...existing,
          status: event.error ? 'failed' : (existing.status === 'failed' ? 'failed' : 'completed'),
        });
      }
    }
    return;
  }

  /* plan events */
  if (type === 'plan.update' || type === 'plan.snapshot') {
    if (event.plan) {
      rs.plan = { planId: event.planId || 'plan', plan: event.plan };
    }
    return;
  }

  if (type === 'plan.task.start') {
    const taskId = event.taskId || '';
    if (taskId) {
      rs.planCurrentRunningTaskId = taskId;
      rs.planLastTouchedTaskId = taskId;
      rs.planRuntimeByTaskId.set(taskId, { status: 'running', updatedAt: Date.now(), error: '' });
    }
    return;
  }

  if (type === 'plan.task.end') {
    const taskId = event.taskId || '';
    if (taskId) {
      rs.planRuntimeByTaskId.set(taskId, {
        status: event.error ? 'failed' : 'completed',
        updatedAt: Date.now(),
        error: event.error ? String(event.error) : '',
      });
      if (rs.planCurrentRunningTaskId === taskId) {
        rs.planCurrentRunningTaskId = '';
      }
    }
    return;
  }
}

/**
 * useChatActions — handles loading agents, chats, and switching chat context.
 */
export function useChatActions() {
  const { state, dispatch, stateRef } = useAppContext();
  const loadSeqRef = useRef(0);
  const bootstrappedRef = useRef(false);

  const loadAgents = useCallback(async () => {
    try {
      const response = await getAgents();
      const agents = (response.data as Agent[]) || [];
      dispatch({ type: 'SET_AGENTS', agents });
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[loadAgents error] ${(error as Error).message}` });
    }
  }, [dispatch]);

  const loadChats = useCallback(async () => {
    try {
      const response = await getChats();
      const chats = (response.data as Chat[]) || [];
      dispatch({ type: 'SET_CHATS', chats });
    } catch (error) {
      dispatch({ type: 'APPEND_DEBUG', line: `[loadChats error] ${(error as Error).message}` });
    }
  }, [dispatch]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (!chatId) return;

      const seq = ++loadSeqRef.current;
      dispatch({ type: 'SET_CHAT_ID', chatId });
      dispatch({ type: 'RESET_CONVERSATION' });

      try {
        const response = await getChat(chatId, false);
        if (seq !== loadSeqRef.current) return;

        const chatData = response.data as Record<string, unknown>;

        /* Replay events into a LOCAL MUTABLE state to avoid React batching issues */
        const events = Array.isArray(chatData?.events) ? chatData.events : [];
        const rs = createReplayState();
        rs.chatId = chatId;

        for (const event of events) {
          if (seq !== loadSeqRef.current) return;
          const evt = event as AgentEvent;
          if (evt?.chatId && String(evt.chatId) !== String(chatId)) continue;
          replayEvent(rs, evt);
        }

        /* Dispatch the complete replay result as a single batch update */
        dispatch({
          type: 'BATCH_UPDATE',
          updates: {
            chatId: rs.chatId,
            runId: rs.runId,
            timelineNodes: rs.timelineNodes,
            timelineOrder: rs.timelineOrder,
            contentNodeById: rs.contentNodeById,
            reasoningNodeById: rs.reasoningNodeById,
            toolNodeById: rs.toolNodeById,
            toolStates: rs.toolStates,
            timelineCounter: rs.timelineCounter,
            activeReasoningKey: rs.activeReasoningKey,
            events: rs.events,
            plan: rs.plan,
            planRuntimeByTaskId: rs.planRuntimeByTaskId,
            planCurrentRunningTaskId: rs.planCurrentRunningTaskId,
            planLastTouchedTaskId: rs.planLastTouchedTaskId,
          },
        });

        /* Set agent for this chat */
        const agentKey = String(chatData?.firstAgentKey || chatData?.agentKey || '');
        if (agentKey) {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId, agentKey });
        }
        // Also set any agents discovered during replay
        rs.chatAgentById.forEach((agentKey, cid) => {
          dispatch({ type: 'SET_CHAT_AGENT_BY_ID', chatId: cid, agentKey });
        });
      } catch (error) {
        dispatch({ type: 'APPEND_DEBUG', line: `[loadChat error] ${(error as Error).message}` });
      }
    },
    [dispatch]
  );

  /* Bootstrap: load agents and chats on mount */
  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    setAccessToken(stateRef.current.accessToken);
    loadAgents();
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Load chat when sidebar triggers */
  useEffect(() => {
    const handler = (e: Event) => {
      const chatId = (e as CustomEvent).detail?.chatId;
      if (chatId) loadChat(chatId);
    };
    window.addEventListener('agent:load-chat', handler);
    return () => window.removeEventListener('agent:load-chat', handler);
  }, [loadChat]);

  /* Refresh agents list on-demand */
  useEffect(() => {
    const handler = () => {
      loadAgents().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-agents', handler);
    return () => window.removeEventListener('agent:refresh-agents', handler);
  }, [loadAgents]);

  /* Refresh chats list on-demand */
  useEffect(() => {
    const handler = () => {
      loadChats().catch(() => undefined);
    };
    window.addEventListener('agent:refresh-chats', handler);
    return () => window.removeEventListener('agent:refresh-chats', handler);
  }, [loadChats]);

  return { loadAgents, loadChats, loadChat };
}
