import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Extrait le texte brut d'un buffer PDF.
 * Certains PDF (polices TrueType) déclenchent des warnings "TT: invalid function id"
 * dans la lib PDF : on les masque pendant l'extraction pour garder le terminal lisible.
 */
export async function extraireTextePdf(buffer) {
  const origWarn = console.warn;
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  const filterPdfWarning = (chunk, enc, cb) => {
    const str = typeof chunk === 'string' ? chunk : String(chunk ?? '');
    if (str.includes('TT: invalid function id')) return typeof cb === 'function' ? cb() : true;
    return origStderrWrite(chunk, enc, cb);
  };
  console.warn = (...args) => {
    const msg = args.join(' ');
    if (msg.includes('TT: invalid function id')) return;
    origWarn.apply(console, args);
  };
  process.stderr.write = filterPdfWarning;
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text || '',
      numPages: data.numpages || 1,
    };
  } finally {
    console.warn = origWarn;
    process.stderr.write = origStderrWrite;
  }
}
