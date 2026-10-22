import { Movie, Series } from '../db';
import { HomeFeed, MediaItem } from '../types';

function extractYear(title: string): string {
  const match = title.match(/\((\d{4})\)/);
  return match ? match[1] : '2026';
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
    const m = text.match(/\b(19\d{2}|20\d{2})\b/);
    yearNum = m ? parseInt(m[1], 10) : 2026;
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
    streamUrl: undefined,
  };
}

const ADULT_REGEX =
  /\b18\+|\b18\s*\+|adult|erotic|sex|\bhot\b|sensual|softcore|hotshots|ullu|kooku|primeshots|voovi|cineprime|moodx|chikooflix|hunters|nuefliks|besharams\b/i;

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

  // Cached total counts to avoid expensive countDocuments on every page
  private totalMoviesCache: number | null = null;
  private totalSeriesCache: number | null = null;

  invalidateCache(): void {
    this.cachedHomeFeed = null;
    this.homeFeedCacheTime = 0;
    this.totalMoviesCache = null;
    this.totalSeriesCache = null;
  }

  async getMovies(options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }): Promise<{ items: MediaItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
    const skip = (page - 1) * limit;

    const adultFilter = { $not: ADULT_REGEX };
    const query: any = {
      title: adultFilter,
      full_title: adultFilter,
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
      const cat = options.category.toLowerCase().trim();
      if (cat === 'indian') {
        query.is_indian = true;
      } else if (cat === 'non-indian' || cat === 'non_indian' || cat === 'international') {
        query.is_indian = false;
      } else {
        query.$and = [
          {
            $or: [
              { title: { $regex: cat, $options: 'i' } },
              { full_title: { $regex: cat, $options: 'i' } },
            ],
          },
        ];
      }
    }

    // Sort latest movies first by release year, then by updatedAt, createdAt
    const findQuery = Movie.find(query)
      .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
      .select('id title full_title poster_url poster_filename year is_indian streams')
      .skip(skip)
      .limit(limit)
      .lean();

    // Cache overall total if searching or filtering is not active
    const shouldCount = options.search || options.category;
    let total = 11182;

    if (shouldCount) {
      const [docs, count] = await Promise.all([findQuery, Movie.countDocuments(query)]);
      total = count;
      return {
        items: docs.map(mapMovieToMediaItem),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } else {
      if (this.totalMoviesCache === null) {
        this.totalMoviesCache = await Movie.countDocuments(query);
      }
      total = this.totalMoviesCache;
      const docs = await findQuery;
      return {
        items: docs.map(mapMovieToMediaItem),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    }
  }

  async getSeries(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ items: MediaItem[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 40));
    const skip = (page - 1) * limit;

    const adultFilter = { $not: ADULT_REGEX };
    const query: any = {
      title: adultFilter,
      full_title: adultFilter,
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

    // Sort by updatedAt: -1 and createdAt: -1 so new episodes or new series appear at the TOP!
    const findQuery = Series.find(query)
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .select('id title full_title poster_url poster_filename seasons')
      .skip(skip)
      .limit(limit)
      .lean();

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
  }

  async getMovieById(id: string): Promise<any | null> {
    return Movie.findOne({ id }).lean();
  }

  async getSeriesById(id: string): Promise<any | null> {
    return Series.findOne({ id }).lean();
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
    const skip = (page - 1) * limit;

    const adultFilter = { $not: ADULT_REGEX };
    const query: any = {
      title: adultFilter,
      full_title: adultFilter,
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

    const halfLimit = Math.ceil(limit / 2);
    const halfSkip = Math.floor(skip / 2);

    const [movies, series] = await Promise.all([
      Movie.find(query)
        .sort({ year: -1, updatedAt: -1, _id: -1 })
        .select('id title full_title poster_url poster_filename year is_indian streams updatedAt')
        .skip(halfSkip)
        .limit(halfLimit + 10)
        .lean(),
      Series.find(query)
        .sort({ updatedAt: -1, _id: -1 })
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
      title: adultFilter,
      full_title: adultFilter,
    };

    const [latestMovies, indianMovies, nonIndianMovies, bollywood, southDubbed, hollywood, webSeries] = await Promise.all([
      Movie.find(baseMovieFilter)
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        is_indian: true,
      })
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        is_indian: false,
      })
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        $or: [{ full_title: /hindi/i }, { title: /hindi/i }],
      })
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
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
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Movie.find({
        ...baseMovieFilter,
        $or: [{ full_title: /dual audio|english/i }, { title: /dual audio|english/i }],
      })
        .sort({ year: -1, updatedAt: -1, createdAt: -1, _id: -1 })
        .select(projection)
        .limit(20)
        .lean(),
      Series.find({
        title: adultFilter,
        full_title: adultFilter,
      })
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .select('id title full_title poster_url poster_filename seasons')
        .limit(20)
        .lean(),
    ]);

    const latestItems = latestMovies.map(mapMovieToMediaItem);
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
          title: '🔥 Latest Releases (Newest First)',
          category: 'Latest',
          type: 'movie',
          items: latestItems,
        },
        {
          title: '🇮🇳 Latest Indian Movies',
          category: 'Indian',
          type: 'movie',
          items: indianItems.length > 0 ? indianItems : latestItems,
        },
        {
          title: '🌍 Latest Non-Indian Movies',
          category: 'Non-Indian',
          type: 'movie',
          items: nonIndianItems.length > 0 ? nonIndianItems : latestItems,
        },
        {
          title: '🎬 Bollywood & Hindi Cinema',
          category: 'Bollywood',
          type: 'movie',
          items: bollywoodItems.length > 0 ? bollywoodItems : latestItems,
        },
        {
          title: '🌟 South Indian & Dubbed Hits',
          category: 'South Dubbed',
          type: 'movie',
          items: southItems.length > 0 ? southItems : latestItems,
        },
        {
          title: '🍿 Hollywood & Dual Audio Blockbusters',
          category: 'Hollywood',
          type: 'movie',
          items: hollywoodItems.length > 0 ? hollywoodItems : latestItems,
        },
        {
          title: '📺 Web Series & Shows (All Episodes)',
          category: 'Web Series',
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
