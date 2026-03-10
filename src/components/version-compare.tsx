'use client';

import { useState } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MarkdownPreview } from '@/components/markdown-preview';

interface ReportVersion {
  id: string;
  version: number;
  report_status: string;
  synthesis: string | null;
}

export function VersionCompare({
  currentReport,
  versions,
}: {
  currentReport: ReportVersion;
  versions: ReportVersion[];
}) {
  const olderVersions = versions.filter((v) => v.version < currentReport.version);
  const [selectedVersion, setSelectedVersion] = useState<string>(
    olderVersions.length > 0 ? olderVersions[0].id : '',
  );

  const selectedReport = versions.find((v) => v.id === selectedVersion);

  if (olderVersions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nessuna versione precedente disponibile.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Confronta con:</span>
        <Select value={selectedVersion} onValueChange={setSelectedVersion}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {olderVersions.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                v{v.version} ({v.report_status})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            v{selectedReport?.version ?? '?'} (precedente)
          </p>
          <div className="rounded-md border p-4 max-h-[600px] overflow-y-auto">
            {selectedReport?.synthesis ? (
              <MarkdownPreview content={selectedReport.synthesis} />
            ) : (
              <p className="text-sm text-muted-foreground">Nessun contenuto</p>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            v{currentReport.version} (attuale)
          </p>
          <div className="rounded-md border p-4 max-h-[600px] overflow-y-auto">
            {currentReport.synthesis ? (
              <MarkdownPreview content={currentReport.synthesis} />
            ) : (
              <p className="text-sm text-muted-foreground">Nessun contenuto</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
