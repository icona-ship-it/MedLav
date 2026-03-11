'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const profileSchema = z.object({
  fullName: z.string().min(1, 'Il nome è obbligatorio'),
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
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  stripeCustomerId: string | null;
}

export async function getProfile(): Promise<ProfileData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Non autenticato');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, studio, email, subscription_status, subscription_plan, stripe_customer_id')
    .eq('id', user.id)
    .single();

  return {
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? '',
    studio: profile?.studio ?? '',
    email: profile?.email ?? user.email ?? '',
    subscriptionStatus: (profile?.subscription_status as string) ?? null,
    subscriptionPlan: (profile?.subscription_plan as string) ?? null,
    stripeCustomerId: (profile?.stripe_customer_id as string) ?? null,
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
    return { error: 'La password attuale non è corretta' };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) {
    return { error: 'Errore durante il cambio password. Riprova.' };
  }

  return { success: true };
}

/**
 * GDPR Art. 15/20 — Export all user data as JSON.
 */
export async function exportMyData(): Promise<{ data?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  const admin = createAdminClient();

  // Get user's case IDs first
  const { data: cases } = await admin.from('cases')
    .select('id, code, case_type, case_role, patient_initials, practice_reference, notes, status, created_at')
    .eq('user_id', user.id);

  const caseIds = (cases ?? []).map((c) => c.id as string);

  const [profileRes, eventsRes, reportsRes, auditRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    caseIds.length > 0
      ? admin.from('events').select('id, case_id, event_date, event_type, title, description, source_type, confidence, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    caseIds.length > 0
      ? admin.from('reports').select('id, case_id, version, report_status, synthesis, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    admin.from('audit_log').select('action, entity_type, entity_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    gdprArticle: 'Art. 15/20 GDPR — Diritto di accesso e portabilità',
    profile: profileRes.data,
    cases: cases ?? [],
    events: eventsRes.data ?? [],
    reports: reportsRes.data ?? [],
    auditLog: auditRes.data ?? [],
  };

  return { data: JSON.stringify(exportData, null, 2) };
}

/**
 * GDPR Art. 17 — Delete all user data and account.
 * This is irreversible.
 */
export async function deleteMyAccount(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  const admin = createAdminClient();

  // Get all case IDs for this user
  const { data: cases } = await admin.from('cases').select('id').eq('user_id', user.id);
  const caseIds = (cases ?? []).map((c) => c.id as string);

  if (caseIds.length > 0) {
    // Delete in dependency order
    const { data: eventIds } = await admin.from('events').select('id').in('case_id', caseIds);
    if (eventIds && eventIds.length > 0) {
      await admin.from('event_images').delete().in('event_id', eventIds.map((e) => e.id));
    }
    await admin.from('events').delete().in('case_id', caseIds);
    await admin.from('anomalies').delete().in('case_id', caseIds);
    await admin.from('missing_documents').delete().in('case_id', caseIds);
    await admin.from('reports').delete().in('case_id', caseIds);

    const { data: docs } = await admin.from('documents').select('id').in('case_id', caseIds);
    if (docs && docs.length > 0) {
      await admin.from('pages').delete().in('document_id', docs.map((d) => d.id));
    }
    await admin.from('documents').delete().in('case_id', caseIds);
    await admin.from('cases').delete().in('id', caseIds);
  }

  await admin.from('audit_log').delete().eq('user_id', user.id);
  await admin.from('profiles').delete().eq('id', user.id);
  await admin.auth.admin.deleteUser(user.id);

  await supabase.auth.signOut();
  redirect('/landing');
}
