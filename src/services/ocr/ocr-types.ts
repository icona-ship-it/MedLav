export interface OcrImageResult {
  imageId: string;
  imageBase64: string;
  pageNumber: number;
  figureIndex: number;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number; // 0-100
  hasHandwriting: 'yes' | 'partial' | null;
  handwritingConfidence: number | null; // 0-100
  images: OcrImageResult[];
  /** Page-specific header captured by Mistral OCR 3 (extractHeader: true). Empty string if filtered as repetitive. */
  header?: string;
  /** Page-specific footer captured by Mistral OCR 3 (extractFooter: true). Empty string if filtered as repetitive. */
  footer?: string;
  /** HTML tables captured by Mistral OCR 3 (tableFormat: 'html'). Same data is also embedded inline in `text` between [TABLE_HTML_START]/[TABLE_HTML_END] markers for synthesis consumption. */
  htmlTables?: string[];
}

export interface OcrDocumentResult {
  documentId: string;
  fileName: string;
  pageCount: number;
  pages: OcrPageResult[];
  averageConfidence: number; // 0-100
  fullText: string; // concatenated text of all pages
  images: OcrImageResult[]; // all images across all pages
  ocrPages?: number; // number of pages billed by OCR API
  /** Most-common header across pages (≥50% repetition) — typically identifies the document itself
   *  ("Cartella Clinica n. XXX, Ospedale YYY"). Useful for downstream citation accuracy. */
  documentHeader?: string;
  /** Most-common footer across pages (≥50% repetition) — typically page numbering boilerplate. */
  documentFooter?: string;
}
