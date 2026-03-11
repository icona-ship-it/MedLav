import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCaseDocuments, dataRetentionCleanup } from '@/inngest';

export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCaseDocuments,
    dataRetentionCleanup,
  ],
});
