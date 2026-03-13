'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  img: ({ src, alt, ...props }) => {
    // ocr-image: protocol is not resolved here — it should be pre-resolved
    // by replaceWithProxyUrls before passing to this component.
    // This handler ensures images render nicely in the preview.
    return (
      <figure className="my-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ''}
          className="mx-auto max-w-full h-auto rounded border border-border"
          loading="lazy"
          {...props}
        />
        {alt && (
          <figcaption className="mt-1 text-xs text-muted-foreground italic">
            {alt}
          </figcaption>
        )}
      </figure>
    );
  },
};

export function MarkdownPreview({ content, caseId }: { content: string; caseId?: string }) {
  // Pre-resolve ocr-image: placeholders to API proxy URLs
  let resolvedContent = content;
  if (caseId) {
    resolvedContent = content.replace(
      /!\[([^\]]*)\]\(ocr-image:([^)]+)\)/g,
      (_match, alt, path) => `![${alt}](/api/cases/${caseId}/images?path=${encodeURIComponent(path)})`,
    );
  }

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {resolvedContent}
      </ReactMarkdown>
    </div>
  );
}
