'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, X, Loader2, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { saveDocumentMetadata, updateCaseDocumentCount, checkDuplicateDocument } from '@/app/(dashboard)/actions';
import { getFileIcon, formatFileSize } from '@/lib/format';
import { toUserMessage } from '@/lib/user-error-messages';
import { computeFileSha256 } from '@/lib/file-hash';

/** Mistral OCR processes ~50 MB / 1000 pages in a single pass; warn only when
 * a file approaches that ceiling. Upload itself accepts up to 100 MB
 * (PIPELINE_LIMITS.MAX_FILE_SIZE_MB) — oversized docs can be split after upload. */
const OCR_SINGLE_PASS_WARN_BYTES = 45 * 1024 * 1024;

interface FileUploadProps {
  caseId: string;
  onUploadComplete?: () => void;
  onUploadStart?: () => void;
}

interface UploadProgress {
  fileName: string;
  status: 'pending' | 'hashing' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
}

/** Formats the pipeline can actually process (mirrors the picker `accept`).
 * Drag&drop bypasses `accept`, so the same allowlist is enforced here — an
 * unsupported file (e.g. a signed .p7m) must be skipped with a clear
 * explanation, not fail server-side with a generic error. XML/TXT are
 * supported via the direct-text ingestion path (no OCR). */
const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'doc', 'docx', 'xls', 'xlsx', 'xml', 'txt',
]);

/** Browsers sometimes report an empty MIME for .xml/.txt — fall back by extension. */
function effectiveMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = fileExtension(file.name);
  if (ext === 'xml') return 'text/xml';
  if (ext === 'txt') return 'text/plain';
  return file.type;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function FileUpload({ caseId, onUploadComplete, onUploadStart }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const supported = fileArray.filter((f) => SUPPORTED_EXTENSIONS.has(fileExtension(f.name)));
    const skipped = fileArray.filter((f) => !SUPPORTED_EXTENSIONS.has(fileExtension(f.name)));
    setSkippedFiles(skipped.map((f) => f.name));
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const unique = supported.filter((f) => !existing.has(`${f.name}-${f.size}`));
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
    setSkippedFiles([]);
    onUploadStart?.();

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

      // Client-side guard: file vuoti vengono rifiutati dal server, evitiamo
      // di calcolare hash + caricare in Storage solo per ricevere errore.
      if (file.size === 0) {
        newProgress[i] = { ...newProgress[i], status: 'error', error: 'File vuoto: impossibile caricare' };
        setProgress([...newProgress]);
        continue;
      }

      // Compute SHA-256 for dedup. If hashing fails (very rare, large files
      // on quirky browsers), we proceed without dedup.
      newProgress[i] = { ...newProgress[i], status: 'hashing' };
      setProgress([...newProgress]);
      const contentHash = await computeFileSha256(file);

      // Pre-upload duplicate check — saves bandwidth on big files.
      if (contentHash) {
        const dupCheck = await checkDuplicateDocument({ caseId, contentHash });
        if (dupCheck?.duplicate) {
          newProgress[i] = {
            ...newProgress[i],
            status: 'error',
            error: `Già caricato come "${dupCheck.existingFileName}"`,
          };
          setProgress([...newProgress]);
          continue;
        }
      }

      newProgress[i] = { ...newProgress[i], status: 'uploading' };
      setProgress([...newProgress]);

      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: effectiveMimeType(file),
          upsert: false,
        });

      if (uploadError) {
        newProgress[i] = { ...newProgress[i], status: 'error', error: toUserMessage(uploadError.message) };
        setProgress([...newProgress]);
        continue;
      }

      newProgress[i] = { ...newProgress[i], status: 'saving' };
      setProgress([...newProgress]);

      // All documents upload as 'altro' — user categorizes after upload
      const result = await saveDocumentMetadata({
        caseId,
        fileName: file.name,
        fileType: effectiveMimeType(file),
        fileSize: file.size,
        storagePath,
        documentType: 'altro',
        contentHash: contentHash ?? undefined,
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

  // Auto-clear progress list 2s after all done (documents list below takes over)
  useEffect(() => {
    if (allDone && errorCount === 0) {
      const timer = setTimeout(() => setProgress([]), 2000);
      return () => clearTimeout(timer);
    }
  }, [allDone, errorCount]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Carica documenti"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <Upload className="mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-base font-medium">
          Trascina qui i documenti o <span className="text-primary underline">seleziona file</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, immagini, Word, Excel, XML, TXT
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx,.xls,.xlsx,.xml,.txt"
          aria-label="Carica documenti"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Unsupported files skipped at selection (e.g. busta telematica .xml) —
          dismissible, and cleared automatically when the upload starts */}
      {skippedFiles.length > 0 && !isUploading && (
        <div className="flex items-start gap-2 rounded-md bg-muted border p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">
            {skippedFiles.map((n) => `"${n}"`).join(', ')}: formato non supportato, file non aggiunto.
            Per gli atti firmati digitalmente (.p7m) estrai prima il PDF contenuto; per gli altri
            formati converti il file in PDF.
          </span>
          <button
            type="button"
            aria-label="Chiudi avviso"
            className="shrink-0 rounded p-0.5 hover:bg-accent"
            onClick={() => setSkippedFiles([])}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* File list (before upload) — names only, no type selection */}
      {files.length > 0 && !isUploading && progress.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{files.length} file selezionati</p>
            <Button onClick={handleUpload} size="lg">
              <Upload className="h-4 w-4" />
              Carica {files.length} {files.length === 1 ? 'documento' : 'documenti'}
            </Button>
          </div>

          {/* Warn ONLY near the real single-pass OCR limit (~50 MB): files
              below it are processed fine in one block — a lower threshold
              (was 10 MB) fired on every normal cartella clinica and pushed
              pointless manual splitting onto the user. */}
          {files.some((f) => f.size > OCR_SINGLE_PASS_WARN_BYTES) && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                {files.filter((f) => f.size > OCR_SINGLE_PASS_WARN_BYTES).map((f) => `"${f.name}"`).join(', ')}
                {files.filter((f) => f.size > OCR_SINGLE_PASS_WARN_BYTES).length === 1 ? ' supera' : ' superano'} i 45 MB:
                l&apos;analisi potrebbe non riuscire in un blocco unico. Se dovesse fallire,
                usa &quot;Dividi PDF&quot; dal menu del documento dopo il caricamento.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
            {files.map((file, index) => {
              const Icon = getFileIcon(file.type);
              return (
                <div
                  key={`${file.name}-${file.size}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                    aria-label={`Rimuovi ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button onClick={handleUpload} className="w-full" size="lg">
            <Upload className="h-4 w-4" />
            Carica {files.length} {files.length === 1 ? 'documento' : 'documenti'}
          </Button>
        </div>
      )}

      {/* Upload progress */}
      {progress.length > 0 && (
        <div className="space-y-3" aria-live="polite">
          <div className="space-y-2">
            <p className="text-sm font-bold">
              Caricamento: {doneCount + errorCount} di {progress.length} documenti
            </p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round(((doneCount + errorCount) / progress.length) * 100)}%` }}
              />
            </div>
            {isUploading && (
              <p className="text-xs text-muted-foreground">
                Non chiudere questa pagina durante il caricamento
              </p>
            )}
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {progress.map((p) => (
              <div
                key={p.fileName}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 border-l-4 ${
                  p.status === 'uploading' || p.status === 'saving' || p.status === 'hashing'
                    ? 'border-l-primary bg-primary/5'
                    : p.status === 'done'
                      ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/10'
                      : p.status === 'error'
                        ? 'border-l-destructive bg-destructive/5'
                        : 'border-l-muted-foreground/30'
                }`}
              >
                <span className={`truncate text-sm ${
                  p.status === 'pending' ? 'text-muted-foreground text-xs' : ''
                }`}>
                  {p.fileName}
                </span>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {p.status === 'pending' && (
                    <span className="text-xs text-muted-foreground">In attesa</span>
                  )}
                  {(p.status === 'uploading' || p.status === 'saving' || p.status === 'hashing') && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {p.status === 'hashing' && (
                    <span className="text-xs text-muted-foreground">Verifica duplicati</span>
                  )}
                  {p.status === 'done' && (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                  {p.status === 'error' && (
                    <span className="text-xs text-destructive">{p.error}</span>
                  )}
                  {(p.status === 'done' || p.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => setProgress((prev) => prev.filter((item) => item.fileName !== p.fileName))}
                      className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Rimuovi ${p.fileName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {allDone && (
        <div
          className={`rounded-md p-3 text-sm ${
            errorCount === 0
              ? 'bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-200'
              : 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-200'
          }`}
        >
          {errorCount === 0
            ? doneCount === 1
              ? '1 documento caricato con successo!'
              : `${doneCount} documenti caricati con successo!`
            : `${doneCount} caricati, ${errorCount} con errori.`}
        </div>
      )}
    </div>
  );
}
