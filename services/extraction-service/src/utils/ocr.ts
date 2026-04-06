import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { logger } from '@ap-bps/shared';

export interface OcrResult {
  text: string;
  imageBase64?: string;
  mimeType?: string;
  imagePages?: Array<{
    page: number;
    imageBase64: string;
    mimeType: string;
    width?: number;
    height?: number;
  }>;
  pageCount?: number;
  metadata?: {
    imageWidth?: number;
    imageHeight?: number;
    renderedPages?: Array<{
      page: number;
      imageBase64: string;
      mimeType: string;
      width?: number;
      height?: number;
    }>;
    words?: Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
    }>;
  };
}

async function extractRenderedImageOcr(image: Buffer): Promise<{
  text: string;
  words: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  }>;
}> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(image);
    return {
      text: data.text.trim(),
      words: (data.words ?? [])
        .filter((w) => !!w.text?.trim())
        .map((w) => ({
          text: String(w.text).trim(),
          x: w.bbox.x0,
          y: w.bbox.y0,
          width: Math.max(0, w.bbox.x1 - w.bbox.x0),
          height: Math.max(0, w.bbox.y1 - w.bbox.y0),
          confidence: Number(w.confidence ?? 0),
        })),
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractTextAndImage(storagePath: string, mimeType: string): Promise<OcrResult> {
  const ext = path.extname(storagePath).toLowerCase();
  const pdfImagePagesCap = Math.max(1, Math.min(10, Number(process.env.PDF_IMAGE_PAGES ?? 1) || 1));

  // ── PDF ───────────────────────────────────────────────────────────────────
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    try {
      const buffer = fs.readFileSync(storagePath);

      let text = '';
      let pageCount = 1;
      try {
        const data = await pdfParse(buffer);
        text = data.text?.trim() ?? '';
        pageCount = data.numpages ?? 1;
      } catch (err) {
        logger.warn('PDF parse failed; will attempt render+OCR for text', err);
      }

      try {
        // Render up to N pages so vision models can return field_regions with page numbers.
        const renderPages = Math.max(1, Math.min(pageCount, pdfImagePagesCap));
        const imagePages: NonNullable<OcrResult['imagePages']> = [];
        for (let pageIdx = 0; pageIdx < renderPages; pageIdx += 1) {
          const pagePng = await sharp(storagePath, { density: 220, page: pageIdx }).png().toBuffer();
          const imageInfo = await sharp(pagePng).metadata();
          imagePages.push({
            page: pageIdx + 1,
            imageBase64: pagePng.toString('base64'),
            mimeType: 'image/png',
            width: imageInfo.width,
            height: imageInfo.height,
          });
        }

        const first = imagePages[0];
        const firstPngBuffer = first ? Buffer.from(first.imageBase64, 'base64') : null;

        const ocr = firstPngBuffer
          ? await extractRenderedImageOcr(firstPngBuffer)
          : { text: '', words: [] };
        const words = ocr.words;

        if (text.length > 100) {
          logger.debug('PDF text extracted directly; returning rendered images plus OCR word boxes for highlighting', {
            chars: text.length,
            pageCount,
            imagePages: renderPages,
            words: words.length,
          });
          return {
            text,
            imageBase64: first?.imageBase64,
            mimeType: first?.mimeType,
            imagePages,
            pageCount,
            metadata: {
              imageWidth: first?.width,
              imageHeight: first?.height,
              renderedPages: imagePages,
              words,
            },
          };
        }

        // Scanned/low-text PDF: use OCR text from the rendered first page and keep the
        // same word boxes for viewer highlights.
        logger.debug('PDF appears scanned/low-text, using OCR text from rendered first page', {
          pageCount,
          words: words.length,
        });
        return {
          text: ocr.text,
          imageBase64: first?.imageBase64,
          mimeType: first?.mimeType,
          imagePages,
          pageCount,
          metadata: {
            imageWidth: first?.width,
            imageHeight: first?.height,
            renderedPages: imagePages,
            words,
          },
        };
      } catch (ocrErr) {
        logger.warn('PDF page render/OCR failed, returning parsed text fallback', ocrErr);
        return { text, pageCount };
      }
    } catch (err) {
      logger.warn('PDF processing failed', err);
    }
  }

  // ── Images (JPEG, PNG, TIFF) ──────────────────────────────────────────────
  if (
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.tiff', '.tif'].includes(ext)
  ) {
    try {
      // Normalise to PNG for Tesseract
      const pngBuffer = await sharp(storagePath).png().toBuffer();
      const imageBase64 = pngBuffer.toString('base64');
      const imageInfo = await sharp(storagePath).metadata();

      const worker = await createWorker('eng');
      const { data } = await worker.recognize(storagePath);
      await worker.terminate();

      const words = (data.words ?? [])
        .filter((w) => !!w.text?.trim())
        .map((w) => ({
          text: String(w.text).trim(),
          x: w.bbox.x0,
          y: w.bbox.y0,
          width: Math.max(0, w.bbox.x1 - w.bbox.x0),
          height: Math.max(0, w.bbox.y1 - w.bbox.y0),
          confidence: Number(w.confidence ?? 0),
        }));

      return {
        text: data.text.trim(),
        imageBase64,
        mimeType: 'image/png',
        metadata: {
          imageWidth: imageInfo.width,
          imageHeight: imageInfo.height,
          words,
        },
      };
    } catch (err) {
      logger.error('OCR failed', err);
      return { text: '' };
    }
  }

  // ── Excel / spreadsheet ───────────────────────────────────────────────────
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    ['.xlsx', '.xls'].includes(ext)
  ) {
    try {
      const xlsx = await import('xlsx');
      const workbook = xlsx.readFile(storagePath);
      const sheets = workbook.SheetNames;
      const lines: string[] = [];
      for (const name of sheets) {
        const ws = workbook.Sheets[name];
        const csv = xlsx.utils.sheet_to_csv(ws);
        lines.push(`Sheet: ${name}\n${csv}`);
      }
      return { text: lines.join('\n\n') };
    } catch (err) {
      logger.error('Excel parse failed', err);
      return { text: '' };
    }
  }

  // ── Fallback: read as UTF-8 text ──────────────────────────────────────────
  try {
    const text = fs.readFileSync(storagePath, 'utf-8');
    return { text };
  } catch {
    return { text: '' };
  }
}
