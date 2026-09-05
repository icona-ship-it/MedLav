/**
 * Prova comparativa MODELLO (2026-09-04): la stessa sezione "La Documentazione
 * Medica Prodotta" generata da più modelli con la STESSA direttiva RC del
 * prodotto, a partire dal testo OCR di un caso. Il risultato va innestato nel
 * report e giudicato dal panel gold (skill confronto-rc-gold).
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/bakeoff-model.ts <cartella-ocr-caso> <slug> <cartella-output>
 *   <cartella-ocr-caso> = directory con un file .txt per documento (es. il dump locale dei gold),
 *   <slug> = gold-a-semplice | gold-b-medio | gold-c-macrodanno (per innestare in benchmark/generated/<slug>.md)
 *
 * Provider (attivi solo con la chiave in env; esterni solo con BAKEOFF_ALLOW_EXTERNAL=1):
 *   MISTRAL_API_KEY   → mistral-large-2512 (produzione) — riferimento
 *   ANTHROPIC_API_KEY → BAKEOFF_ANTHROPIC_MODEL (default claude-sonnet-5)
 *   GOOGLE_AI_API_KEY → BAKEOFF_GEMINI_MODEL (default gemini-2.5-pro)
 *
 * GDPR Art. 9: testo clinico reale → decisione del titolare per i provider fuori DPA.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOC_SANITARIA_RC_DIRECTIVE } from '@/services/synthesis/catalog-shared';

type Chat = (system: string, user: string) => Promise<string>;

const mistralChat: Chat = async (system, user) => {
  const res = await fetch(`${process.env.MISTRAL_SERVER_URL?.trim() || 'https://api.eu.mistral.ai'}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
    body: JSON.stringify({ model: 'mistral-large-2512', temperature: 0, random_seed: 42, max_tokens: 16000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? '';
};

const anthropicChat: Chat = async (system, user) => {
  const model = process.env.BAKEOFF_ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 16000, temperature: 0, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
};

const geminiChat: Chat = async (system, user) => {
  const model = process.env.BAKEOFF_GEMINI_MODEL ?? 'gemini-2.5-pro';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { temperature: 0, maxOutputTokens: 16000 } }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('\n');
};

function splice(report: string, section: string): string {
  const start = report.indexOf('## La Documentazione Medica Prodotta');
  const next = report.indexOf('\n## ', start + 10);
  if (start < 0 || next < 0) throw new Error('sezione non trovata nel report');
  return `${report.slice(0, start)}## La Documentazione Medica Prodotta\n\n${section.trim()}\n\n${report.slice(next + 1)}`;
}

async function main() {
  const [ocrDir, slug, outDir] = [process.argv[2], process.argv[3], process.argv[4]];
  if (!ocrDir || !slug || !outDir) { console.error('Uso: bakeoff-model.ts <cartella-ocr-caso> <slug> <cartella-output>'); process.exit(1); }
  const allowExternal = process.env.BAKEOFF_ALLOW_EXTERNAL === '1';
  const providers: Array<{ name: string; chat: Chat }> = [];
  if (process.env.MISTRAL_API_KEY) providers.push({ name: 'mistral-large', chat: mistralChat });
  if (process.env.ANTHROPIC_API_KEY && allowExternal) providers.push({ name: 'claude', chat: anthropicChat });
  if (process.env.GOOGLE_AI_API_KEY && allowExternal) providers.push({ name: 'gemini', chat: geminiChat });
  if (providers.length === 0) { console.error('Nessun provider attivo.'); process.exit(1); }
  const files = readdirSync(ocrDir).filter((f) => f.endsWith('.txt')).sort();
  const docs = files.map((f, i) => `DOCUMENTO ${i + 1} (${f.replace(/^\d+-/, '').replace(/\.txt$/, '')}):\n${readFileSync(join(ocrDir, f), 'utf8')}`).join('\n\n=====\n\n');
  const system = `Sei un medico legale. ${DOC_SANITARIA_RC_DIRECTIVE}`;
  const user = `Redigi SOLO la sezione "La Documentazione Medica Prodotta" (senza il titolo di sezione) a partire dai documenti seguenti. Intestazione di ogni blocco: "**Tipo documento, struttura, in data GG.MM.AAAA:**".\n\n${docs}`;
  mkdirSync(outDir, { recursive: true });
  const report = readFileSync(`benchmark/generated/${slug}.md`, 'utf8');
  for (const p of providers) {
    const t0 = Date.now();
    let section = '';
    try { section = await p.chat(system, user); } catch (e) { console.error(`${p.name}: ${e instanceof Error ? e.message : String(e)}`); continue; }
    writeFileSync(join(outDir, `${slug}.section.${p.name}.md`), section);
    writeFileSync(join(outDir, `${slug}.model-${p.name}.md`), splice(report, section));
    console.log(`${p.name}: ${section.split(/\s+/).filter(Boolean).length} parole di sezione in ${Math.round((Date.now() - t0) / 1000)}s → ${join(outDir, `${slug}.model-${p.name}.md`)} (copiare su benchmark/generated/${slug}.md per il panel)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
