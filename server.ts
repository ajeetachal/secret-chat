// Local runner: `npm run dev` (Vite middleware) or `npm start` (serves dist/).
// On Netlify, netlify/server/index.ts is used instead.
import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createBriefRoomServer } from './server/app.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function start(): Promise<void> {
  const { app, server } = createBriefRoomServer();

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BriefRoom server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start BriefRoom server:', err);
  process.exit(1);
});
