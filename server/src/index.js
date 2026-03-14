import 'dotenv/config';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));

app.post('/api/deploy', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.DEPLOY_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'DEPLOY_SECRET non configuré.' });
  }
  const provided = req.headers['x-deploy-secret'] || req.query?.secret;
  const ghSig = req.headers['x-hub-signature-256'];
  const body = req.body;
  const ok =
    provided === secret ||
    (ghSig && body && ghSig === 'sha256=' + crypto.createHmac('sha256', secret).update(Buffer.isBuffer(body) ? body : Buffer.from(body || '')).digest('hex'));
  if (!ok) {
    return res.status(403).json({ error: 'Secret invalide.' });
  }
  const repoRoot = path.resolve(__dirname, '..', '..');
  const script = path.join(repoRoot, 'deploy.sh');
  const child = spawn('bash', [script], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  res.json({ ok: true, message: 'Déploiement lancé.' });
});

app.use(express.json());

app.use('/api', uploadRoutes);

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
