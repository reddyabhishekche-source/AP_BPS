import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import type { ExtractedInvoiceData } from '@ap-bps/shared';
import { logger } from '@ap-bps/shared';
import type { AIExtractionProvider, ExtractionInput } from './base';
import { buildExtractionSystemPrompt, parseModelOutput } from './base';

export class OpenAIProvider implements AIExtractionProvider {
  name = 'openai';
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-5.2';
  }

  private canUseUploadedFile(input: ExtractionInput): boolean {
    if (!input.filePath || !fs.existsSync(input.filePath)) return false;
    if (input.mimeType?.startsWith('image/')) return false;

    const name = (input.filename ?? input.filePath).toLowerCase();
    const ext = path.extname(name);
    const supported = new Set([
      '.pdf', '.txt', '.text', '.csv', '.json', '.xml', '.yaml', '.yml',
      '.md', '.markdown', '.html', '.htm', '.doc', '.docx', '.rtf',
      '.ppt', '.pptx', '.xls', '.xlsx', '.odt',
    ]);
    return supported.has(ext);
  }

  private async extractViaUploadedFile(input: ExtractionInput, model: string): Promise<ExtractedInvoiceData> {
    if (!input.filePath || !fs.existsSync(input.filePath)) {
      throw new Error('Source file path is not available for OpenAI upload extraction');
    }

    let uploadedFileId: string | null = null;
    try {
      const uploaded = await this.client.files.create({
        file: fs.createReadStream(input.filePath),
        purpose: 'user_data',
      });
      uploadedFileId = uploaded.id;

      try {
        await this.client.files.waitForProcessing(uploadedFileId, { maxWait: 20_000, pollInterval: 500 });
      } catch {
        // Best effort; continue even if processing wait is not available for this file purpose.
      }

      const response = await this.client.responses.create({
        model,
        temperature: 0,
        instructions: buildExtractionSystemPrompt(input.customFields ?? []),
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_file', file_id: uploadedFileId },
              {
                type: 'input_text',
                text: input.text
                  ? `Use the uploaded file as primary context. OCR text (fallback context):\n\n${input.text}`
                  : 'Use the uploaded file as primary context and extract invoice fields.',
              },
            ],
          },
        ],
      } as never);

      const raw = (response as { output_text?: string }).output_text ?? '{}';
      return parseModelOutput(raw, input.customFields ?? []);
    } finally {
      if (uploadedFileId) {
        try {
          await this.client.files.del(uploadedFileId);
        } catch (err) {
          logger.warn('Failed to delete uploaded OpenAI file after extraction', err);
        }
      }
    }
  }

  private async extractViaChatContent(input: ExtractionInput, model: string): Promise<ExtractedInvoiceData> {
    const userContent: OpenAI.ChatCompletionContentPart[] = [];

    const pages = Array.isArray(input.imagePages) && input.imagePages.length > 0
      ? input.imagePages.slice().sort((a, b) => a.page - b.page)
      : [];

    if (pages.length > 0) {
      for (const p of pages) {
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${p.mimeType};base64,${p.imageBase64}`,
            detail: 'high',
          },
        });
      }
    } else if (input.imageBase64 && input.mimeType?.startsWith('image/')) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${input.mimeType};base64,${input.imageBase64}`,
          detail: 'high',
        },
      });
    }

    userContent.push({
      type: 'text',
      text: input.text
        ? `Invoice text content:\n\n${input.text}`
        : `Please extract all invoice data from the attached image.`,
    });

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: buildExtractionSystemPrompt(input.customFields ?? []) },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    return parseModelOutput(raw, input.customFields ?? []);
  }

  async extract(input: ExtractionInput): Promise<ExtractedInvoiceData> {
    const model = input.model?.trim() || this.model;
    // If we have page images (e.g. PDF rendered pages), prefer vision extraction so we can get field_regions.
    if (!input.imagePages?.length && this.canUseUploadedFile(input)) {
      try {
        return await this.extractViaUploadedFile(input, model);
      } catch (err) {
        logger.warn('OpenAI file-upload extraction failed; falling back to inline extraction', err);
      }
    }
    return this.extractViaChatContent(input, model);
  }
}
