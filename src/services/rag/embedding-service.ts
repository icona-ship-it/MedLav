import { getMistralClient, withMistralRetry } from '@/lib/mistral/client';

const EMBEDDING_MODEL = 'mistral-embed';
const MAX_BATCH_SIZE = 16; // Mistral embed API batch limit

/**
 * Generate embeddings for an array of text chunks using Mistral Embed.
 * Returns arrays of 1024-dimensional float vectors.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getMistralClient();
  const allEmbeddings: number[][] = [];

  // Process in batches of MAX_BATCH_SIZE
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await withMistralRetry(
      () => client.embeddings.create({
        model: EMBEDDING_MODEL,
        inputs: batch,
      }),
      'embedding',
    );

    const data = response.data as Array<{ embedding: number[] }>;
    for (const item of data) {
      allEmbeddings.push(item.embedding);
    }

    if (i + MAX_BATCH_SIZE < texts.length) {
      console.log(`[embedding] Batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(texts.length / MAX_BATCH_SIZE)} complete`);
    }
  }

  return allEmbeddings;
}

/**
 * Generate a single embedding for a query string.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const results = await generateEmbeddings([query]);
  return results[0];
}
