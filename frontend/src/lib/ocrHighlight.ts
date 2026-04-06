/**
 * OCR-based field region highlighting.
 *
 * Uses Tesseract word bounding boxes (pixel-accurate, stored in ocr_metadata.words)
 * to locate each extracted field value in the rendered page image.
 * This is far more reliable than AI-returned field_regions, which suffer from
 * coordinate-space mismatches caused by the vision API resizing images internally.
 */

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OcrFieldRegionBox {
  page: number;
  left: number;   // normalized 0..1
  top: number;    // normalized 0..1
  width: number;  // normalized 0..1
  height: number; // normalized 0..1
  coordinate_space: 'normalized';
}

/** Normalize for fuzzy comparison: lowercase + strip all non-alphanumeric chars */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find a value string in the OCR word list.
 * Handles:
 *  - Single-word values (exact and substring match)
 *  - Multi-word values (consecutive word sequence on the same line)
 *  - Number formatting differences ("9778.40" ↔ "9,778.40" both normalize to "977840")
 *  - Prefix/suffix chars ("#284213" ↔ "284213")
 */
function findInWords(value: string, words: OcrWord[]): OcrWord[] | null {
  const normVal = norm(value);
  if (!normVal || normVal.length < 2) return null;

  const tokens = value.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 1) {
    // Exact normalized match
    for (const w of words) {
      if (norm(w.text) === normVal) return [w];
    }
    // Substring match: handles "#284213" ↔ "284213", "9,778.40" ↔ "9778.40"
    if (normVal.length >= 4) {
      for (const w of words) {
        const nw = norm(w.text);
        const shorter = nw.length <= normVal.length ? nw : normVal;
        const longer  = nw.length <= normVal.length ? normVal : nw;
        if (longer.includes(shorter) && shorter.length >= Math.max(normVal.length * 0.75, 3)) {
          return [w];
        }
      }
    }
    return null;
  }

  // Multi-token: look for a consecutive sequence of words matching the tokens
  const normTokens = tokens.map(norm).filter(Boolean);
  for (let i = 0; i <= words.length - normTokens.length; i++) {
    const segment = words.slice(i, i + normTokens.length);
    let ok = true;
    for (let j = 0; j < normTokens.length; j++) {
      const nw = norm(segment[j].text);
      const nt = normTokens[j];
      if (nw !== nt && !nw.includes(nt) && !nt.includes(nw)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    // Verify all words are on roughly the same line (Y positions close)
    const ys = segment.map((w) => w.y);
    const avgH = segment.reduce((sum, w) => sum + w.height, 0) / segment.length;
    if (Math.max(...ys) - Math.min(...ys) > avgH * 1.5) continue;
    return segment;
  }

  return null;
}

/**
 * Build field region boxes by matching each field value against OCR word positions.
 *
 * @param fieldValues  Map of fieldKey → extracted value
 * @param words        Tesseract word list from ocr_metadata.words (page 1)
 * @param imageWidth   Actual pixel width of the rendered page image
 * @param imageHeight  Actual pixel height of the rendered page image
 * @returns            Map of fieldKey → [{page, left, top, width, height, coordinate_space}]
 */
export function buildOcrFieldRegions(
  fieldValues: Record<string, string | number | null | undefined>,
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number,
): Record<string, OcrFieldRegionBox[]> {
  if (!words.length || imageWidth <= 0 || imageHeight <= 0) return {};

  const regions: Record<string, OcrFieldRegionBox[]> = {};
  const PAD = 3; // pixel padding around matched text bounding box

  for (const [fieldKey, rawValue] of Object.entries(fieldValues)) {
    if (rawValue == null || rawValue === '') continue;
    const valueStr = String(rawValue).trim();
    if (!valueStr) continue;

    const matched = findInWords(valueStr, words);
    if (!matched || matched.length === 0) continue;

    const left   = Math.min(...matched.map((w) => w.x)) - PAD;
    const top    = Math.min(...matched.map((w) => w.y)) - PAD;
    const right  = Math.max(...matched.map((w) => w.x + w.width)) + PAD;
    const bottom = Math.max(...matched.map((w) => w.y + w.height)) + PAD;

    regions[fieldKey] = [{
      page: 1,
      left:   Math.max(0, left  / imageWidth),
      top:    Math.max(0, top   / imageHeight),
      width:  Math.min(1, (right - left)   / imageWidth),
      height: Math.min(1, (bottom - top)   / imageHeight),
      coordinate_space: 'normalized',
    }];
  }

  return regions;
}
