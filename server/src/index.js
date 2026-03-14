import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import uploadRoutes from './routes/upload.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api', uploadRoutes);

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
