import type { Agent, AppState, Team } from '../context/types';

function toText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeAgents(agents: Agent[]): Array<{ key: string; name: string; role: string }> {
  if (!Array.isArray(agents)) return [];
  return agents
    .map((item) => ({
      key: toText(item?.key),
      name: toText(item?.name),
      role: toText(item?.role),
    }))
    .filter((item) => item.key);
}

function pushTeamAgentKeys(raw: unknown, keys: string[], seen: Set<string>): void {
  const normalized = toText(raw);
  if (!normalized) return;
  const parts = normalized
    .split(/[,\uFF0C]/)
    .map((part) => toText(part))
    .filter(Boolean);
  for (const key of parts) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
}

function readTeamAgentKeys(team: Team): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const candidates: unknown[] = [];
  candidates.push(team?.agentKey);
  if (Array.isArray(team?.agentKeys)) candidates.push(...team.agentKeys);

  for (const item of Array.isArray(team?.agents) ? team.agents : []) {
    if (typeof item === 'string') {
      candidates.push(item);
    } else {
      candidates.push(item?.agentKey, item?.key);
    }
  }

  for (const item of Array.isArray(team?.members) ? team.members : []) {
    if (typeof item === 'string') {
      candidates.push(item);
    } else {
      candidates.push(item?.agentKey, item?.key);
    }
  }

  for (const candidate of candidates) {
    pushTeamAgentKeys(candidate, keys, seen);
  }
  return keys;
}

function resolveTeamById(teams: Team[], teamId: string): Team | null {
  const normalizedTeamId = toText(teamId);
  if (!normalizedTeamId) return null;
  for (const item of Array.isArray(teams) ? teams : []) {
    if (toText(item?.teamId) === normalizedTeamId) return item;
  }
  return null;
}

export function resolveMentionCandidatesFromState(state: AppState): Agent[] {
  const allAgents = normalizeAgents(state?.agents);
  const mode = toText(state?.conversationMode) || 'chat';

  if (mode !== 'worker') return allAgents as Agent[];
  if (!(state?.workerIndexByKey instanceof Map)) return allAgents as Agent[];

  const selectedWorker = state.workerIndexByKey.get(toText(state?.workerSelectionKey));
  if (!selectedWorker) return allAgents as Agent[];

  if (toText(selectedWorker.type) === 'agent') return [];
  if (toText(selectedWorker.type) !== 'team') return allAgents as Agent[];

  const team = resolveTeamById(state?.teams, selectedWorker.sourceId);
  if (!team) return [];

  const teamAgentKeys = readTeamAgentKeys(team);
  if (teamAgentKeys.length === 0) return [];

  const agentsByKey = new Map(allAgents.map((item) => [item.key, item]));
  return teamAgentKeys.map((key) => agentsByKey.get(key) || { key, name: key, role: '--' }) as Agent[];
}

