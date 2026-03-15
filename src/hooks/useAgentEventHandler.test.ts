import { createInitialState } from '../context/AppContext';
import { findMatchingPendingSteer } from './useAgentEventHandler';

describe('findMatchingPendingSteer', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => '',
      },
    });
  });

  it('matches only when steerId exists in pending steers', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched?.message).toBe('突然计划去北京。');
  });

  it('does not fallback to requestId when steerId does not match', () => {
    const state = {
      ...createInitialState(),
      pendingSteers: [
        {
          steerId: 'pending_steer_id',
          message: '突然计划去北京。',
          requestId: 'req_1773506656934_drp9ko',
          runId: 'mmqk2gej',
          createdAt: 100,
        },
      ],
    };

    const matched = findMatchingPendingSteer(state, {
      type: 'request.steer',
      steerId: '55a9ce3e-0ae2-4cbd-8224-0e0dd4d62c34',
      requestId: 'req_1773506656934_drp9ko',
      message: '突然计划去北京。',
    });

    expect(matched).toBeNull();
  });
});
