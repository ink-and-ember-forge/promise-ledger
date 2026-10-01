import { expect, it } from 'vitest';
import type { Item } from '../src/domain';

it('domain types are importable', () => {
  const state: Item['state'] = 'open';
  expect(state).toBe('open');
});
