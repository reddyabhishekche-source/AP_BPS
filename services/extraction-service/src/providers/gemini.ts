import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import type { ExtractedInvoiceData } from '@ap-bps/shared';
import type { AIExtractionProvider, ExtractionInput } from './base';
import { buildExtractionSystemPrompt, parseModelOutput } from './base';

export class GeminiProvider implements AIExtractionProvider {
  name = 'gemini';
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    this.modelName = process.env.GEMINI_MODEL ?? 'gemini-1.5-pro';
  }

  async extract(input: ExtractionInput): Promise<ExtractedInvoiceData> {
    const modelName = input.model?.trim() || this.modelName;
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: buildExtractionSystemPrompt(input.customFields ?? []),
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    });

    const parts: Part[] = [];

    const pages = Array.isArray(input.imagePages) && input.imagePages.length > 0
      ? input.imagePages.slice().sort((a, b) => a.page - b.page)
      : [];

    if (pages.length > 0) {
      for (const p of pages) {
        parts.push({
          inlineData: {
            mimeType: p.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif',
            data: p.imageBase64,
          },
        });
      }
    } else if (input.imageBase64 && input.mimeType?.startsWith('image/')) {
      parts.push({
        inlineData: {
          mimeType: input.mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif',
          data: input.imageBase64,
        },
      });
    }

    parts.push({
      text: input.text
        ? `Invoice text content:\n\n${input.text}`
        : 'Please extract all invoice data from the attached image.',
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const raw = result.response.text();
    return parseModelOutput(raw, input.customFields ?? []);
  }
}
