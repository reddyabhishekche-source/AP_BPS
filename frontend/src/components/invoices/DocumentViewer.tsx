'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Bug } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import type { FieldRegionBox } from '@/types';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface HighlightEntry {
  page: number;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  fieldKey: string;
  active: boolean;
}

interface RenderedPage {
  page: number;
  imageBase64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

interface Props {
  invoiceId: string;
  storageUrl: string | null;
  filename: string | null;
  mimeType?: string;
  fieldRegions?: Record<string, FieldRegionBox[]>;
  fieldValues?: Record<string, string | number | null | undefined>;
  fieldConfidence?: Record<string, number | null>;
  confidenceThreshold?: number;
  renderedPages?: RenderedPage[];
  highlightValues?: string[];
  activeHighlight?: string | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLoose(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

type RawBox = { page: number; left: number; top: number; width: number; height: number };

const RIGHT_ANCHORED_FIELDS = new Set([
  'invoice_number',
  'invoice_date',
  'due_date',
  'po_reference',
  'subtotal',
  'tax',
  'total',
  'currency',
]);

const VALUE_CELL_CROP: Partial<Record<string, { start: number; width: number }>> = {
  invoice_number: { start: 0.58, width: 0.28 },
  invoice_date: { start: 0.58, width: 0.28 },
  due_date: { start: 0.58, width: 0.28 },
  po_reference: { start: 0.58, width: 0.28 },
  subtotal: { start: 0.70, width: 0.20 },
  tax: { start: 0.70, width: 0.20 },
  total: { start: 0.70, width: 0.20 },
  currency: { start: 0.58, width: 0.20 },
};

function mergeAdjacentBoxes(boxes: RawBox[]): RawBox[] {
  if (boxes.length <= 1) return boxes;
  const sorted = [...boxes].sort((a, b) => a.page - b.page || a.top - b.top || a.left - b.left);
  const out: RawBox[] = [];
  for (const box of sorted) {
    const last = out[out.length - 1];
    if (!last || last.page !== box.page) {
      out.push({ ...box });
      continue;
    }
    const gap = 0.01;
    const lastRight = last.left + last.width;
    const lastBottom = last.top + last.height;
    const boxRight = box.left + box.width;
    const boxBottom = box.top + box.height;
    if (box.left <= lastRight + gap && box.top <= lastBottom + gap && boxRight >= last.left - gap && boxBottom >= last.top - gap) {
      const nextLeft = Math.min(last.left, box.left);
      const nextTop = Math.min(last.top, box.top);
      last.left = nextLeft;
      last.top = nextTop;
      last.width = Math.max(lastRight, boxRight) - nextLeft;
      last.height = Math.max(lastBottom, boxBottom) - nextTop;
    } else {
      out.push({ ...box });
    }
  }
  return out;
}

function highlightHtml(input: string, values: string[], activeValue: string | null): string {
  if (!input || values.length === 0) return input;
  const terms = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return input;
  const active = (activeValue ?? '').trim().toLowerCase();
  const rx = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return input.replace(rx, (matched) => {
    const isActive = active.length > 0 && matched.trim().toLowerCase() === active;
    const style = isActive
      ? 'background:rgba(34,211,238,0.6);border-radius:2px;padding:0 1px;'
      : 'background:rgba(253,224,71,0.55);border-radius:2px;padding:0 1px;';
    return `<mark style="${style}">${matched}</mark>`;
  });
}

export function DocumentViewer({
  invoiceId,
  storageUrl,
  filename,
  mimeType,
  fieldRegions = {},
  fieldValues = {},
  fieldConfidence = {},
  confidenceThreshold = 0.8,
  renderedPages = [],
  highlightValues = [],
  activeHighlight,
}: Props) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pdfWrapRef = useRef<HTMLDivElement | null>(null);
  const [pdfCanvasBox, setPdfCanvasBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [debugMode, setDebugMode] = useState(false);

  const lowerName = filename?.toLowerCase() ?? '';
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
  const isImage = !!mimeType?.startsWith('image/') || /\.(png|jpe?g|tiff?|bmp|webp|gif)$/i.test(lowerName);
  const sortedRenderedPages = useMemo(
    () => renderedPages.slice().sort((a, b) => a.page - b.page),
    [renderedPages],
  );
  const useRenderedPdfPreview = isPdf && sortedRenderedPages.length > 0;
  const currentRenderedPage = useMemo(
    () => sortedRenderedPages.find((p) => p.page === pageNumber) ?? sortedRenderedPages[pageNumber - 1] ?? null,
    [sortedRenderedPages, pageNumber],
  );
  const fallbackLink = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_INGESTION_URL ?? 'http://localhost:3001';
    const filenamePart = storageUrl?.split(/[\\/]/).pop() ?? storageUrl ?? filename ?? 'document';
    return `${base}/files/${encodeURIComponent(filenamePart)}`;
  }, [storageUrl, filename]);

  useEffect(() => {
    let cancelled = false;
    let previousUrl: string | null = null;

    async function loadDocumentBlob() {
      if (useRenderedPdfPreview) {
        setObjectUrl(null);
        setLoadError(null);
        setLoading(false);
        return;
      }
      if (!invoiceId || !storageUrl) {
        setObjectUrl(null);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const response = await api.get(`/invoices/${invoiceId}/document`, { responseType: 'blob' });
        const blobUrl = URL.createObjectURL(response.data as Blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        previousUrl = blobUrl;
        setObjectUrl(blobUrl);
      } catch {
        if (!cancelled) {
          setObjectUrl(null);
          setLoadError('Failed to load document preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDocumentBlob();
    return () => {
      cancelled = true;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    };
  }, [invoiceId, storageUrl, useRenderedPdfPreview]);

  useEffect(() => {
    if (!useRenderedPdfPreview) return;
    setNumPages(sortedRenderedPages.length);
  }, [useRenderedPdfPreview, sortedRenderedPages]);

  useEffect(() => {
    if (pageNumber < 1) setPageNumber(1);
    else if (numPages > 0 && pageNumber > numPages) setPageNumber(numPages);
  }, [pageNumber, numPages]);

  const tokens = Array.from(
    new Set(highlightValues.map((v) => v.trim()).filter((v) => v.length >= 2).sort((a, b) => b.length - a.length)),
  );

  const activeHighlights = useMemo<HighlightEntry[]>(() => {
    const activeLoose = normalizeLoose(activeHighlight ?? '');
    const threshold = Number.isFinite(confidenceThreshold) ? confidenceThreshold : 0.8;
    const entries: HighlightEntry[] = [];

    for (const [fieldKey, boxes] of Object.entries(fieldRegions)) {
      const confidence = fieldConfidence[fieldKey];
      if (confidence != null && confidence < threshold) continue;
      const value = fieldValues[fieldKey];
      if ((fieldKey in fieldValues) && (value == null || value === '')) continue;
      const valueLoose = normalizeLoose(value == null ? '' : String(value));
      const isActive = activeLoose.length > 0 && valueLoose.length > 0 && activeLoose === valueLoose;

      const normalized = (boxes ?? []).flatMap((box) => {
        const pageWidth = Number(box.page_width);
        const pageHeight = Number(box.page_height);
        const usePageSpace = (
          box.coordinate_space === 'page' ||
          (Number.isFinite(pageWidth) && pageWidth > 0 && Number.isFinite(pageHeight) && pageHeight > 0
            && (box.left > 1 || box.top > 1 || box.width > 1 || box.height > 1))
        );

        if (usePageSpace) {
          if (!(Number.isFinite(pageWidth) && pageWidth > 0 && Number.isFinite(pageHeight) && pageHeight > 0)) {
            return [];
          }
          return [{
            page: box.page ?? 1,
            left: box.left / pageWidth,
            top: box.top / pageHeight,
            width: box.width / pageWidth,
            height: box.height / pageHeight,
          }];
        }

        return [{
          page: box.page ?? 1,
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }];
      });

      for (const box of mergeAdjacentBoxes(normalized)) {
        const crop = VALUE_CELL_CROP[fieldKey];
        const cropped = crop
          ? {
              ...box,
              left: box.left + box.width * crop.start,
              width: box.width * crop.width,
            }
          : box;
        const shrink = Number.isFinite(Number(process.env.NEXT_PUBLIC_HIGHLIGHT_SHRINK))
          ? Number(process.env.NEXT_PUBLIC_HIGHLIGHT_SHRINK)
          : 0.82;
        const shrinkX = RIGHT_ANCHORED_FIELDS.has(fieldKey) ? Math.min(shrink, 0.45) : shrink;
        const effectiveShrinkX = crop ? Math.max(shrink, 0.92) : shrinkX;
        const centerX = cropped.left + cropped.width / 2;
        const centerY = cropped.top + cropped.height / 2;
        const width = cropped.width * effectiveShrinkX;
        const height = cropped.height * shrink;
        const left = RIGHT_ANCHORED_FIELDS.has(fieldKey)
          ? cropped.left + (cropped.width - width)
          : centerX - width / 2;
        entries.push({
          page: cropped.page,
          leftPct: Math.max(0, Math.min(100, left * 100)),
          topPct: Math.max(0, Math.min(100, (centerY - height / 2) * 100)),
          widthPct: Math.max(0.5, width * 100),
          heightPct: Math.max(0.5, height * 100),
          fieldKey,
          active: isActive,
        });
      }
    }

    return entries;
  }, [fieldRegions, fieldValues, fieldConfidence, confidenceThreshold, activeHighlight]);

  const hasBboxHighlights = activeHighlights.length > 0;
  const hasAnyBboxSource = Object.keys(fieldRegions).length > 0;

  useEffect(() => {
    if (!isPdf || useRenderedPdfPreview) return;
    const wrap = pdfWrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const update = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const canvas = wrap.querySelector('canvas');
        if (!canvas) {
          setPdfCanvasBox(null);
          return;
        }
        const wrapRect = wrap.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        setPdfCanvasBox({
          left: canvasRect.left - wrapRect.left,
          top: canvasRect.top - wrapRect.top,
          width: canvasRect.width,
          height: canvasRect.height,
        });
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    window.addEventListener('resize', update);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [isPdf, useRenderedPdfPreview, objectUrl, pageNumber, scale, numPages]);

  function renderOverlays(highlights: HighlightEntry[], currentPage: number) {
    return highlights
      .filter((box) => box.page === currentPage)
      .map((box, idx) => (
        <div
          key={`${box.fieldKey}-${idx}-${box.leftPct.toFixed(1)}-${box.topPct.toFixed(1)}`}
          className={box.active
            ? 'absolute rounded-sm border-cyan-500 bg-cyan-300/25 shadow-[0_0_0_1px_rgba(6,182,212,0.35)]'
            : 'absolute rounded-sm border-amber-500 bg-amber-200/20'}
          style={{
            left: `${box.leftPct}%`,
            top: `${box.topPct}%`,
            width: `${box.widthPct}%`,
            height: `${box.heightPct}%`,
            borderWidth: box.active ? '2px' : '1px',
          }}
        />
      ));
  }

  if (!storageUrl && !useRenderedPdfPreview) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-muted-foreground">
        <FileText className="h-10 w-10 opacity-30" />
        <p className="text-sm">No document attached</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
        <p className="truncate text-xs font-medium text-slate-600" title={filename ?? ''}>
          {filename ?? 'Document'}
        </p>
        <div className="flex items-center gap-1">
          {hasAnyBboxSource && (
            <Button
              variant={debugMode ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              title={debugMode
                ? 'Debug: text highlights active - click to return to region-only view'
                : 'Debug: click to show text-layer highlights alongside region overlays'}
              onClick={() => setDebugMode((value) => !value)}
            >
              <Bug className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale((value) => Math.max(0.5, value - 0.2))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale((value) => Math.min(2.5, value + 0.2))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {isPdf && numPages > 1 && (
            <>
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs">{pageNumber}/{numPages}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pageNumber >= numPages} onClick={() => setPageNumber((value) => value + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="h-[830px] bg-slate-100">
        <div className="flex items-start justify-center p-4">
          {loading && <p className="py-8 text-xs text-muted-foreground">Loading preview...</p>}

          {!loading && loadError && (
            <p className="py-8 text-xs text-destructive">
              {loadError}.{' '}
              <a href={fallbackLink} target="_blank" rel="noopener noreferrer" className="underline">Open directly</a>
            </p>
          )}

          {!loading && !loadError && useRenderedPdfPreview && currentRenderedPage && (
            <div className="relative shadow-md" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
              <img
                src={`data:${currentRenderedPage.mimeType};base64,${currentRenderedPage.imageBase64}`}
                alt={`${filename ?? 'Document'} page ${currentRenderedPage.page}`}
                className="block"
              />
              {hasBboxHighlights && (
                <div className="pointer-events-none absolute inset-0">
                  {renderOverlays(activeHighlights, currentRenderedPage.page)}
                </div>
              )}
            </div>
          )}

          {!loading && !loadError && objectUrl && isPdf && !useRenderedPdfPreview && (
            <Document
              file={objectUrl}
              onLoadSuccess={({ numPages: total }) => setNumPages(total)}
              loading={<p className="py-8 text-xs text-muted-foreground">Loading PDF...</p>}
              error={<p className="py-8 text-xs text-destructive">Failed to load PDF.</p>}
            >
              <div ref={pdfWrapRef} className="relative inline-block">
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  className="shadow-md"
                  customTextRenderer={({ str }) => {
                    if (hasBboxHighlights && !debugMode) return str;
                    return highlightHtml(str, tokens, activeHighlight ?? null);
                  }}
                />
                {pdfCanvasBox && hasBboxHighlights && (
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      left: pdfCanvasBox.left,
                      top: pdfCanvasBox.top,
                      width: pdfCanvasBox.width,
                      height: pdfCanvasBox.height,
                    }}
                  >
                    {renderOverlays(activeHighlights, pageNumber)}
                  </div>
                )}
              </div>
            </Document>
          )}

          {!loading && !loadError && objectUrl && isImage && (
            <div className="relative shadow-md" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
              <img src={objectUrl} alt={filename ?? 'Invoice'} className="block" />
              {hasBboxHighlights && (
                <div className="pointer-events-none absolute inset-0">
                  {renderOverlays(activeHighlights, 1)}
                </div>
              )}
            </div>
          )}

          {!loading && !loadError && !useRenderedPdfPreview && objectUrl && !isPdf && !isImage && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">Preview not available</p>
              <a href={fallbackLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                Download file
              </a>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
