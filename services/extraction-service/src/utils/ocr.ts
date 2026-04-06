import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
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
  };
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
        logger.warn('PDF parse failed; will rely on vision extraction', err);
      }

      try {
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

        logger.debug('PDF rendered to images for vision extraction', {
          chars: text.length,
          pageCount,
          imagePages: renderPages,
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
          },
        };
      } catch (renderErr) {
        logger.warn('PDF page render failed, returning parsed text only', renderErr);
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
      const pngBuffer = await sharp(storagePath).png().toBuffer();
      const imageBase64 = pngBuffer.toString('base64');
      const imageInfo = await sharp(storagePath).metadata();

      return {
        text: '',
        imageBase64,
        mimeType: 'image/png',
        metadata: {
          imageWidth: imageInfo.width,
          imageHeight: imageInfo.height,
        },
      };
    } catch (err) {
      logger.error('Image processing failed', err);
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
