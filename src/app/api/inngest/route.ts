import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCaseDocuments } from '@/inngest';

export const maxDuration = 120;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCaseDocuments,
  ],
});
