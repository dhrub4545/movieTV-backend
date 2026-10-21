import { Router } from 'express';
import { contentService } from '../services/contentService';
import { iptvService } from '../services/iptvService';

export const searchRouter = Router();

// GET /api/search?q=...
searchRouter.get('/', async (req, res) => {
  const query = (req.query.q as string) || '';
  if (!query.trim()) {
    return res.json({ query: '', media: [], channels: [] });
  }

  try {
    const [moviesResult, seriesResult, channels] = await Promise.all([
      contentService.getMovies({ search: query, limit: 30 }),
      contentService.getSeries({ search: query, limit: 20 }),
      Promise.resolve(iptvService.searchChannels(query)),
    ]);

    const media = [...moviesResult.items, ...seriesResult.items];

    res.json({
      query,
      totalMedia: media.length,
      totalChannels: channels.length,
      media,
      channels,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});
