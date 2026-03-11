import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';

/**
 * GET /api/cases/[id]/calculations
 * Calculate medico-legal periods from case events.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const rateCheck = await checkRateLimit({ key: `calculations:${user.id}`, ...RATE_LIMITS.API });
  if (!rateCheck.success) {
    return NextResponse.json({ success: false, error: 'Troppe richieste. Riprova tra poco.' }, { status: 429 });
  }

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) {
    return NextResponse.json({ success: false, error: 'Caso non trovato' }, { status: 404 });
  }

  const { data: eventsData } = await supabase
    .from('events')
    .select('event_date, event_type, title, description')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('order_number', { ascending: true });

  const calculations = calculateMedicoLegalPeriods(eventsData ?? []);

  return NextResponse.json({
    success: true,
    data: { calculations },
  });
}
