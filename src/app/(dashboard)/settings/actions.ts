'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { logAccessArchived } from '@/lib/audit';

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

// 0 = sentinel "Mai" (conserva per sempre, scelta esplicita dell'utente).
// NULL in DB = mai configurato → il cron applica il default 365gg (DPIA §7).
// 'null' resta accettato per retrocompatibilita' e viene mappato su 0.
const VALID_RETENTION_DAYS = [0, 90, 180, 365, 730] as const;

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
 * Accepts a number of days (90, 180, 365, 730) or 0 = "Mai" (keep forever,
 * explicit choice). Stored as 0 — NOT as NULL — so the retention cron can
 * distinguish the explicit opt-out from "never configured" (default 365).
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
    ? 0
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

  // GDPR Art. 20 audit — log forense (sopravvive a cancellazione utente)
  logAccessArchived({
    userId: user.id,
    action: 'user.data_exported',
    metadata: { exported_at: new Date().toISOString() },
  });

  const admin = createAdminClient();

  // Get user's case IDs first
  const { data: cases } = await admin.from('cases')
    .select('id, code, case_type, case_role, patient_initials, practice_reference, notes, status, created_at')
    .eq('user_id', user.id);

  const caseIds = (cases ?? []).map((c) => c.id as string);

  // Batched fetch helper to stay under PostgREST URL limit
  const EX_BATCH = 200;
  async function batchedFetch(table: string, columns: string): Promise<unknown[]> {
    const results: unknown[] = [];
    for (let i = 0; i < caseIds.length; i += EX_BATCH) {
      const { data } = await admin.from(table).select(columns).in('case_id', caseIds.slice(i, i + EX_BATCH));
      if (data) results.push(...data);
    }
    return results;
  }

  const [profileRes, auditRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', user.id).single(),
    admin.from('audit_log').select('action, entity_type, entity_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
  ]);

  // Fetch all case-related data (batched to avoid URL limit for users with many cases)
  const [eventsData, reportsData, documentsData, anomaliesData, missingDocsData, caseSharesData] = caseIds.length > 0
    ? await Promise.all([
      batchedFetch('events', 'id, case_id, event_date, event_type, title, description, source_type, confidence, created_at'),
      batchedFetch('reports', 'id, case_id, version, report_status, synthesis, created_at'),
      batchedFetch('documents', 'id, case_id, file_name, file_type, file_size, document_type, processing_status, created_at'),
      batchedFetch('anomalies', 'id, case_id, anomaly_type, severity, description, suggestion, created_at'),
      batchedFetch('missing_documents', 'id, case_id, document_name, reason, created_at'),
      batchedFetch('case_shares', 'id, case_id, label, expires_at, view_count, created_at'),
    ])
    : [[], [], [], [], [], []];

  const exportData = {
    exportDate: new Date().toISOString(),
    gdprArticle: 'Art. 15/20 GDPR — Diritto di accesso e portabilità',
    profile: profileRes.data,
    cases: cases ?? [],
    documents: documentsData,
    events: eventsData,
    anomalies: anomaliesData,
    missingDocuments: missingDocsData,
    reports: reportsData,
    caseShares: caseSharesData,
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

  // GDPR Art. 17 audit forense PRIMA della cancellazione — sopravvive al delete
  // by design (audit_archive non ha FK su profiles).
  logAccessArchived({
    userId: user.id,
    action: 'user.deleted',
    metadata: { requested_at: new Date().toISOString() },
  });

  const admin = createAdminClient();

  // Get all case IDs for this user
  const { data: cases } = await admin.from('cases').select('id').eq('user_id', user.id);
  const caseIds = (cases ?? []).map((c) => c.id as string);

  if (caseIds.length > 0) {
    // Delete in dependency order
    // Delete in batches to avoid PostgREST URL length limit (~8KB)
    const BATCH = 200;
    const { data: eventIds } = await admin.from('events').select('id').in('case_id', caseIds);
    if (eventIds && eventIds.length > 0) {
      const eIds = eventIds.map((e) => e.id as string);
      for (let i = 0; i < eIds.length; i += BATCH) {
        await admin.from('event_images').delete().in('event_id', eIds.slice(i, i + BATCH));
      }
    }
    for (let i = 0; i < caseIds.length; i += BATCH) {
      const batch = caseIds.slice(i, i + BATCH);
      await admin.from('events').delete().in('case_id', batch);
      await admin.from('anomalies').delete().in('case_id', batch);
      await admin.from('missing_documents').delete().in('case_id', batch);
      await admin.from('reports').delete().in('case_id', batch);
    }

    const { data: docs } = await admin.from('documents').select('id, storage_path').in('case_id', caseIds);
    if (docs && docs.length > 0) {
      const docIds = docs.map((d) => d.id as string);
      for (let i = 0; i < docIds.length; i += BATCH) {
        await admin.from('pages').delete().in('document_id', docIds.slice(i, i + BATCH));
      }

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

      // Remove cached document summaries (GDPR Art. 9 — derived clinical data)
      const { removeStoragePrefix } = await import('@/lib/supabase/storage');
      for (const docId of docIds) {
        await removeStoragePrefix(`doc-summaries/${docId}`);
      }
    }
    // GDPR Art. 9 (review 2026-07-04): parti di sezione transitorie del bucket
    // section-parts — vanno rimosse anche alla cancellazione dell'account.
    const { deleteCaseSectionParts } = await import('@/inngest/steps/section-part-store');
    for (const cId of caseIds) {
      await deleteCaseSectionParts(cId);
    }
    for (let i = 0; i < caseIds.length; i += BATCH) {
      const batch = caseIds.slice(i, i + BATCH);
      await admin.from('documents').delete().in('case_id', batch);
      await admin.from('cases').delete().in('id', batch);
    }
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
