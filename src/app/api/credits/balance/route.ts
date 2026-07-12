import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBalance } from '@/services/credits/credit-service';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rate = await checkRateLimit({ key: `credits-balance:${user.id}`, ...RATE_LIMITS.API });
  if (!rate.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste.' }, { status: 429 });
  }

  try {
    const balance = await getBalance(user.id);
    return NextResponse.json({ success: true, data: balance });
  } catch (error) {
    logger.error('credits/balance', `getBalance failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return NextResponse.json({ success: false, error: 'Errore nel recupero crediti.' }, { status: 500 });
  }
}
