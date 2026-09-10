import logger from '../logger.js';

const INPUT_USD_PER_M_TOKENS = 1.5;
const OUTPUT_USD_PER_M_TOKENS = 9.0;

interface UsageMetadataLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

export function logGeminiUsage(operation: string, usage: UsageMetadataLike | undefined): void {
  if (!usage) {
    logger.warn('gemini:usage missing from response', { operation });
    return;
  }

  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const usdCost =
    (inputTokens / 1_000_000) * INPUT_USD_PER_M_TOKENS +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_M_TOKENS;

  logger.info('gemini:usage', {
    operation,
    inputTokens,
    outputTokens,
    thoughtsTokenCount: usage.thoughtsTokenCount ?? 0,
    usdCost: Number(usdCost.toFixed(6)),
  });
}
