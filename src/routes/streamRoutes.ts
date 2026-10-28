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

// POST /api/stream/save-m3u8
streamRouter.post('/save-m3u8', async (req, res) => {
  try {
    const { id, title, type, season, episode, m3u8Url, player = 1 } = req.body;
    if (!m3u8Url || typeof m3u8Url !== 'string') {
      return res.status(400).json({ error: 'm3u8Url is required' });
    }

    const success = await streamResolverService.saveDirectM3u8({
      id,
      title,
      type,
      season: season ? Number(season) : undefined,
      episode,
      m3u8Url,
      player: player === 2 ? 2 : 1,
    });

    res.json({ success, m3u8Url, player: player === 2 ? 2 : 1 });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save m3u8', message: err.message });
  }
});

// GET /api/stream/proxy?url=...&referer=...
streamRouter.get('/proxy', proxyStream);

