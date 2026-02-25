'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, FileSpreadsheet, File, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { saveDocumentMetadata, updateCaseDocumentCount } from '@/app/(dashboard)/actions';

const DOCUMENT_TYPES = [
  { value: 'cartella_clinica', label: 'Cartella Clinica' },
  { value: 'referto_specialistico', label: 'Referto Specialistico' },
  { value: 'esame_strumentale', label: 'Esame Strumentale' },
  { value: 'esame_laboratorio', label: 'Esame di Laboratorio' },
  { value: 'lettera_dimissione', label: 'Lettera di Dimissione' },
  { value: 'certificato', label: 'Certificato' },
  { value: 'perizia_precedente', label: 'Perizia Precedente' },
  { value: 'altro', label: 'Altro' },
];

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf')) return FileText;
  if (type.includes('sheet') || type.includes('excel')) return FileSpreadsheet;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileUploadProps {
  caseId: string;
  onUploadComplete?: () => void;
}

interface UploadProgress {
  fileName: string;
  status: 'pending' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
}

export function FileUpload({ caseId, onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileTypes, setFileTypes] = useState<Record<string, string>>({});
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const unique = fileArray.filter((f) => !existing.has(`${f.name}-${f.size}`));
      return [...prev, ...unique];
    });
    setProgress([]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  async function handleUpload() {
    if (files.length === 0) return;
    setIsUploading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProgress([{ fileName: '', status: 'error', error: 'Non autenticato' }]);
      setIsUploading(false);
      return;
    }

    const newProgress: UploadProgress[] = files.map((f) => ({
      fileName: f.name,
      status: 'pending' as const,
    }));
    setProgress([...newProgress]);

    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Update status: uploading
      newProgress[i] = { ...newProgress[i], status: 'uploading' };
      setProgress([...newProgress]);

      // Upload directly to Supabase Storage from the browser
      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        newProgress[i] = { ...newProgress[i], status: 'error', error: uploadError.message };
        setProgress([...newProgress]);
        continue;
      }

      // Save metadata via server action (lightweight, no file data)
      newProgress[i] = { ...newProgress[i], status: 'saving' };
      setProgress([...newProgress]);

      const documentType = fileTypes[`${file.name}-${file.size}`] ?? 'altro';
      const result = await saveDocumentMetadata({
        caseId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        documentType,
      });

      if (result?.error) {
        newProgress[i] = { ...newProgress[i], status: 'error', error: result.error };
        setProgress([...newProgress]);
        continue;
      }

      newProgress[i] = { ...newProgress[i], status: 'done' };
      setProgress([...newProgress]);
      successCount++;
    }

    // Update case document count
    if (successCount > 0) {
      await updateCaseDocumentCount(caseId);
      setFiles([]);
      onUploadComplete?.();
    }

    setIsUploading(false);
  }

  const doneCount = progress.filter((p) => p.status === 'done').length;
  const errorCount = progress.filter((p) => p.status === 'error').length;
  const allDone = progress.length > 0 && progress.every((p) => p.status === 'done' || p.status === 'error');

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="mb-1 text-sm font-medium">
          Trascina i file qui o clicca per selezionare
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG, TIFF, DOC, DOCX, XLS, XLSX &mdash; nessun limite di dimensione
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* File list (before upload) */}
      {files.length > 0 && !isUploading && progress.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{files.length} file selezionati</p>
          {files.map((file, index) => {
            const Icon = getFileIcon(file.type);
            return (
              <div
                key={`${file.name}-${file.size}`}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                </div>
                <Select
                  value={fileTypes[`${file.name}-${file.size}`] ?? 'altro'}
                  onValueChange={(v) => setFileTypes((prev) => ({ ...prev, [`${file.name}-${file.size}`]: v }))}
                >
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}

          <Button onClick={handleUpload} className="w-full">
            <Upload className="h-4 w-4" />
            Carica {files.length} {files.length === 1 ? 'documento' : 'documenti'}
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {progress.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {isUploading ? 'Caricamento in corso...' : `Completato: ${doneCount}/${progress.length}`}
          </p>
          {progress.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="truncate text-sm">{p.fileName}</span>
              <div className="shrink-0 ml-2">
                {p.status === 'pending' && (
                  <span className="text-xs text-muted-foreground">In attesa</span>
                )}
                {(p.status === 'uploading' || p.status === 'saving') && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {p.status === 'done' && (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                )}
                {p.status === 'error' && (
                  <span className="text-xs text-destructive">{p.error}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {allDone && (
        <div
          className={`rounded-md p-3 text-sm ${
            errorCount === 0
              ? 'bg-green-50 text-green-800'
              : 'bg-yellow-50 text-yellow-800'
          }`}
        >
          {errorCount === 0
            ? `${doneCount} documenti caricati con successo!`
            : `${doneCount} caricati, ${errorCount} con errori.`}
        </div>
      )}
    </div>
  );
}
