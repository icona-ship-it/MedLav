import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCase, dataRetentionCleanup, organizeDocumentsJob } from '@/inngest';

export const maxDuration = 900;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCase,
    dataRetentionCleanup,
    organizeDocumentsJob,
  ],
  serveHost: 'https://legmed.vercel.app',
});
