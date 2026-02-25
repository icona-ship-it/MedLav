/**
 * Shared formatting utilities used across the application.
 */
import { FileText, Image, FileSpreadsheet, File } from 'lucide-react';

/**
 * Format ISO date string (YYYY-MM-DD) to Italian format (DD/MM/YYYY).
 * Returns the original string if parsing fails.
 */
export function formatDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Format file size in bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get appropriate lucide icon component for a file MIME type.
 */
export function getFileIcon(type: string) {
  if (type.startsWith('image/') || type.includes('image')) return Image;
  if (type.includes('pdf')) return FileText;
  if (type.includes('sheet') || type.includes('excel')) return FileSpreadsheet;
  return File;
}

/**
 * Format confidence percentage to human-readable label.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'Alta affidabilità';
  if (confidence >= 50) return 'Da verificare';
  return 'Bassa affidabilità';
}

/**
 * Get Tailwind color class for confidence percentage.
 */
export function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-600';
  if (confidence >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Safely parse JSON string, returning fallback on failure.
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
