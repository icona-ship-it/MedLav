/**
 * Extract plain text from the benchmark perizie in benchmark/ and save as .md
 * files in benchmark/gold/.
 *
 * These extracted texts are the "gold standard" — the perizie that Lavini
 * actually deposited in Tribunale. Any new generation from MedLav must match
 * (or improve upon) these as judged by Lavini.
 *
 * USAGE:
 *   pnpm tsx scripts/extract-gold-standards.ts
 *
 * Output: benchmark/gold/<slug>.md for each source file.
 * benchmark/ è gitignored (dati sanitari). La vecchia cartella Example/ (perizie
 * REALI non anonimizzate) è stata rimossa per GDPR; i suoi gold restano in gold/.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const execFileAsync = promisify(execFile);
const BENCHMARK_DIR = path.resolve(process.cwd(), 'benchmark');
const GOLD_DIR = path.resolve(process.cwd(), 'benchmark', 'gold');

interface BenchmarkSource {
  /** Path relativo a benchmark/ */
  source: string;
  /** Cartella base (sempre 'benchmark'; Example/ rimossa per GDPR — dati reali). */
  baseDir?: 'benchmark';
  /** Output slug (becomes benchmark/gold/<slug>.md) */
  slug: string;
  /** Free-form description for the README */
  description: string;
}

// Curated list of benchmark sources to extract. Add new ones here.
const SOURCES: BenchmarkSource[] = [
  // NB: le fonti storiche da Example/ (Del Porto, Antoniazzi, benchmark giudiziale,
  // Passaniti, Regnoto) sono state rimosse: la cartella Example/ conteneva perizie
  // REALI non anonimizzate ed è stata eliminata (GDPR). I loro gold standard restano
  // estratti in benchmark/gold/ (del-porto-*, antoniazzi-*, passaniti-*, regnoto-*).
  // ── Benchmark (cartelle in benchmark/, nome = tipo analisi) ──
  {
    source: 'CTU - Responsabilità civile - LIVIA REICHEGGER Singolo incarico dal TAR/CTU - Responsabilità civile - LIVIA REICHEGGER Singolo incarico dal TAR.doc',
    baseDir: 'benchmark',
    slug: 'reichegger-ctu-rc-verbale',
    description: 'CTU RC — verbale operazioni peritali (TAR Bolzano, Del Balzo collegio)',
  },
  {
    source: 'CTU - Responsabilità Penale - Vitali perizia/CTU - Responsabilità Penale - Vitali perizia.docx',
    baseDir: 'benchmark',
    slug: 'vitali-ctu-penale',
    description: 'CTU Responsabilità PENALE (Vitali, decesso, causa morte + colpa)',
  },
  {
    source: 'CTU Responsabilità civile -  LEONI MANUEL + ustioni danno psichico/CTU Responsabilità civile -  LEONI MANUEL + ustioni danno psichico.docx',
    baseDir: 'benchmark',
    slug: 'leoni-ctu-rc-psichico',
    description: 'CTU RC — ustioni + danno psichico (ITT/ITP + IP SIMLA)',
  },
  {
    source: 'CTU Responsabiltà civile - Caccialanza/CTU Responsabiltà civile - Caccialanza.docx',
    baseDir: 'benchmark',
    slug: 'caccialanza-ctu-rc',
    description: 'CTU RC — qualificatoria RSA/LEA (art. 30 DPCM)',
  },
  {
    source: 'CTU Responsabiltà civile - CALASCIBETTA/CTU Responsabiltà civile - CALASCIBETTA.doc',
    baseDir: 'benchmark',
    slug: 'calascibetta-ctu-rc-decesso',
    description: 'CTU RC — decesso, nesso più-probabile-che-non (Del Balzo + Cazzadori)',
  },
  {
    source: 'Tedesco Scho - CTU Responsabilità Civile/Tedesco Scho - CTU Responsabilità Civile.pages',
    baseDir: 'benchmark',
    slug: 'tedesco-schoenweger-ctu-rc',
    description: 'CTU RC — paraplegia/parapendio, polizza infortuni (scritta dal Dr. LAVINI)',
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

/** Vecchio formato Word binario (.doc) via antiword (brew install antiword). */
async function extractDoc(filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('antiword', [filePath], { maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`antiword non disponibile o fallito (${msg.slice(0, 80)}). Installa: brew install antiword`);
  }
}

/** Apple Pages (.pages, IWA) via decoder python stdlib (scripts/extract-pages.py). */
async function extractPages(filePath: string): Promise<string> {
  const script = path.resolve(process.cwd(), 'scripts', 'extract-pages.py');
  const { stdout } = await execFileAsync('python3', [script, filePath], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') return extractDocx(filePath);
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.doc') return extractDoc(filePath);
  if (ext === '.pages') return extractPages(filePath);
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

> Estratto da \`benchmark/${source.source}\` il ${new Date().toLocaleDateString('it-IT')}.
> Questo è il **gold standard**: la generazione di LegMed deve avvicinarsi a questo testo come giudicato da Lavini.

---

${text.trim()}
`;
}

async function main(): Promise<void> {
  await fs.mkdir(GOLD_DIR, { recursive: true });

  console.log(`📂 Source dir: ${BENCHMARK_DIR}`);
  console.log(`📂 Output dir: ${GOLD_DIR}\n`);

  let okCount = 0;
  let failCount = 0;

  for (const source of SOURCES) {
    const baseDir = BENCHMARK_DIR;
    const baseLabel = 'benchmark';
    const inputPath = path.join(baseDir, source.source);
    const outputPath = path.join(GOLD_DIR, `${source.slug}.md`);

    try {
      await fs.access(inputPath);
    } catch {
      console.log(`⏭️  SKIP   ${source.slug} (file missing: ${baseLabel}/${source.source})`);
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
