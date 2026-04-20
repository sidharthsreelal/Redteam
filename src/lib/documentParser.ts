'use client';

// ── Document text extractor ─────────────────────────────────────────────────
// Runs 100% client-side. Supports PDF, DOCX, and plain text/markdown.
// Returns extracted plain text or throws on failure.

/** Max characters to keep per document (prevents context bloat). */
export const DOC_MAX_CHARS = 12_000;

export type SupportedFileType = 'pdf' | 'docx' | 'text';

/** Detect file type from extension. Returns null for unsupported types. */
export function detectFileType(file: File): SupportedFileType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf'))  return 'pdf';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
  if (
    name.endsWith('.txt')  ||
    name.endsWith('.md')   ||
    name.endsWith('.markdown') ||
    name.endsWith('.rst')  ||
    name.endsWith('.text')
  ) return 'text';
  return null;
}

/** Accepted MIME types / extensions for the file input element. */
export const ACCEPTED_FILE_TYPES =
  '.pdf,.docx,.doc,.txt,.md,.markdown,.rst,.text,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Extract text from a File, returning a trimmed string. */
export async function extractText(file: File): Promise<string> {
  const type = detectFileType(file);
  if (!type) throw new Error(`Unsupported file type: ${file.name}`);

  let text = '';

  if (type === 'text') {
    text = await readAsText(file);
  } else if (type === 'pdf') {
    text = await extractPdf(file);
  } else if (type === 'docx') {
    text = await extractDocx(file);
  }

  // Normalise whitespace and truncate
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > DOC_MAX_CHARS) {
    text = text.slice(0, DOC_MAX_CHARS) + '\n\n[… document truncated for context window]';
  }
  return text;
}

// ── Internal helpers ────────────────────────────────────────────────────────

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file, 'utf-8');
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

async function extractPdf(file: File): Promise<string> {
  // Dynamic import keeps pdfjs out of the SSR bundle
  const pdfjsLib = await import('pdfjs-dist');

  // Use the bundled legacy worker (avoids separate worker file config)
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const arrayBuffer = await readAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n');
}

async function extractDocx(file: File): Promise<string> {
  // Dynamic import keeps mammoth out of the SSR bundle
  const mammoth = await import('mammoth');
  const arrayBuffer = await readAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
