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
}

export interface OcrDocumentResult {
  documentId: string;
  fileName: string;
  pageCount: number;
  pages: OcrPageResult[];
  averageConfidence: number; // 0-100
  fullText: string; // concatenated text of all pages
  images: OcrImageResult[]; // all images across all pages
}
