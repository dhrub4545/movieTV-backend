import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Application, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { connectDb } from './db';
import { channelRouter } from './routes/channelRoutes';
import { feedRouter } from './routes/feedRoutes';
import { scraperRouter } from './routes/scraperRouter';
import { searchRouter } from './routes/searchRoutes';
import { streamRouter } from './routes/streamRoutes';
import { contentService } from './services/contentService';
import { scraperPipelineService } from './services/scraperPipelineService';

dotenv.config();

// Ensure scraper pipeline has reference to contentService for cache invalidation
scraperPipelineService.setContentService(contentService);

export const app: Application = express();

// High-speed compression middleware: reduces JSON feed payload by ~80%
app.use(compression());

// Middlewares
app.use(cors());
app.use(express.json());

// Serverless / stateless DB connection middleware
app.use(async (_req, _res, next) => {
  try {
    await connectDb();
  } catch (err: any) {
    console.warn('DB connection middleware error:', err?.message);
  }
  next();
});

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'MovieTV Stateless Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Crash logging endpoint for Android app
app.post('/api/crash-report', (req: Request, res: Response) => {
  console.error('\n==================== 🚨 ANDROID CRASH REPORT 🚨 ====================');
  console.error('Time:', new Date().toISOString());
  console.error('Payload:', JSON.stringify(req.body, null, 2));
  console.error('===================================================================\n');
  res.json({ status: 'received' });
});

// Instant Mobile Download Endpoint: Download fresh APK directly from mobile phone browser
app.get('/apk', (_req: Request, res: Response) => {
  const apkPath = path.resolve(
    __dirname,
    '../../frontend/app/build/outputs/apk/debug/app-debug.apk',
  );
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'MovieTV.apk');
  } else {
    res.status(404).send('APK not found. Please build the frontend project first.');
  }
});

// Static frontend web dashboard (React build in frontendweb/dist or fallback to frontendweb)
const frontendDistPath = path.resolve(__dirname, '../../frontendweb/dist');
const frontendWebPath = fs.existsSync(frontendDistPath)
  ? frontendDistPath
  : path.resolve(__dirname, '../../frontendweb');

if (fs.existsSync(frontendWebPath)) {
  app.use('/web', express.static(frontendWebPath));
}

app.get('/web', (_req: Request, res: Response) => {
  const indexPath = path.join(frontendWebPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      status: 'ok',
      message: 'MovieTV Backend API is running.',
      endpoints: {
        health: '/api/health',
        homeFeed: '/api/feed/home',
        movies: '/api/feed/movies',
        series: '/api/feed/series',
        channels: '/api/channels',
        search: '/api/search?q=...',
        stream: '/api/stream/resolve?id=...&type=movie',
        scraperStatus: '/api/scraper/status',
      },
    });
  }
});

app.get('/', (_req: Request, res: Response) => {
  const indexPath = path.join(frontendWebPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.redirect('/web');
  } else {
    res.json({
      status: 'ok',
      app: 'MovieTV Stateless Backend',
      version: '2.0.0',
      endpoints: {
        health: '/api/health',
        homeFeed: '/api/feed/home',
        movies: '/api/feed/movies',
        series: '/api/feed/series',
        channels: '/api/channels',
        search: '/api/search?q=...',
        stream: '/api/stream/resolve?id=...&type=movie',
        scraperStatus: '/api/scraper/status',
      },
    });
  }
});

// API Routes
app.use('/api/feed', feedRouter);
app.use('/api/channels', channelRouter);
app.use('/api/stream', streamRouter);
app.use('/api/search', searchRouter);
app.use('/api/scraper', scraperRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

export default app;
