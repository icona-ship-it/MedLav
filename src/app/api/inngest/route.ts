import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCasePhase1, processCasePhase2, dataRetentionCleanup } from '@/inngest';

export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCasePhase1,
    processCasePhase2,
    dataRetentionCleanup,
  ],
  serveHost: 'https://medlav.vercel.app',
});
