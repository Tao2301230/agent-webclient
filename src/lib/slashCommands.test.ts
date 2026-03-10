import type { TimelineNode } from '../context/types';
import {
  getFilteredSlashCommands,
  getLatestQueryText,
  isSlashCommandDisabled,
  shouldShowSlashCommandPalette,
} from './slashCommands';

function createNode(partial: Partial<TimelineNode> & Pick<TimelineNode, 'id' | 'kind' | 'ts'>): TimelineNode {
  return partial as TimelineNode;
}

describe('slashCommands', () => {
  it('only opens for a standalone slash token', () => {
    expect(shouldShowSlashCommandPalette('/')).toBe(true);
    expect(shouldShowSlashCommandPalette('/re')).toBe(true);
    expect(shouldShowSlashCommandPalette('/redo now')).toBe(false);
    expect(shouldShowSlashCommandPalette('hello /redo')).toBe(false);
  });

  it('filters the command list by slash query', () => {
    expect(getFilteredSlashCommands('/').length).toBeGreaterThanOrEqual(7);
    expect(getFilteredSlashCommands('/vo').map((item) => item.id)).toEqual(['voice']);
  });

  it('disables commands according to current availability', () => {
    const availability = {
      streaming: true,
      hasLatestQuery: false,
      speechSupported: false,
      isFrontendActive: true,
    };

    expect(isSlashCommandDisabled('redo', availability)).toBe(true);
    expect(isSlashCommandDisabled('voice', availability)).toBe(true);
    expect(isSlashCommandDisabled('stop', availability)).toBe(false);
    expect(isSlashCommandDisabled('settings', availability)).toBe(false);
  });

  it('finds the most recent user query from timeline nodes', () => {
    const nodes: TimelineNode[] = [
      createNode({ id: 'user_1', kind: 'message', role: 'user', text: 'first', ts: 100 }),
      createNode({ id: 'content_1', kind: 'content', text: 'answer', ts: 110 }),
      createNode({ id: 'user_2', kind: 'message', role: 'user', text: 'latest', ts: 120 }),
    ];

    expect(getLatestQueryText(nodes)).toBe('latest');
  });
});
