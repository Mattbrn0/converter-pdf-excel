import { Router } from 'express';
import { randomUUID } from 'crypto';
import { upload } from '../middleware/upload.js';
import { extraireTextePdf } from '../services/pdfService.js';
import { extraireFacturesAvecLLM } from '../services/llmService.js';
import { genererExcel } from '../services/excelService.js';
import { enregistrerConversion } from '../services/supabaseService.js';

const router = Router();

const pendingDownloads = new Map();
const MAX_AGE_MS = 5 * 60 * 1000;

function sendProgress(res, percent) {
  res.write(`event: progress\ndata: ${Math.round(percent)}\n\n`);
}

function sendDone(res, token, filename) {
  res.write(`event: done\ndata: ${JSON.stringify({ token, filename })}\n\n`);
}

router.get('/convert/download/:token', (req, res) => {
  const entry = pendingDownloads.get(req.params.token);
  if (!entry) {
    return res.status(404).json({ error: 'Lien expiré ou invalide.' });
  }
  pendingDownloads.delete(req.params.token);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${entry.filename}"`);
  res.send(entry.buffer);
});

/**
 * POST /api/convert
 * Body: multipart/form-data avec un ou plusieurs champs "files" (PDF)
 * Réponse: stream SSE (progress 0-100), puis event done avec token ; fichier via GET /api/convert/download/:token
 */
router.post('/convert', upload.array('files', 20), async (req, res) => {
  const files = req.files;
  if (!files?.length) {
    return res.status(400).json({ error: 'Aucun fichier PDF fourni.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const N = files.length;
  const send = (p) => {
    sendProgress(res, p);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    send(0);
    const toutesFactures = [];

    const CONCURRENCY = 1;
    const extracted = await Promise.all(
      files.map(async (file) => {
        const { text } = await extraireTextePdf(file.buffer);
        return { text: text?.trim() || '', file };
      })
    );
    send(20);

    const withText = extracted.filter((e) => e.text.length > 0);
    for (let i = 0; i < withText.length; i += CONCURRENCY) {
      const chunk = withText.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        chunk.map(({ text }) => extraireFacturesAvecLLM(text))
      );
      results.forEach((factures) => {
        factures.forEach((f) => toutesFactures.push(f));
      });
      const done = Math.min(i + chunk.length, withText.length);
      send(20 + (done / Math.max(withText.length, 1)) * 55);
    }

    if (!toutesFactures.length) {
      send(100);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Aucune facture reconnue dans les documents.' })}\n\n`);
      return res.end();
    }

    send(80);
    const excelBuffer = await genererExcel(toutesFactures);
    await enregistrerConversion(files.length, toutesFactures.length);
    send(95);

    const filename = `factures_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const token = randomUUID();
    pendingDownloads.set(token, { buffer: excelBuffer, filename });
    setTimeout(() => pendingDownloads.delete(token), MAX_AGE_MS);

    send(100);
    sendDone(res, token, filename);
  } catch (err) {
    console.error('Erreur conversion:', err);
    send(100);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Erreur lors de la conversion.' })}\n\n`);
  }
  res.end();
});

export default router;
