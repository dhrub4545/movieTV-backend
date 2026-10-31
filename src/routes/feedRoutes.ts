import { Router } from 'express';
import { contentService } from '../services/contentService';

export const feedRouter = Router();
 
// Optimized HTTP Caching headers: enables client (OkHttp), browser, and Vercel Edge CDN caching with stale-while-revalidate for sub-50ms responses
feedRouter.use((req, res, next) => {
  if (req.method === 'GET') {
    if (req.path.startsWith('/movie/') || req.path.startsWith('/series/')) {
      res.set('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    } else if (req.query.search) {
      res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    } else {
      res.set('Cache-Control', 'public, max-age=180, s-maxage=300, stale-while-revalidate=86400');
    }
  }
  next();
});

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

// GET /api/feed/movies/indian?page=1&limit=40&search=...
feedRouter.get('/movies/indian', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 40;
    const search = req.query.search as string | undefined;

    const result = await contentService.getMovies({ page, limit, category: 'indian', search });
    res.json(result.items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch Indian movies', message: err.message });
  }
});

// GET /api/feed/movies/non-indian?page=1&limit=40&search=...
feedRouter.get(['/movies/non-indian', '/movies/global'], async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 40;
    const search = req.query.search as string | undefined;

    const result = await contentService.getMovies({ page, limit, category: 'global', search });
    res.json(result.items);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch Global movies', message: err.message });
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
