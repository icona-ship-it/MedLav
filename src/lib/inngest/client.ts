import { Inngest } from 'inngest';
import { encryptionMiddleware } from '@inngest/middleware-encryption';

// GDPR Art. 9: i valori di ritorno degli step e i dati evento vengono persistiti
// da Inngest come stato-run (per il replay). Su Inngest Cloud (infra US di
// default) questo farebbe transitare dati personali/clinici fuori dal SEE. Il
// middleware di cifratura li cifra PRIMA che lascino il processo: Inngest vede
// solo testo cifrato, la decifratura avviene solo dentro le nostre funzioni.
// Attivo quando INNGEST_ENCRYPTION_KEY è impostata (OBBLIGATORIA in produzione;
// in locale/dev senza chiave resta trasparente).
const encryptionKey = process.env.INNGEST_ENCRYPTION_KEY;

export const inngest = new Inngest({
  id: 'legmed',
  // Required for true parallel steps (Promise.all of step.run) without the
  // 2-roundtrip-per-step penalty. Default behaviour in SDK v4; with this flag
  // Promise.all/allSettled wait for ALL parallel steps to settle before resolving.
  optimizeParallelism: true,
  ...(encryptionKey ? { middleware: [encryptionMiddleware({ key: encryptionKey })] } : {}),
});
