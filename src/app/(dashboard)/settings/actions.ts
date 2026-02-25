'use server';

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const profileSchema = z.object({
  fullName: z.string().min(1, 'Il nome e obbligatorio'),
  studio: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Inserisci la password attuale'),
  newPassword: z.string().min(8, 'La nuova password deve avere almeno 8 caratteri'),
  confirmPassword: z.string().min(1, 'Conferma la nuova password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Le password non coincidono',
  path: ['confirmPassword'],
});

export interface ProfileData {
  fullName: string;
  studio: string;
  email: string;
}

export async function getProfile(): Promise<ProfileData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Non autenticato');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, studio, email')
    .eq('id', user.id)
    .single();

  return {
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? '',
    studio: profile?.studio ?? '',
    email: profile?.email ?? user.email ?? '',
  };
}

export async function updateProfile(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const rawData = {
    fullName: formData.get('fullName') as string,
    studio: formData.get('studio') as string,
  };

  const parsed = profileSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      studio: parsed.data.studio ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Errore durante il salvataggio. Riprova.' };
  }

  return { success: true };
}

export async function changePassword(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const rawData = {
    currentPassword: formData.get('currentPassword') as string,
    newPassword: formData.get('newPassword') as string,
    confirmPassword: formData.get('confirmPassword') as string,
  };

  const parsed = passwordSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  // Verify current password by trying to sign in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: parsed.data.currentPassword,
  });

  if (signInError) {
    return { error: 'La password attuale non e corretta' };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) {
    return { error: 'Errore durante il cambio password. Riprova.' };
  }

  return { success: true };
}
