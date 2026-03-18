import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCase, dataRetentionCleanup } from '@/inngest';

export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCase,
    dataRetentionCleanup,
  ],
  serveHost: 'https://medlav.vercel.app',
});
