/**
 * Extract plain text from the benchmark perizie in Example/ and save as .md
 * files in benchmark/gold/.
 *
 * These extracted texts are the "gold standard" — the perizie that Lavini
 * actually deposited in Tribunale. Any new generation from MedLav must match
 * (or improve upon) these as judged by Lavini.
 *
 * USAGE:
 *   pnpm tsx scripts/extract-gold-standards.ts
 *
 * Output: benchmark/gold/<slug>.md for each Example file.
 * Both Example/ and benchmark/ are gitignored (sensitive patient data).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const EXAMPLE_DIR = path.resolve(process.cwd(), 'Example');
const GOLD_DIR = path.resolve(process.cwd(), 'benchmark', 'gold');

interface BenchmarkSource {
  /** Filename or relative path under Example/ */
  source: string;
  /** Output slug (becomes benchmark/gold/<slug>.md) */
  slug: string;
  /** Free-form description for the README */
  description: string;
}

// Curated list of benchmark sources to extract. Add new ones here.
const SOURCES: BenchmarkSource[] = [
  {
    source: 'DEL PORTO - Mao CTU Responsabilità civile.docx',
    slug: 'del-porto-ctu-resp-civile',
    description: 'Gold standard CTU responsabilita civile (Lavini, deposita Tribunale)',
  },
  {
    source: 'Antoniazzi Bianca benchmark per Perizia medico legale — Responsabilità civile.docx',
    slug: 'antoniazzi-stragiudiziale',
    description: 'Gold standard stragiudiziale responsabilita civile (Antoniazzi)',
  },
  {
    source: 'bechmark giudiziale per CTU responsabilità civile.pdf',
    slug: 'benchmark-giudiziale-ctu',
    description: 'Gold standard CTU giudiziale resp. civile (extra reference)',
  },
  {
    source: 'cronistoriapassaniti/cronistoria-PASSANITI rivista lavini.pdf',
    slug: 'passaniti-cronistoria-rivista-lavini',
    description: 'Cronistoria PASSANITI rivista da Lavini (gold per cronistoria flow)',
  },
  {
    source: 'cronistoriapassaniti/cronistoria-PASSANITI da legmed.pdf',
    slug: 'passaniti-cronistoria-da-legmed',
    description: 'Cronistoria PASSANITI generata da LegMed (pre-revisione, snapshot)',
  },
  {
    source: 'Regnoto/Esempio conistoria solo modulo cdoc medica prodotta. e tutto il file come perizia medico legare resp. civile Regnoto Valeria.pdf',
    slug: 'regnoto-perizia-completa',
    description: 'Perizia completa Regnoto Valeria (CTU resp. civile, output di riferimento)',
  },
];

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') return extractDocx(filePath);
  if (ext === '.pdf') return extractPdf(filePath);
  throw new Error(`Unsupported file extension: ${ext}`);
}

function buildMarkdown(text: string, source: BenchmarkSource): string {
  const lines = text.split(/\r?\n/);
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return `---
slug: ${source.slug}
source: ${source.source}
description: ${source.description}
extractedAt: ${new Date().toISOString()}
wordCount: ${wordCount}
lineCount: ${lines.length}
---

# ${source.description}

> Estratto da \`Example/${source.source}\` il ${new Date().toLocaleDateString('it-IT')}.
> Questo è il **gold standard**: la generazione di LegMed deve avvicinarsi a questo testo come giudicato da Lavini.

---

${text.trim()}
`;
}

async function main(): Promise<void> {
  await fs.mkdir(GOLD_DIR, { recursive: true });

  console.log(`📂 Source dir: ${EXAMPLE_DIR}`);
  console.log(`📂 Output dir: ${GOLD_DIR}\n`);

  let okCount = 0;
  let failCount = 0;

  for (const source of SOURCES) {
    const inputPath = path.join(EXAMPLE_DIR, source.source);
    const outputPath = path.join(GOLD_DIR, `${source.slug}.md`);

    try {
      await fs.access(inputPath);
    } catch {
      console.log(`⏭️  SKIP   ${source.slug} (file missing: Example/${source.source})`);
      continue;
    }

    try {
      console.log(`⏳ Extracting ${source.slug}...`);
      const text = await extractText(inputPath);
      const md = buildMarkdown(text, source);
      await fs.writeFile(outputPath, md, 'utf-8');
      const words = text.split(/\s+/).filter((w) => w.length > 0).length;
      console.log(`✅ OK     ${source.slug} (${words} parole) -> benchmark/gold/${source.slug}.md`);
      okCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.log(`❌ FAIL   ${source.slug}: ${msg.slice(0, 150)}`);
      failCount++;
    }
  }

  console.log(`\n📊 Summary: ${okCount} OK, ${failCount} FAIL`);
  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
