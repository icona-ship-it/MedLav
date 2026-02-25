'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function signUp(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;

  if (!email || !password || !fullName) {
    return { error: 'Tutti i campi sono obbligatori' };
  }

  const rateCheck = checkRateLimit({ key: `signup:${email}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  if (password.length < 8) {
    return { error: 'La password deve avere almeno 8 caratteri' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Questa email è già registrata' };
    }
    return { error: 'Errore durante la registrazione. Riprova.' };
  }

  // Create profile in profiles table
  if (data.user) {
    const admin = createAdminClient();
    await admin.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  redirect('/');
}

export async function signIn(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Inserisci email e password' };
  }

  const rateCheck = checkRateLimit({ key: `auth:${email}`, ...RATE_LIMITS.AUTH });
  if (!rateCheck.success) {
    return { error: 'Troppi tentativi. Riprova tra qualche minuto.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Email o password non corretti' };
    }
    return { error: 'Errore durante il login. Riprova.' };
  }

  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/landing');
}
