import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWarn, mockInfo } = vi.hoisted(() => ({ mockWarn: vi.fn(), mockInfo: vi.fn() }));

vi.mock('../logger.js', () => ({
  default: { warn: mockWarn, info: mockInfo, debug: vi.fn(), error: vi.fn() },
}));

import { logGeminiUsage } from './geminiUsage.js';

describe('logGeminiUsage', () => {
  beforeEach(() => {
    mockWarn.mockReset();
    mockInfo.mockReset();
  });

  it('logs input/output token counts and cost at the documented $1.50/$9.00 per M rates', () => {
    logGeminiUsage('plausibility', {
      promptTokenCount: 1_900,
      candidatesTokenCount: 80,
      thoughtsTokenCount: 0,
    });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const [, meta] = mockInfo.mock.calls[0];
    expect(meta).toMatchObject({
      operation: 'plausibility',
      inputTokens: 1_900,
      outputTokens: 80,
      thoughtsTokenCount: 0,
    });
    expect(meta.usdCost).toBeCloseTo(1_900 * (1.5 / 1_000_000) + 80 * (9.0 / 1_000_000), 9);
  });

  it('folds thoughtsTokenCount into the output side, since Gemini bills thinking as output', () => {
    logGeminiUsage('label-extraction', {
      promptTokenCount: 1_900,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 1_000,
    });

    const [, meta] = mockInfo.mock.calls.at(-1)!;
    expect(meta.outputTokens).toBe(1_200);
  });

  it('warns instead of throwing when usageMetadata is missing', () => {
    logGeminiUsage('plausibility', undefined);

    expect(mockWarn).toHaveBeenCalledWith('gemini:usage missing from response', {
      operation: 'plausibility',
    });
    expect(mockInfo).not.toHaveBeenCalled();
  });
});
