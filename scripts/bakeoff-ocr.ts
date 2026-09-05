/**
 * Prova comparativa OCR (2026-09-04): gli stessi PDF/immagini letti da più
 * provider, con controllo di "bersagli" attesi (es. una data manoscritta che
 * il nostro OCR lascia vuota). Misura, non opinione.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/bakeoff-ocr.ts <cartella-file> <cartella-output> [bersagli.json]
 * bersagli.json (opzionale): { "<nomefile>": ["18.10.2025", "366,00"], ... } — stringhe che DEVONO comparire.
 *
 * Provider (attivi solo se la chiave è in env):
 *   MISTRAL_API_KEY            → mistral-ocr-latest (il nostro OCR di produzione)
 *   ANTHROPIC_API_KEY          → Claude (Messages API, documento PDF/immagine in input), modello BAKEOFF_ANTHROPIC_MODEL (default claude-sonnet-5)
 *   GOOGLE_AI_API_KEY          → Gemini (generateContent), modello BAKEOFF_GEMINI_MODEL (default gemini-2.5-pro)
 *
 * GDPR Art. 9: i file possono contenere dati sanitari reali. Inviarli a un
 * provider FUORI dal DPA firmato è una decisione del titolare: i provider esterni
 * partono SOLO con BAKEOFF_ALLOW_EXTERNAL=1. Gli output restano in locale.
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

type Provider = { name: string; run: (bytes: Buffer, mime: string) => Promise<string> };

const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const OCR_PROMPT = 'Trascrivi INTEGRALMENTE il testo di questo documento, pagina per pagina, in markdown, senza riassumere e senza aggiungere nulla. Riporta anche le parti manoscritte, i timbri e le tabelle (come tabelle markdown). Se una parte è illeggibile scrivi [illeggibile]. Separa le pagine con "--- pagina N ---".';

async function mistralOcr(bytes: Buffer, mime: string): Promise<string> {
  const isImage = mime.startsWith('image/');
  const body = {
    model: 'mistral-ocr-latest',
    document: isImage
      ? { type: 'image_url', image_url: `data:${mime};base64,${bytes.toString('base64')}` }
      : { type: 'document_url', document_url: `data:${mime};base64,${bytes.toString('base64')}` },
  };
  const res = await fetch(`${process.env.MISTRAL_SERVER_URL?.trim() || 'https://api.eu.mistral.ai'}/v1/ocr`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`mistral ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { pages?: Array<{ index: number; markdown: string }> };
  return (json.pages ?? []).map((p) => `--- pagina ${p.index + 1} ---\n${p.markdown}`).join('\n\n');
}

async function anthropicOcr(bytes: Buffer, mime: string): Promise<string> {
  const model = process.env.BAKEOFF_ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  const part = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: bytes.toString('base64') } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 16000, temperature: 0, messages: [{ role: 'user', content: [part, { type: 'text', text: OCR_PROMPT }] }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  return (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n');
}

async function geminiOcr(bytes: Buffer, mime: string): Promise<string> {
  const model = process.env.BAKEOFF_GEMINI_MODEL ?? 'gemini-2.5-pro';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data: bytes.toString('base64') } }, { text: OCR_PROMPT }] }], generationConfig: { temperature: 0 } }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('\n');
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/[.\-/]/g, '.');
}

async function main() {
  const [inDir, outDir, targetsPath] = [process.argv[2], process.argv[3], process.argv[4]];
  if (!inDir || !outDir) { console.error('Uso: bakeoff-ocr.ts <cartella-file> <cartella-output> [bersagli.json]'); process.exit(1); }
  const allowExternal = process.env.BAKEOFF_ALLOW_EXTERNAL === '1';
  const providers: Provider[] = [];
  if (process.env.MISTRAL_API_KEY) providers.push({ name: 'mistral-ocr', run: mistralOcr });
  if (process.env.ANTHROPIC_API_KEY && allowExternal) providers.push({ name: 'claude', run: anthropicOcr });
  if (process.env.GOOGLE_AI_API_KEY && allowExternal) providers.push({ name: 'gemini', run: geminiOcr });
  if (!allowExternal && (process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_AI_API_KEY)) {
    console.error('Provider esterni presenti ma NON abilitati: imposta BAKEOFF_ALLOW_EXTERNAL=1 solo se il DPA lo consente.');
  }
  if (providers.length === 0) { console.error('Nessun provider attivo (chiavi mancanti).'); process.exit(1); }
  const targets = targetsPath && existsSync(targetsPath) ? JSON.parse(readFileSync(targetsPath, 'utf8')) as Record<string, string[]> : {};
  mkdirSync(outDir, { recursive: true });
  const files = readdirSync(inDir).filter((f) => MIME[extname(f).toLowerCase()]);
  const rows: string[] = ['file\tprovider\tcaratteri\tbersagli_trovati\tbersagli_totali\tmancanti'];
  for (const f of files) {
    const bytes = readFileSync(join(inDir, f));
    const mime = MIME[extname(f).toLowerCase()]!;
    for (const p of providers) {
      let text = '';
      try { text = await p.run(bytes, mime); } catch (e) { text = `ERRORE: ${e instanceof Error ? e.message : String(e)}`; }
      writeFileSync(join(outDir, `${basename(f, extname(f))}.${p.name}.md`), text);
      const want = targets[f] ?? [];
      const norm = normalize(text);
      const missing = want.filter((t) => !norm.includes(normalize(t)));
      rows.push(`${f}\t${p.name}\t${text.length}\t${want.length - missing.length}\t${want.length}\t${missing.join(' | ')}`);
      console.log(`${f} · ${p.name}: ${text.length} caratteri, bersagli ${want.length - missing.length}/${want.length}${missing.length ? ` (mancano: ${missing.join(', ')})` : ''}`);
    }
  }
  writeFileSync(join(outDir, 'RISULTATI.tsv'), rows.join('\n'));
  console.log(`\nTabella: ${join(outDir, 'RISULTATI.tsv')}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
