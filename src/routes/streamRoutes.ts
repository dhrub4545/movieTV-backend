import { Router } from 'express';
import { proxyStream } from '../services/proxyService';
import { streamResolverService } from '../services/streamResolverService';

export const streamRouter = Router();

// GET /api/stream/resolve?id=1&title=...&type=movie&season=1&episode=1
streamRouter.get('/resolve', async (req, res) => {
  try {
    const id = req.query.id as string | undefined;
    const tmdbId = req.query.tmdbId ? Number(req.query.tmdbId) : undefined;
    const title = req.query.title as string | undefined;
    const type = (req.query.type as 'movie' | 'tv') || 'movie';
    const season = req.query.season ? Number(req.query.season) : undefined;
    const episode = req.query.episode ? Number(req.query.episode) : undefined;

    const streamData = await streamResolverService.resolveStream({
      id,
      title,
      type,
      season,
      episode,
    });

    res.json(streamData);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve stream', message: err.message });
  }
});

// GET /api/stream/proxy?url=...&referer=...
streamRouter.get('/proxy', proxyStream);
