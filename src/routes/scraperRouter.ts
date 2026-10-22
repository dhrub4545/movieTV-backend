import { Request, Response, Router } from 'express';
import { scraperPipelineService } from '../services/scraperPipelineService';

export const scraperRouter = Router();

// Get scraper pipeline status & scheduling info
scraperRouter.get('/status', async (_req: Request, res: Response) => {
  const scraper = await scraperPipelineService.getStatus();
  res.json({
    status: 'ok',
    scraper,
  });
});

// Get scraper source configuration & mirror list
scraperRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    baseUrl: scraperPipelineService.getBaseUrl(),
    knownMirrors: [
      'https://new8.hdhub4u.cl',
      'https://new7.hdhub4u.cl',
      'https://new6.hdhub4u.cl',
      'https://new5.hdhub4u.cl',
      'https://hdhub4u.ms',
      'https://hdhub4u.tv',
      'https://hdhub4u.dad',
    ],
  });
});

// Update scraper source baseUrl dynamically
scraperRouter.post('/config', async (req: Request, res: Response) => {
  const { baseUrl } = req.body || {};
  if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim().length < 5) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid baseUrl provided. Please provide a valid mirror URL.',
    });
  }

  const result = await scraperPipelineService.setBaseUrl(baseUrl);
  res.json({
    status: 'ok',
    ...result,
  });
});

// Test connection / ping to mirror URL
scraperRouter.post('/test', async (req: Request, res: Response) => {
  const { url } = req.body || {};
  try {
    const result = await scraperPipelineService.testConnection(url);
    res.json({
      status: 'ok',
      test: result,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message || 'Error testing mirror URL',
    });
  }
});

// Trigger pipeline manually or via scheduled cron-job.org / Vercel Cron (GET or POST)
const handleTrigger = async (req: Request, res: Response) => {
  const status = await scraperPipelineService.getStatus();
  if (status.isRunning) {
    return res.status(409).json({
      status: 'already_running',
      message: 'Scraper pipeline is already executing.',
      scraper: status,
    });
  }

  try {
    const maxPages = Number(req.query.pages || req.body?.pages) || 1;
    const result = await scraperPipelineService.runPipeline({ maxPages });
    const updatedStatus = await scraperPipelineService.getStatus();

    res.json({
      status: 'success',
      message: `Scraper pipeline completed successfully: ${result?.newMovies || 0} new movies, ${result?.newSeries || 0} new series, ${result?.updatedMovies || 0} updated movies, ${result?.updatedSeriesEpisodes || 0} updated series episodes.`,
      result,
      scraper: updatedStatus,
    });
  } catch (err: any) {
    console.error('Triggered pipeline execution error:', err);
    res.status(500).json({
      status: 'error',
      message: err?.message || 'Scraper execution error',
    });
  }
};

scraperRouter.post('/trigger', handleTrigger);
scraperRouter.get('/trigger', handleTrigger);
