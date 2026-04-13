import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBalance } from '@/services/credits/credit-service';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 });
  }

  const balance = await getBalance(user.id);

  return NextResponse.json({ success: true, data: balance });
}
