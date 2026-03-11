import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createDemoCase } from '@/services/demo/create-demo-case';

/**
 * POST /api/demo
 * Create a demo case for the authenticated user.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
    }

    const caseId = await createDemoCase(user.id);

    if (!caseId) {
      return NextResponse.json({ success: false, error: 'Errore creazione caso demo' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { caseId } });
  } catch {
    return NextResponse.json({ success: false, error: 'Errore interno' }, { status: 500 });
  }
}
