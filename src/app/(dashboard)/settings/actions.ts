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

const VALID_RETENTION_DAYS = [90, 180, 365, 730] as const;

const retentionSchema = z.object({
  retentionDays: z.union([
    z.literal('null'),
    z.string().refine(
      (val) => VALID_RETENTION_DAYS.includes(Number(val) as typeof VALID_RETENTION_DAYS[number]),
      'Valore di conservazione non valido',
    ),
  ]),
});

export interface ProfileData {
  fullName: string;
  studio: string;
  email: string;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  stripeCustomerId: string | null;
  dataRetentionDays: number | null;
  emailNotifications: boolean;
  signatureImagePath: string | null;
}

export async function getProfile(): Promise<ProfileData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Non autenticato');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, studio, email, subscription_status, subscription_plan, stripe_customer_id, data_retention_days, email_notifications, signature_image_path')
    .eq('id', user.id)
    .single();

  return {
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? '',
    studio: profile?.studio ?? '',
    email: profile?.email ?? user.email ?? '',
    subscriptionStatus: (profile?.subscription_status as string) ?? null,
    subscriptionPlan: (profile?.subscription_plan as string) ?? null,
    stripeCustomerId: (profile?.stripe_customer_id as string) ?? null,
    dataRetentionDays: (profile?.data_retention_days as number) ?? 365,
    emailNotifications: (profile?.email_notifications as boolean) ?? true,
    signatureImagePath: (profile?.signature_image_path as string) ?? null,
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
 * Update the user's data retention policy.
 * Accepts a number of days (90, 180, 365, 730) or null for indefinite retention.
 */
export async function updateRetentionPolicy(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const rawData = {
    retentionDays: formData.get('retentionDays') as string,
  };

  const parsed = retentionSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  const retentionValue = parsed.data.retentionDays === 'null'
    ? null
    : Number(parsed.data.retentionDays);

  const { error } = await supabase
    .from('profiles')
    .update({
      data_retention_days: retentionValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Errore durante il salvataggio. Riprova.' };
  }

  return { success: true };
}

/**
 * Toggle email notifications for the authenticated user.
 */
export async function updateEmailNotifications(
  enabled: boolean,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Non autenticato' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      email_notifications: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    return { error: 'Errore durante il salvataggio. Riprova.' };
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

  const [profileRes, eventsRes, reportsRes, auditRes, documentsRes, anomaliesRes, missingDocsRes, caseSharesRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    caseIds.length > 0
      ? admin.from('events').select('id, case_id, event_date, event_type, title, description, source_type, confidence, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    caseIds.length > 0
      ? admin.from('reports').select('id, case_id, version, report_status, synthesis, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    admin.from('audit_log').select('action, entity_type, entity_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
    caseIds.length > 0
      ? admin.from('documents').select('id, case_id, file_name, file_type, file_size, document_type, processing_status, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    caseIds.length > 0
      ? admin.from('anomalies').select('id, case_id, anomaly_type, severity, description, suggestion, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    caseIds.length > 0
      ? admin.from('missing_documents').select('id, case_id, document_name, reason, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
    caseIds.length > 0
      ? admin.from('case_shares').select('id, case_id, label, expires_at, view_count, created_at').in('case_id', caseIds)
      : Promise.resolve({ data: [] }),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    gdprArticle: 'Art. 15/20 GDPR — Diritto di accesso e portabilità',
    profile: profileRes.data,
    cases: cases ?? [],
    documents: documentsRes.data ?? [],
    events: eventsRes.data ?? [],
    anomalies: anomaliesRes.data ?? [],
    missingDocuments: missingDocsRes.data ?? [],
    reports: reportsRes.data ?? [],
    caseShares: caseSharesRes.data ?? [],
    auditLog: auditRes.data ?? [],
  };

  return { data: JSON.stringify(exportData, null, 2) };
}

/**
 * Upload a digital signature image to Supabase Storage.
 * Max 500KB, images only (PNG/JPG/WEBP).
 */
export async function uploadSignature(formData: FormData): Promise<{ error?: string; path?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const file = formData.get('signature') as File | null;
  if (!file) return { error: 'Nessun file selezionato' };

  if (file.size > 500_000) return { error: 'Il file è troppo grande. Massimo 500KB.' };

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return { error: 'Formato non supportato. Usa PNG, JPG o WEBP.' };
  }

  // Derive extension from validated MIME type, not user filename (security)
  const mimeToExt: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  const ext = mimeToExt[file.type] ?? 'png';
  const storagePath = `signatures/${user.id}/signature.${ext}`;

  const admin = createAdminClient();

  // Ensure bucket exists (idempotent)
  await admin.storage.createBucket('signatures', { public: false, fileSizeLimit: 500_000 }).catch(() => {
    // Bucket already exists — ignore
  });

  const { error: uploadError } = await admin.storage
    .from('signatures')
    .upload(storagePath, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return { error: 'Errore durante il caricamento della firma. Riprova.' };
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      signature_image_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateError) return { error: 'Errore durante il salvataggio. Riprova.' };

  return { path: storagePath };
}

/**
 * Delete the user's digital signature.
 */
export async function deleteSignature(): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('signature_image_path')
    .eq('id', user.id)
    .single();

  const path = profile?.signature_image_path as string | null;
  if (path) {
    try {
      const admin = createAdminClient();
      await admin.storage.from('signatures').remove([path]);
    } catch {
      // File may not exist in storage — proceed with DB cleanup
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      signature_image_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { error: 'Errore durante la rimozione. Riprova.' };
  return { success: true };
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

    const { data: docs } = await admin.from('documents').select('id, storage_path').in('case_id', caseIds);
    if (docs && docs.length > 0) {
      const docIds = docs.map((d) => d.id as string);
      await admin.from('pages').delete().in('document_id', docIds);

      // Remove document files from Storage
      const docStoragePaths = docs
        .map((d) => d.storage_path as string)
        .filter(Boolean);
      if (docStoragePaths.length > 0) {
        await admin.storage.from('documents').remove(docStoragePaths);
      }

      // Remove OCR-extracted images from Storage (GDPR Art. 9 — diagnostic images)
      const ocrImagePaths: string[] = [];
      for (const docId of docIds) {
        const { data: listed } = await admin.storage
          .from('documents')
          .list(`ocr-images/${docId}`);
        if (listed && listed.length > 0) {
          ocrImagePaths.push(...listed.map((f) => `ocr-images/${docId}/${f.name}`));
        }
      }
      if (ocrImagePaths.length > 0) {
        // Supabase remove() supports up to 1000 paths per call
        for (let i = 0; i < ocrImagePaths.length; i += 1000) {
          await admin.storage.from('documents').remove(ocrImagePaths.slice(i, i + 1000));
        }
      }
    }
    await admin.from('documents').delete().in('case_id', caseIds);
    await admin.from('cases').delete().in('id', caseIds);
  }

  // Remove signature image from Storage (if uploaded)
  const { data: profileRow } = await admin
    .from('profiles')
    .select('signature_image_path')
    .eq('id', user.id)
    .single();
  const sigPath = (profileRow?.signature_image_path as string | null);
  if (sigPath) {
    await admin.storage.from('signatures').remove([sigPath]).catch(() => {
      // File may not exist — proceed with DB cleanup
    });
  }

  // Deliberate: audit logs are deleted with the account per GDPR Art. 17 (right to erasure).
  // The DB schema uses onDelete: 'set null' on user_id FK, but we explicitly delete here
  // to ensure full data erasure as required for health data under Art. 9.
  await admin.from('audit_log').delete().eq('user_id', user.id);
  await admin.from('profiles').delete().eq('id', user.id);
  await admin.auth.admin.deleteUser(user.id);

  await supabase.auth.signOut();
  redirect('/landing');
}
