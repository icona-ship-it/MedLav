'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import { Markdown } from 'tiptap-markdown';
import type { MarkdownStorage } from 'tiptap-markdown';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Underline as UnderlineIcon, Heading2, Heading3,
  List, ListOrdered, Undo, Redo,
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  caseId?: string;
  className?: string;
  /** Heading levels to allow. Default: [2, 3]. Use [3] in section editors to prevent ## conflicts. */
  allowedHeadingLevels?: (1 | 2 | 3 | 4 | 5 | 6)[];
}

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ active, onClick, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-muted transition-colors',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

const OCR_IMAGE_REGEX = /ocr-image:([^\s)]+)/g;

function resolveOcrImageUrls(markdown: string, caseId?: string): string {
  if (!caseId) return markdown;
  return markdown.replace(
    OCR_IMAGE_REGEX,
    (_match, path) => `/api/cases/${caseId}/images?path=${encodeURIComponent(path)}`,
  );
}

function unresolveOcrImageUrls(markdown: string, caseId?: string): string {
  if (!caseId) return markdown;
  const proxyPattern = new RegExp(
    `/api/cases/${caseId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/images\\?path=([^\\s)]+)`,
    'g',
  );
  return markdown.replace(proxyPattern, (_match, encodedPath) =>
    `ocr-image:${decodeURIComponent(encodedPath)}`,
  );
}

export function RichTextEditor({ content, onChange, caseId, className, allowedHeadingLevels = [2, 3] }: RichTextEditorProps) {
  const isUpdatingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: allowedHeadingLevels as unknown as [1, 2, 3, 4, 5, 6] },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Underline,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: resolveOcrImageUrls(content, caseId),
    onUpdate: ({ editor: ed }) => {
      if (isUpdatingRef.current) return;
      const storage = ed.storage as unknown as Record<string, MarkdownStorage>;
      const md = storage.markdown.getMarkdown();
      onChange(unresolveOcrImageUrls(md, caseId));
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[60vh] px-6 py-4',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const resolved = resolveOcrImageUrls(content, caseId);
    const storage = editor.storage as unknown as Record<string, MarkdownStorage>;
    const currentMd = storage.markdown.getMarkdown();
    const currentUnresolved = unresolveOcrImageUrls(currentMd, caseId);
    if (currentUnresolved !== content) {
      isUpdatingRef.current = true;
      editor.commands.setContent(resolved);
      isUpdatingRef.current = false;
    }
  }, [content, caseId, editor]);

  if (!editor) return null;

  return (
    <div className={cn('flex flex-col border rounded-md overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 flex-wrap">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Grassetto"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Corsivo"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Sottolineato"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        {allowedHeadingLevels.includes(2) && (
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Intestazione 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
        )}
        {allowedHeadingLevels.includes(3) && (
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Intestazione 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Elenco puntato"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Elenco numerato"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Annulla"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Ripeti"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-background">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
