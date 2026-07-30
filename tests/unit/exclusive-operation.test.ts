import { describe, expect, it } from 'vitest';
import { ExclusiveOperation } from '../../src/main/exclusive-operation';

describe('ExclusiveOperation', () => {
  it('rejects a duplicate operation while the first operation is active', async () => {
    const exclusive = new ExclusiveOperation();
    let release: (() => void) | undefined;
    const first = exclusive.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    await expect(exclusive.run(async () => undefined)).rejects.toThrow(
      'すでに進行中',
    );

    release?.();
    await first;
    await expect(exclusive.run(async () => 'done')).resolves.toBe('done');
  });

  it('releases the operation after a failure', async () => {
    const exclusive = new ExclusiveOperation();

    await expect(
      exclusive.run(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(exclusive.run(async () => 'retried')).resolves.toBe('retried');
  });
});
