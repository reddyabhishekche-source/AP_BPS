import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedInvoiceData } from '@ap-bps/shared';
import type { AIExtractionProvider, ExtractionInput } from './base';
import { buildExtractionSystemPrompt, parseModelOutput } from './base';

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } };

export class AnthropicProvider implements AIExtractionProvider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022';
  }

  async extract(input: ExtractionInput): Promise<ExtractedInvoiceData> {
    const model = input.model?.trim() || this.model;
    const content: AnthropicContentBlock[] = [];

    const pages = Array.isArray(input.imagePages) && input.imagePages.length > 0
      ? input.imagePages.slice().sort((a, b) => a.page - b.page)
      : [];

    if (pages.length > 0) {
      for (const p of pages) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: p.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: p.imageBase64,
          },
        });
      }
    } else if (input.imageBase64 && input.mimeType?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: input.imageBase64,
        },
      });
    }

    content.push({
      type: 'text',
      text: input.text
        ? `Invoice text content:\n\n${input.text}`
        : 'Please extract all invoice data from the attached image.',
    });

    const response = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system: buildExtractionSystemPrompt(input.customFields ?? []),
      messages: [{ role: 'user', content }],
      temperature: 0,
    });

    const raw =
      response.content.find((b) => b.type === 'text')?.text ?? '{}';
    return parseModelOutput(raw, input.customFields ?? []);
  }
}
