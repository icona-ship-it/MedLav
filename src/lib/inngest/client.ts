import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'legmed',
  // Required for true parallel steps (Promise.all of step.run) without the
  // 2-roundtrip-per-step penalty. Default behaviour in SDK v4; with this flag
  // Promise.all/allSettled wait for ALL parallel steps to settle before resolving.
  optimizeParallelism: true,
});
