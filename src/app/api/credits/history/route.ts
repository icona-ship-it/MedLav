import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10),
    100,
  );
  const offset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credit_transactions')
    .select('id, amount, balance_after, type, operation, entity_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ success: false, error: 'Errore nel caricamento storico' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
