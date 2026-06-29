// Usa-e-getta: aspetta che atterri la v5 di Bigon (o rileva fallimento/timeout). Read-only.
import { createClient } from '@supabase/supabase-js';

const CASE_ID = '973bf5ad-698d-40f5-84c6-cfa89705d35c';
const BASELINE = 4;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const deadline = Date.now() + 20 * 60 * 1000;
  let sawRunning = false;
  while (Date.now() < deadline) {
    const { data: rep } = await sb.from('reports')
      .select('version').eq('case_id', CASE_ID)
      .order('version', { ascending: false }).limit(1).single();
    const { data: c } = await sb.from('cases')
      .select('processing_stage').eq('id', CASE_ID).single();
    const v = rep?.version ?? 0;
    const stage = c?.processing_stage ?? '?';
    if (v > BASELINE) { console.log(`V5_READY version=${v} stage=${stage}`); return; }
    if (stage === 'generazione_report') sawRunning = true;
    else if (sawRunning) { console.log(`FAILED_AGAIN stage=${stage} version=${v}`); return; }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.log('TIMEOUT no v5 after 20min');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
