import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCase, dataRetentionCleanup, organizeDocumentsJob, classifyBatchJob } from '@/inngest';

export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCase,
    dataRetentionCleanup,
    organizeDocumentsJob,
    classifyBatchJob,
  ],
  serveHost: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://legmed.vercel.app',
});
