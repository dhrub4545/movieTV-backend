import { Router } from 'express';
import { contentService } from '../services/contentService';

export const feedRouter = Router();

// GET /api/feed/home
feedRouter.get('/home', async (_req, res) => {
  try {
    const feed = await contentService.getHomeFeed();
    res.json(feed);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch home feed', message: err.message });
  }
});

// GET /api/feed/latest?page=1&limit=40&search=...
feedRouter.get('/latest', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 40;
    const search = req.query.search as string | undefined;

    const result = await contentService.getLatestFeed({ page, limit, search });
    res.json(result.items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch latest feed', message: err.message });
  }
});

// GET /api/feed/movies?category=...&page=1&limit=40&search=...
feedRouter.get('/movies', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 40;
    const search = req.query.search as string | undefined;

    const result = await contentService.getMovies({ page, limit, category, search });
    res.json(result.items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch movies', message: err.message });
  }
});

// GET /api/feed/series?page=1&limit=40&search=...
feedRouter.get('/series', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 40;
    const search = req.query.search as string | undefined;

    const result = await contentService.getSeries({ page, limit, search });
    res.json(result.items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch series', message: err.message });
  }
});

// GET /api/feed/movie/:id
feedRouter.get('/movie/:id', async (req, res) => {
  try {
    const movie = await contentService.getMovieById(req.params.id);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }
    res.json(movie);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch movie', message: err.message });
  }
});

// GET /api/feed/series/:id
feedRouter.get('/series/:id', async (req, res) => {
  try {
    const series = await contentService.getSeriesById(req.params.id);
    if (!series) {
      return res.status(404).json({ error: 'Series not found' });
    }
    res.json(series);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch series', message: err.message });
  }
});
