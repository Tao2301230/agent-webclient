import { parseSseFrame } from './sseParser';

describe('parseSseFrame', () => {
  it('keeps raw frame and parses multiline data/id/retry/comments', () => {
    const receivedAt = 1710000000000;
    const frame = [
      ': first comment',
      'event: tool.result',
      'id: evt-7',
      'retry: 5000',
      'data: {"a":1}',
      'data: {"b":2}',
    ].join('\n');

    const parsed = parseSseFrame(frame, receivedAt);

    expect(parsed.comments).toEqual([' first comment']);
    expect(parsed.event).toBe('tool.result');
    expect(parsed.id).toBe('evt-7');
    expect(parsed.retry).toBe(5000);
    expect(parsed.data).toBe('{"a":1}\n{"b":2}');
    expect(parsed.rawFrame).toBe(frame);
    expect(parsed.receivedAt).toBe(receivedAt);
  });
});
