import type { AIProvider } from '@ap-bps/shared';
import type { AIExtractionProvider } from './base';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';

// Cache provider instances
const providers: Map<AIProvider, AIExtractionProvider> = new Map();

export function getProvider(providerName: AIProvider): AIExtractionProvider {
  if (!providers.has(providerName)) {
    switch (providerName) {
      case 'openai':
        providers.set('openai', new OpenAIProvider());
        break;
      case 'anthropic':
        providers.set('anthropic', new AnthropicProvider());
        break;
      case 'gemini':
        providers.set('gemini', new GeminiProvider());
        break;
      default:
        throw new Error(`Unknown AI provider: ${providerName}`);
    }
  }
  return providers.get(providerName)!;
}

export function getDefaultProvider(): AIExtractionProvider {
  const defaultName = (process.env.DEFAULT_AI_PROVIDER as AIProvider) ?? 'openai';
  return getProvider(defaultName);
}
