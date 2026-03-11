'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Fetch all extracted events for a case, ordered chronologically.
 */
export async function getCaseEvents(caseId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('case_id', caseId)
    .eq('is_deleted', false)
    .order('order_number', { ascending: true });

  return data ?? [];
}

/**
 * Update an event (edit fields, add expert notes).
 * Verifies case ownership via RLS.
 */
export async function updateEvent(params: {
  eventId: string;
  caseId: string;
  title?: string;
  description?: string;
  eventType?: string;
  eventDate?: string;
  datePrecision?: string;
  sourceType?: string;
  diagnosis?: string | null;
  doctor?: string | null;
  facility?: string | null;
  expertNotes?: string | null;
  requiresVerification?: boolean;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title !== undefined) updateFields.title = params.title;
  if (params.description !== undefined) updateFields.description = params.description;
  if (params.eventType !== undefined) updateFields.event_type = params.eventType;
  if (params.eventDate !== undefined) updateFields.event_date = params.eventDate;
  if (params.datePrecision !== undefined) updateFields.date_precision = params.datePrecision;
  if (params.sourceType !== undefined) updateFields.source_type = params.sourceType;
  if (params.diagnosis !== undefined) updateFields.diagnosis = params.diagnosis;
  if (params.doctor !== undefined) updateFields.doctor = params.doctor;
  if (params.facility !== undefined) updateFields.facility = params.facility;
  if (params.expertNotes !== undefined) updateFields.expert_notes = params.expertNotes;
  if (params.requiresVerification !== undefined) updateFields.requires_verification = params.requiresVerification;

  const { error } = await supabase
    .from('events')
    .update(updateFields)
    .eq('id', params.eventId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore aggiornamento evento' };

  // Audit log
  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.updated',
    entity_type: 'event',
    entity_id: params.eventId,
    metadata: { caseId: params.caseId, fields: Object.keys(updateFields) },
  });

  return { success: true };
}

/**
 * Soft-delete an event (zero discard policy -- never hard delete).
 */
export async function deleteEvent(params: { eventId: string; caseId: string }) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const { error } = await supabase
    .from('events')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', params.eventId)
    .eq('case_id', params.caseId);

  if (error) return { error: 'Errore eliminazione evento' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.deleted',
    entity_type: 'event',
    entity_id: params.eventId,
    metadata: { caseId: params.caseId },
  });

  return { success: true };
}

/**
 * Add a manual event created by the expert.
 */
export async function addManualEvent(params: {
  caseId: string;
  eventDate: string;
  datePrecision: string;
  eventType: string;
  title: string;
  description: string;
  sourceType: string;
  diagnosis?: string | null;
  doctor?: string | null;
  facility?: string | null;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Get the current max order number
  const { data: lastEvent } = await supabase
    .from('events')
    .select('order_number')
    .eq('case_id', params.caseId)
    .order('order_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (lastEvent?.order_number ?? 0) + 1;

  const { data: newEvent, error } = await supabase
    .from('events')
    .insert({
      case_id: params.caseId,
      order_number: nextOrder,
      event_date: params.eventDate,
      date_precision: params.datePrecision,
      event_type: params.eventType,
      title: params.title,
      description: params.description,
      source_type: params.sourceType,
      diagnosis: params.diagnosis ?? null,
      doctor: params.doctor ?? null,
      facility: params.facility ?? null,
      confidence: 100,
      requires_verification: false,
      reliability_notes: 'Evento aggiunto manualmente dal perito',
    })
    .select('id')
    .single();

  if (error) return { error: 'Errore creazione evento' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'event.created_manual',
    entity_type: 'event',
    entity_id: newEvent.id,
    metadata: { caseId: params.caseId },
  });

  return { success: true, eventId: newEvent.id };
}

/**
 * Batch update event types (re-tag "altro" events).
 */
export async function batchUpdateEventTypes(params: {
  caseId: string;
  updates: Array<{ eventId: string; newType: string }>;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  const results = await Promise.all(
    params.updates.map((u) =>
      supabase
        .from('events')
        .update({ event_type: u.newType, updated_at: new Date().toISOString() })
        .eq('id', u.eventId)
        .eq('case_id', params.caseId),
    ),
  );

  const hasError = results.some((r) => r.error);
  if (hasError) return { error: 'Errore aggiornamento eventi' };

  await supabase.from('audit_log').insert({
    user_id: user.id,
    action: 'events.batch_retagged',
    entity_type: 'case',
    entity_id: params.caseId,
    metadata: { count: params.updates.length },
  });

  return { success: true };
}

/**
 * Reorder an event by swapping order_number with its neighbor.
 */
export async function reorderEvent(params: {
  caseId: string;
  eventId: string;
  direction: 'up' | 'down';
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autenticato' };

  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', params.caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return { error: 'Caso non trovato' };

  // Fetch all events ordered
  const { data: events } = await supabase
    .from('events')
    .select('id, order_number')
    .eq('case_id', params.caseId)
    .eq('is_deleted', false)
    .order('order_number', { ascending: true });

  if (!events || events.length < 2) return { error: 'Non ci sono abbastanza eventi' };

  const currentIndex = events.findIndex((e) => e.id === params.eventId);
  if (currentIndex === -1) return { error: 'Evento non trovato' };

  const swapIndex = params.direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= events.length) return { error: 'Impossibile spostare' };

  const currentEvent = events[currentIndex];
  const swapEvent = events[swapIndex];

  // Swap order_numbers
  const { error: err1 } = await supabase
    .from('events')
    .update({ order_number: swapEvent.order_number, updated_at: new Date().toISOString() })
    .eq('id', currentEvent.id);

  const { error: err2 } = await supabase
    .from('events')
    .update({ order_number: currentEvent.order_number, updated_at: new Date().toISOString() })
    .eq('id', swapEvent.id);

  if (err1 || err2) return { error: 'Errore riordino eventi' };

  return { success: true };
}

/**
 * Fetch event-level images for a case.
 * Uses the event_images junction table (linked by sourcePages).
 * Falls back to document-level images for events without sourcePages.
 * Returns a map of eventId -> image storage paths.
 */
export async function getCaseEventImages(caseId: string): Promise<Record<string, string[]>> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  // Verify case ownership
  const { data: caseData } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', user.id)
    .single();

  if (!caseData) return {};

  // Get events for this case
  const { data: events } = await supabase
    .from('events')
    .select('id, document_id, source_pages')
    .eq('case_id', caseId)
    .eq('is_deleted', false);

  if (!events || events.length === 0) return {};

  const eventIds = events.map((e) => e.id);

  // Get event_images links
  const { data: eventImagesRaw } = await supabase
    .from('event_images')
    .select('event_id, image_path')
    .in('event_id', eventIds);

  const result: Record<string, string[]> = {};

  // Group by event_id
  if (eventImagesRaw && eventImagesRaw.length > 0) {
    for (const row of eventImagesRaw) {
      const eventId = row.event_id as string;
      if (!result[eventId]) {
        result[eventId] = [];
      }
      result[eventId].push(row.image_path as string);
    }
  }

  // Fallback: for events without event_images, use document-level images
  const eventsWithoutImages = events.filter(
    (e) => !result[e.id as string] && e.document_id,
  );

  if (eventsWithoutImages.length > 0) {
    const docIds = [...new Set(eventsWithoutImages.map((e) => e.document_id as string))];

    const { data: pages } = await supabase
      .from('pages')
      .select('document_id, image_path')
      .in('document_id', docIds)
      .not('image_path', 'is', null);

    if (pages && pages.length > 0) {
      // Build docId -> paths map
      const docImageMap: Record<string, string[]> = {};
      for (const page of pages) {
        const docId = page.document_id as string;
        const paths = (page.image_path as string).split(';').filter(Boolean);
        if (!docImageMap[docId]) {
          docImageMap[docId] = [];
        }
        docImageMap[docId].push(...paths);
      }

      // Assign to events
      for (const event of eventsWithoutImages) {
        const docId = event.document_id as string;
        if (docImageMap[docId] && docImageMap[docId].length > 0) {
          result[event.id as string] = docImageMap[docId];
        }
      }
    }
  }

  return result;
}
