export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number; // 0-100
  hasHandwriting: 'yes' | 'partial' | null;
  handwritingConfidence: number | null; // 0-100
}

export interface OcrDocumentResult {
  documentId: string;
  fileName: string;
  pageCount: number;
  pages: OcrPageResult[];
  averageConfidence: number; // 0-100
  fullText: string; // concatenated text of all pages
}
