import { Movie, Series } from '../db';
import { HomeFeed, MediaItem } from '../types';
import { scraperPipelineService } from './scraperPipelineService';
import { isM3u8TokenValid } from './streamResolverService';

function extractYear(title: string): string {
  const rangeMatch = title.match(/\b(?:19|20)\d{2}\s*[-–]\s*((?:19|20)\d{2})\b/);
  if (rangeMatch) return rangeMatch[1];
  const match = title.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? match[1] : '';
}

function detectCategory(title: string, fullTitle: string = ''): string {
  const text = `${title} ${fullTitle}`.toLowerCase();
  if (text.includes('telugu') || text.includes('tollywood')) return 'Tollywood';
  if (text.includes('tamil') || text.includes('kollywood')) return 'Tamil';
  if (text.includes('punjabi')) return 'Punjabi';
  if (text.includes('malayalam')) return 'Malayalam';
  if (text.includes('korean') || text.includes('anime')) return 'International';
  if (text.includes('dual audio') || text.includes('english')) return 'Hollywood (Hindi Dubbed)';
  return 'Bollywood';
}

function detectQuality(title: string = '', fullTitle: string = ''): string {
  const text = `${title} ${fullTitle}`.toLowerCase();
  if (
    text.includes('hdcam') ||
    text.includes('camrip') ||
    text.includes('cam') ||
    text.includes('hdtc') ||
    text.includes('hdts') ||
    text.includes('hq-hdtc') ||
    text.includes('pre-dvd') ||
    text.includes('dvdscr') ||
    text.includes('tc') ||
    text.includes('ts') ||
    text.includes('(line)') ||
    text.includes('line')
  ) {
    return 'HDCAM';
  }
  if (text.includes('4k') || text.includes('2160p') || text.includes('uhd')) {
    return '4K';
  }
  return 'HD';
}

const FOREIGN_INDICATORS =
  /\b(english|hollywood|japanese|korean|indonesian|chinese|thai|russian|spanish|french|german|turkish|italian|anime)\b/i;

function determineIsIndian(doc: any): boolean {
  if (typeof doc.is_indian === 'boolean') {
    return doc.is_indian;
  }
  const text = `${doc.title || ''} ${doc.full_title || ''}`;
  return !FOREIGN_INDICATORS.test(text);
}

export function mapMovieToMediaItem(doc: any): MediaItem {
  let yearNum = typeof doc.year === 'number' && doc.year > 1900 ? doc.year : null;
  if (!yearNum) {
    const text = `${doc.full_title || ''} ${doc.title || ''}`;
    const rangeMatch = text.match(/\b(?:19|20)\d{2}\s*[-–]\s*((?:19|20)\d{2})\b/);
    if (rangeMatch) {
      yearNum = parseInt(rangeMatch[1], 10);
    } else {
      const m = text.match(/\b(19\d{2}|20\d{2})\b/);
      yearNum = m ? parseInt(m[1], 10) : (doc.createdAt ? new Date(doc.createdAt).getFullYear() : 2026);
    }
  }

  const isIndian = determineIsIndian(doc);
  const region: 'Indian' | 'Non-Indian' = isIndian ? 'Indian' : 'Non-Indian';
  const cat = detectCategory(doc.title, doc.full_title);
  const quality = detectQuality(doc.title, doc.full_title);
  let poster =
    doc.poster_url ||
    (doc.poster_filename
      ? `https://image.tmdb.org/t/p/w342/${doc.poster_filename}`
      : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400');
  if (poster && poster.includes('/w500/')) {
    poster = poster.replace('/w500/', '/w342/');
  }

  return {
    id: String(doc.id),
    title: doc.title,
    overview: doc.full_title || doc.title,
    posterUrl: poster,
    backdropUrl: poster,
    releaseYear: String(yearNum),
    year: yearNum,
    isIndian,
    region,
    rating: 8.5,
    type: 'movie',
    category: isIndian
      ? (cat === 'Bollywood' || cat === 'Tollywood' || cat === 'Tamil' || cat === 'Malayalam' || cat === 'Punjabi'
          ? cat
          : 'Indian Cinema')
      : cat,
    genres: [region, cat, 'HD'],
    duration: 'Full Movie',
    quality,
    streamUrl: doc.streams?.m3u8_url && isM3u8TokenValid(doc.streams.m3u8_url)
      ? doc.streams.m3u8_url
      : (doc.streams?.watch_embed || undefined),
    m3u8_url: doc.streams?.m3u8_url && isM3u8TokenValid(doc.streams.m3u8_url) ? doc.streams.m3u8_url : undefined,
    player_2_m3u8_url: doc.streams?.player_2_m3u8_url || undefined,
    watch_embed_url: doc.streams?.watch_embed || undefined,
    player_2_url: doc.streams?.player_2 || undefined,
  };
}

const ADULT_REGEX =
  /\b18\+|\b18\s*\+|adult|erotic|sex|\bhot\b|sensual|softcore|hotshots|ullu|kooku|primeshots|voovi|cineprime|moodx|chikooflix|hunters|nuefliks|besharams|atrangii|papa['’]?s?[\s\-_]*friends?\b/i;

export function mapSeriesToMediaItem(doc: any): MediaItem {
  const year = extractYear(doc.title);
  const cat = detectCategory(doc.title, doc.full_title);
  const quality = detectQuality(doc.title, doc.full_title);
  let poster =
    doc.poster_url ||
    (doc.poster_filename
      ? `https://image.tmdb.org/t/p/w342/${doc.poster_filename}`
      : 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400');
  if (poster && poster.includes('/w500/')) {
    poster = poster.replace('/w500/', '/w342/');
  }

  const seasonCount = doc.seasons ? doc.seasons.length : 1;
  const streamUrl = undefined;

  return {
    id: String(doc.id),
    title: doc.title,
    overview: doc.full_title || `${seasonCount} Season(s)`,
    posterUrl: poster,
    backdropUrl: poster,
    releaseYear: year,
    rating: 8.8,
    type: 'tv',
    category: 'Web Series',
    genres: [cat, 'Series'],
    duration: `${seasonCount} Season${seasonCount > 1 ? 's' : ''}`,
    quality,
    streamUrl,
    seasons: doc.seasons || [],
  };
}

export class ContentService {
  // In-memory cache for home feed (TTL: 5 minutes)
  private cachedHomeFeed: HomeFeed | null = null;
  private homeFeedCacheTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // In-memory cache for queries (TTL: 3 minutes) with max 300 entries to prevent memory bloat
  private queryCache = new Map<string, { data: any; expiresAt: number }>();
  private inFlight = new Map<string, Promise<any>>();
  private readonly QUERY_CACHE_TTL_MS = 3 * 60 * 1000;
  private readonly MAX_CACHE_ENTRIES = 300;

  // Cached total counts to avoid expensive countDocuments on every page
  private totalMoviesCache: number | null = null;
  private totalSeriesCache: number | null = null;
  private categoryCountsCache = new Map<string, number>();

  private async getOrSetCache<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.queryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    const running = this.inFlight.get(key);
    if (running) {
      return running as Promise<T>;
    }
    const promise = (async () => {
      try {
        const result = await fetcher();
        if (this.queryCache.size >= this.MAX_CACHE_ENTRIES) {
          const oldestKey = this.queryCache.keys().next().value;
          if (oldestKey) this.queryCache.delete(oldestKey);
        }
        this.queryCache.set(key, { data: result, expiresAt: Date.now() + ttlMs });
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  invalidateCache(): void {
    this.cachedHomeFeed = null;
    this.homeFeedCacheTime = 0;
    this.totalMoviesCache = null;
    this.totalSeriesCache = null;
    this.categoryCountsCache.clear();
    this.queryCache.clear();
    this.inFlight.clear();
  }

  async getMovies(options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }): Promise<{ items: MediaItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
    const cat = (options.category || 'all').toLowerCase().trim();
    const search = (options.search || '').trim().toLowerCase();
    const cacheKey = `movies:${cat}:${page}:${limit}:${search}`;

    return this.getOrSetCache(cacheKey, this.QUERY_CACHE_TTL_MS, async () => {
      const skip = (page - 1) * limit;

      const adultFilter = { $not: ADULT_REGEX };
      const query: any = {
        $or: [
          { title: /\btoxic\b/i },
          { title: adultFilter, full_title: adultFilter },
        ],
      };

      if (options.search) {
        const q = options.search.trim();
        query.$and = [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { full_title: { $regex: q, $options: 'i' } },
            ],
          },
        ];
      } else if (options.category && options.category.toLowerCase() !== 'all') {
        const c = options.category.toLowerCase().trim();
        if (c === 'indian') {
          query.is_indian = true;
        } else if (c === 'global' || c === 'non-indian' || c === 'non_indian' || c === 'international') {
          query.is_indian = false;
        } else {
          query.$and = [
            {
              $or: [
                { title: { $regex: c, $options: 'i' } },
                { full_title: { $regex: c, $options: 'i' } },
              ],
            },
          ];
        }
      }

      let livePrepended: MediaItem[] = [];
      if (!options.search && page === 1) {
        try {
          const liveItems = await scraperPipelineService.getLatestLiveItems();
          if (liveItems && liveItems.length > 0) {
            const c = options.category?.toLowerCase()?.trim();
            if (c === 'indian') {
              livePrepended = liveItems.filter((i) => (i.type === 'movie' || !i.type) && i.isIndian);
            } else if (c === 'global' || c === 'non-indian' || c === 'non_indian' || c === 'international') {
              livePrepended = liveItems.filter((i) => (i.type === 'movie' || !i.type) && !i.isIndian);
            } else {
              livePrepended = liveItems.filter((i) => i.type === 'movie' || !i.type);
            }
          }
        } catch (err: any) {
          console.warn('Could not fetch live releases for movies:', err.message);
        }
      }

      // Strictly sort by latest website release order (newest updated/created first)
      const findQuery = Movie.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('id title full_title poster_url poster_filename year is_indian streams')
        .skip(skip)
        .limit(limit)
        .lean();

      if (livePrepended.length > 0) {
        const liveTitles = new Set(livePrepended.map((i) => i.title.toLowerCase()));
        const docs = await findQuery;
        const older = docs.map(mapMovieToMediaItem).filter((i) => !liveTitles.has(i.title.toLowerCase()));
        const combined = [...livePrepended, ...older].slice(0, limit);
        return {
          items: combined,
          total: Math.max(11182, combined.length),
          page,
          totalPages: Math.ceil(11182 / limit),
        };
      }

      // Fast count resolution: user searches count dynamically; category and overall feeds use memory cache
      const categoryKey = options.category?.toLowerCase()?.trim() || '';
      let total = 11182;

      if (options.search) {
        const [docs, count] = await Promise.all([findQuery, Movie.countDocuments(query)]);
        return {
          items: docs.map(mapMovieToMediaItem),
          total: count,
          page,
          totalPages: Math.ceil(count / limit),
        };
      }

      if (categoryKey && categoryKey !== 'all') {
        if (!this.categoryCountsCache.has(categoryKey)) {
          const count = await Movie.countDocuments(query);
          this.categoryCountsCache.set(categoryKey, count);
        }
        total = this.categoryCountsCache.get(categoryKey) || 5000;
      } else {
        if (this.totalMoviesCache === null) {
          this.totalMoviesCache = await Movie.countDocuments(query);
        }
        total = this.totalMoviesCache;
      }

      const docs = await findQuery;
      return {
        items: docs.map(mapMovieToMediaItem),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  async getSeries(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ items: MediaItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
    const search = (options.search || '').trim().toLowerCase();
    const cacheKey = `series:${page}:${limit}:${search}`;

    return this.getOrSetCache(cacheKey, this.QUERY_CACHE_TTL_MS, async () => {
      const skip = (page - 1) * limit;

      const adultFilter = { $not: ADULT_REGEX };
      const query: any = {
        $or: [
          { title: /\btoxic\b/i },
          { title: adultFilter, full_title: adultFilter },
        ],
      };

      if (options.search) {
        const q = options.search.trim();
        query.$and = [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { full_title: { $regex: q, $options: 'i' } },
            ],
          },
        ];
      }

      let livePrepended: MediaItem[] = [];
      if (!options.search && page === 1) {
        try {
          const liveItems = await scraperPipelineService.getLatestLiveItems();
          if (liveItems && liveItems.length > 0) {
            livePrepended = liveItems.filter((i) => i.type === 'tv' || (i as any).type === 'series');
          }
        } catch (err: any) {
          console.warn('Could not fetch live releases for series:', err.message);
        }
      }

      // Sort strictly by latest website release order (newest updated/created first)
      const findQuery = Series.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('id title full_title poster_url poster_filename seasons')
        .skip(skip)
        .limit(limit)
        .lean();

      if (livePrepended.length > 0) {
        const liveTitles = new Set(livePrepended.map((i) => i.title.toLowerCase()));
        const docs = await findQuery;
        const older = docs.map(mapSeriesToMediaItem).filter((i) => !liveTitles.has(i.title.toLowerCase()));
        const combined = [...livePrepended, ...older].slice(0, limit);
        return {
          items: combined,
          total: Math.max(1282, combined.length),
          page,
          totalPages: Math.ceil(1282 / limit),
        };
      }

      let total = 1282;
      if (options.search) {
        const [docs, count] = await Promise.all([findQuery, Series.countDocuments(query)]);
        total = count;
        return {
          items: docs.map(mapSeriesToMediaItem),
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      } else {
        if (this.totalSeriesCache === null) {
          this.totalSeriesCache = await Series.countDocuments(query);
        }
        total = this.totalSeriesCache;
        const docs = await findQuery;
        return {
          items: docs.map(mapSeriesToMediaItem),
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      }
    });
  }

  async getMovieById(id: string): Promise<any | null> {
    const cacheKey = `movie_id:${id}`;
    return this.getOrSetCache(cacheKey, 10 * 60 * 1000, async () => {
      const movie = await Movie.findOne({ id }).lean();
      if (movie) {
        const text = `${movie.title || ''} ${movie.full_title || ''} ${movie.movie_page_url || ''}`;
        if (/\btoxic\b/i.test(text)) return movie; // Exception: Keep Toxic in App
        if (ADULT_REGEX.test(text)) return null;
      }
      return movie;
    });
  }

  async getSeriesById(id: string): Promise<any | null> {
    const cacheKey = `series_id:${id}`;
    return this.getOrSetCache(cacheKey, 10 * 60 * 1000, async () => {
      const series = await Series.findOne({ id }).lean();
      if (series) {
        const text = `${series.title || ''} ${series.full_title || ''} ${series.movie_page_url || ''}`;
        if (/\btoxic\b/i.test(text)) return series; // Exception: Keep Toxic in App
        if (ADULT_REGEX.test(text)) return null;
      }
      return series;
    });
  }

  /**
   * Latest Feed: Combined Movies & Web Series sorted by HDHub4u exact live release order
   */
  async getLatestFeed(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ items: MediaItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
    const search = (options.search || '').trim().toLowerCase();
    const cacheKey = `latest:${page}:${limit}:${search}`;

    return this.getOrSetCache(cacheKey, this.QUERY_CACHE_TTL_MS, async () => {
      const skip = (page - 1) * limit;

      const adultFilter = { $not: ADULT_REGEX };
      const query: any = {
        $or: [
          { title: /\btoxic\b/i },
          { title: adultFilter, full_title: adultFilter },
        ],
      };

      if (options.search) {
        const q = options.search.trim();
        query.$and = [
          {
            $or: [
              { title: { $regex: q, $options: 'i' } },
              { full_title: { $regex: q, $options: 'i' } },
            ],
          },
        ];
      }

      if (!options.search) {
        try {
          const liveItems = await scraperPipelineService.getLatestLiveItems();
          if (liveItems && liveItems.length > 0) {
            if (skip < liveItems.length) {
              const slice = liveItems.slice(skip, skip + limit);
              if (slice.length < limit) {
                const needed = limit - slice.length;
                const liveTitles = new Set(liveItems.map((i) => i.title.toLowerCase()));
                const olderMovies = await Movie.find(query)
                  .sort({ updatedAt: -1, createdAt: -1 })
                  .select('id title full_title poster_url poster_filename year is_indian streams')
                  .limit(needed + 30)
                  .lean();
                const olderSeries = await Series.find(query)
                  .sort({ updatedAt: -1, createdAt: -1 })
                  .select('id title full_title poster_url poster_filename seasons')
                  .limit(needed + 30)
                  .lean();
                const olderCombined = [
                  ...olderMovies.map(mapMovieToMediaItem),
                  ...olderSeries.map(mapSeriesToMediaItem),
                ].filter((i) => !liveTitles.has(i.title.toLowerCase()));
                slice.push(...olderCombined.slice(0, needed));
              }
              return {
                items: slice,
                total: Math.max(12469, liveItems.length),
                page,
                totalPages: Math.ceil(12469 / limit),
              };
            }
          }
        } catch (err: any) {
          console.warn('Could not fetch live scraped latest feed:', err.message);
        }
      }

      const halfLimit = Math.ceil(limit / 2);
      const halfSkip = Math.floor(skip / 2);

      const [movies, series] = await Promise.all([
        Movie.find(query)
          .sort({ updatedAt: -1, createdAt: -1 })
          .select('id title full_title poster_url poster_filename year is_indian streams updatedAt')
          .skip(halfSkip)
          .limit(halfLimit + 10)
          .lean(),
        Series.find(query)
          .sort({ updatedAt: -1, createdAt: -1 })
          .select('id title full_title poster_url poster_filename seasons updatedAt')
          .skip(halfSkip)
          .limit(halfLimit + 10)
          .lean(),
      ]);

      const mappedMovies = movies.map((doc: any) => ({ ...mapMovieToMediaItem(doc), updatedAt: doc.updatedAt }));
      const mappedSeries = series.map((doc: any) => ({ ...mapSeriesToMediaItem(doc), updatedAt: doc.updatedAt }));

      const combined = [...mappedMovies, ...mappedSeries]
        .sort((a: any, b: any) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        .slice(0, limit);

      return {
        items: combined,
        total: 12469,
        page,
        totalPages: Math.ceil(12469 / limit),
      };
    });
  }

  /**
   * Home Feed: In-memory cached for 5 minutes with lean projections
   */
  async getHomeFeed(): Promise<HomeFeed> {
    const now = Date.now();
    if (this.cachedHomeFeed && now - this.homeFeedCacheTime < this.CACHE_TTL_MS) {
      return this.cachedHomeFeed;
    }

    const projection = 'id title full_title poster_url poster_filename year is_indian streams';
    const adultFilter = { $not: ADULT_REGEX };
    const baseMovieFilter = {
      $or: [
        { title: /\btoxic\b/i },
        { title: adultFilter, full_title: adultFilter },
      ],
    };

    const [latestMovies, indianMovies, nonIndianMovies, bollywood, southDubbed, hollywood, webSeries] = await Promise.all([
      Movie.find(baseMovieFilter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        is_indian: true,
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        is_indian: false,
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        $or: [{ full_title: /hindi/i }, { title: /hindi/i }],
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        $or: [
          { full_title: /telugu|tamil|kannada|malayalam/i },
          { title: /telugu|tamil|kannada|malayalam/i },
        ],
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        $or: [{ full_title: /dual audio|english/i }, { title: /dual audio|english/i }],
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Series.find({
        title: adultFilter,
        full_title: adultFilter,
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('id title full_title poster_url poster_filename seasons')
        .limit(20)
        .lean(),
    ]);

    let latestItems = latestMovies.map(mapMovieToMediaItem);
    try {
      const liveItems = await scraperPipelineService.getLatestLiveItems();
      if (liveItems && liveItems.length > 0) {
        latestItems = liveItems.slice(0, 20);
      }
    } catch (err: any) {
      console.warn('Could not fetch live releases for home feed:', err.message);
    }
    const indianItems = indianMovies.map(mapMovieToMediaItem);
    const nonIndianItems = nonIndianMovies.map(mapMovieToMediaItem);
    const bollywoodItems = bollywood.map(mapMovieToMediaItem);
    const southItems = southDubbed.map(mapMovieToMediaItem);
    const hollywoodItems = hollywood.map(mapMovieToMediaItem);
    const seriesItems = webSeries.map(mapSeriesToMediaItem);

    const featured = latestItems[0] || {
      id: '1',
      title: 'Aryabhatt Ka Zero (2026)',
      overview: 'Aryabhatt Ka Zero (2026) WEB-DL [Hindi DD5.1] 4K 1080p 720p & 480p',
      posterUrl: 'https://image.tmdb.org/t/p/w500/hI5MZ78pj2aFuyEz1oOFMVsr8dM.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/hI5MZ78pj2aFuyEz1oOFMVsr8dM.jpg',
      releaseYear: '2026',
      rating: 8.5,
      type: 'movie',
      category: 'Bollywood',
      genres: ['Bollywood', '4K'],
      duration: 'Full Movie',
    };

    const feed: HomeFeed = {
      featured,
      sections: [
        {
          title: '🇮🇳 Latest Indian Movies',
          category: 'Indian',
          type: 'movie',
          items: indianItems.length > 0 ? indianItems : latestItems,
        },
        {
          title: '🌍 Latest Global Movies',
          category: 'Global',
          type: 'movie',
          items: nonIndianItems.length > 0 ? nonIndianItems : latestItems,
        },
        {
          title: '📺 Web Series & Shows',
          category: 'Series',
          type: 'tv',
          items: seriesItems,
        },
      ],
    };

    this.cachedHomeFeed = feed;
    this.homeFeedCacheTime = now;
    return feed;
  }
}

export const contentService = new ContentService();
