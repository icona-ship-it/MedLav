import { createAdminClient } from '@/lib/supabase/admin';
import { chunkGuidelineText } from './chunking-service';
import { generateEmbeddings } from './embedding-service';
import { logger } from '@/lib/logger';

export interface IngestGuidelineParams {
  title: string;
  source: string;
  year?: number;
  caseTypes: string[];
  text: string; // full guideline text (pre-extracted from PDF)
}

export interface IngestResult {
  guidelineId: string;
  chunksCreated: number;
  totalTokens: number;
}

/**
 * Ingest a clinical guideline into the RAG system.
 * Steps: chunk text → generate embeddings → store in DB.
 */
export async function ingestGuideline(params: IngestGuidelineParams): Promise<IngestResult> {
  const { title, source, year, caseTypes, text } = params;
  const supabase = createAdminClient();

  logger.info('rag:ingest', ` Starting ingestion: "${title}" (${text.length} chars)`);

  // 1. Chunk the text
  const chunks = chunkGuidelineText(text);
  logger.info('rag:ingest', ` Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error('No chunks created from guideline text');
  }

  // 2. Generate embeddings for all chunks
  const chunkTexts = chunks.map((c) => c.content);
  const embeddings = await generateEmbeddings(chunkTexts);
  logger.info('rag:ingest', ` Generated ${embeddings.length} embeddings`);

  // 3. Create guideline metadata record
  const { data: guideline, error: guidelineError } = await supabase
    .from('guidelines')
    .insert({
      title,
      source,
      year: year ?? null,
      case_types: caseTypes,
      chunk_count: chunks.length,
      is_active: 1,
    })
    .select('id')
    .single();

  if (guidelineError || !guideline) {
    throw new Error(`Failed to create guideline record: ${guidelineError?.message ?? 'no data'}`);
  }

  const guidelineId = guideline.id as string;

  // 4. Insert chunks with embeddings
  // pgvector expects the embedding as a string like '[0.1, 0.2, ...]'
  const chunkRows = chunks.map((chunk, i) => ({
    guideline_id: guidelineId,
    chunk_index: chunk.chunkIndex,
    content: chunk.content,
    section_title: chunk.sectionTitle ?? null,
    embedding: `[${embeddings[i].join(',')}]`,
    token_count: chunk.estimatedTokens,
  }));

  // Insert in batches of 50 to avoid payload limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
    const batch = chunkRows.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await supabase
      .from('guideline_chunks')
      .insert(batch);

    if (insertError) {
      throw new Error(`Failed to insert chunk batch ${i}: ${insertError.message}`);
    }
  }

  const totalTokens = chunks.reduce((sum, c) => sum + c.estimatedTokens, 0);
  logger.info('rag:ingest', ` Complete: ${chunks.length} chunks, ~${totalTokens} tokens`);

  return { guidelineId, chunksCreated: chunks.length, totalTokens };
}

/**
 * Delete a guideline and all its chunks from the RAG system.
 */
export async function deleteGuideline(guidelineId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('guidelines')
    .delete()
    .eq('id', guidelineId);

  if (error) {
    throw new Error(`Failed to delete guideline: ${error.message}`);
  }

  logger.info('rag:ingest', ` Deleted guideline ${guidelineId}`);
}
