import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processCase, regenerateReport, regenerateSectionJob, dataRetentionCleanup, classifyBatchJob, stuckCaseMonitor } from '@/inngest';

export const maxDuration = 800;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processCase,
    regenerateReport,
    regenerateSectionJob,
    dataRetentionCleanup,
    classifyBatchJob,
    stuckCaseMonitor,
  ],
  serveHost: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://legmed.vercel.app',
});
