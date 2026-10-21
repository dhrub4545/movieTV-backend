import axios from 'axios';
import {
  BOLLYWOOD_MOVIES,
  FEATURED_BANNER,
  HOLLYWOOD_MOVIES,
  SOUTH_HINDI_DUBBED,
  TOLLYWOOD_MOVIES,
  TAMIL_MOVIES,
  WEB_SERIES,
  INDIAN_WEB_SERIES,
} from '../data/mockData';
import { HomeFeed, MediaItem } from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * India-centric TMDB Service.
 *
 * Fetches movie/TV metadata (posters, titles, ratings, overviews) organized
 * the way Indian audiences browse content:
 *   - Latest Bollywood (Hindi original)
 *   - South Indian – Hindi Dubbed (Telugu + Tamil dubbed to Hindi)
 *   - Hollywood – Hindi Dubbed
 *   - Tollywood (Telugu originals)
 *   - Tamil Blockbusters
 *   - Latest Indian Web Series
 *   - Hollywood Blockbusters (English originals)
 *
 * Falls back to curated mock data when TMDB_API_KEY is absent.
 */
export class TmdbService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private mapTmdbItem(
    item: any,
    type: 'movie' | 'tv',
    defaultCategory = 'Movies',
  ): MediaItem {
    const isMovie = type === 'movie' || item.media_type === 'movie';
    const title = isMovie
      ? item.title || item.original_title
      : item.name || item.original_name;
    const releaseDate = isMovie
      ? item.release_date || ''
      : item.first_air_date || '';
    const releaseYear = releaseDate ? releaseDate.split('-')[0] : '2024';

    return {
      id: `${isMovie ? 'm' : 'tv'}-${item.id}`,
      tmdbId: item.id,
      title: title || 'Untitled',
      overview: item.overview || 'No synopsis available.',
      posterUrl: item.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
        : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500',
      backdropUrl: item.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${item.backdrop_path}`
        : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280',
      releaseYear,
      rating: item.vote_average
        ? Math.round(item.vote_average * 10) / 10
        : 8.0,
      type: isMovie ? 'movie' : 'tv',
      category: defaultCategory,
      genres: ['Trending', defaultCategory],
      duration: isMovie ? 'Movie' : 'Series',
    };
  }

  /**
   * Helper: fetch a TMDB discover / trending endpoint and map results.
   */
  private async fetchAndMap(
    url: string,
    type: 'movie' | 'tv',
    category: string,
    limit = 15,
  ): Promise<MediaItem[]> {
    try {
      const res = await axios.get(url, { timeout: 8000 });
      return (res.data.results || [])
        .slice(0, limit)
        .map((i: any) => this.mapTmdbItem(i, type, category));
    } catch {
      return [];
    }
  }

  // ── public API ───────────────────────────────────────────────────────

  async getHomeFeed(): Promise<HomeFeed> {
    if (!this.apiKey) {
      return this.getOfflineFeed();
    }

    const key = this.apiKey;

    // Fire all requests in parallel for speed
    const [
      bollywood,
      southDubbed,
      hollywoodHindi,
      tollywood,
      tamilHits,
      indianSeries,
      hollywoodEng,
      trendingIndia,
    ] = await Promise.all([
      // 1. Latest Bollywood (Hindi original movies, sorted by recent popularity)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_original_language=hi&sort_by=popularity.desc&region=IN&page=1`,
        'movie',
        'Bollywood',
      ),
      // 2. South Indian – Hindi Dubbed (Telugu & Tamil movies, with Hindi translations)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_original_language=te|ta&sort_by=popularity.desc&page=1`,
        'movie',
        'South Dubbed',
      ),
      // 3. Hollywood – Hindi Dubbed (English movies popular in India)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_original_language=en&sort_by=popularity.desc&region=IN&page=1`,
        'movie',
        'Hollywood Hindi',
      ),
      // 4. Tollywood (Telugu originals)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_original_language=te&sort_by=popularity.desc&page=1`,
        'movie',
        'Tollywood',
      ),
      // 5. Tamil Blockbusters
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_original_language=ta&sort_by=popularity.desc&page=1`,
        'movie',
        'Tamil',
      ),
      // 6. Indian Web Series (Hindi TV, sorted by popularity)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/discover/tv?api_key=${key}&with_original_language=hi&sort_by=popularity.desc&page=1`,
        'tv',
        'Indian Web Series',
      ),
      // 7. Hollywood Blockbusters (English originals, worldwide trending)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/trending/movie/week?api_key=${key}`,
        'movie',
        'Hollywood',
      ),
      // 8. Trending in India (all media types)
      this.fetchAndMap(
        `${TMDB_BASE_URL}/trending/all/week?api_key=${key}&region=IN`,
        'movie',
        'Trending India',
      ),
    ]);

    // Pick the best featured banner
    const featured =
      (trendingIndia.length > 0 ? trendingIndia[0] : null) ||
      (bollywood.length > 0 ? bollywood[0] : null) ||
      FEATURED_BANNER;

    return {
      featured,
      sections: [
        {
          title: '🔥 Latest Bollywood',
          category: 'Bollywood',
          type: 'movie',
          items: bollywood.length ? bollywood : BOLLYWOOD_MOVIES,
        },
        {
          title: '🎬 South Indian – Hindi Dubbed',
          category: 'South Dubbed',
          type: 'movie',
          items: southDubbed.length ? southDubbed : SOUTH_HINDI_DUBBED,
        },
        {
          title: '🍿 Hollywood – Hindi Dubbed',
          category: 'Hollywood Hindi',
          type: 'movie',
          items: hollywoodHindi.length ? hollywoodHindi : HOLLYWOOD_MOVIES,
        },
        {
          title: '🌟 Tollywood Hits',
          category: 'Tollywood',
          type: 'movie',
          items: tollywood.length ? tollywood : TOLLYWOOD_MOVIES,
        },
        {
          title: '🎥 Tamil Blockbusters',
          category: 'Tamil',
          type: 'movie',
          items: tamilHits.length ? tamilHits : TAMIL_MOVIES,
        },
        {
          title: '📺 Indian Web Series',
          category: 'Indian Web Series',
          type: 'tv',
          items: indianSeries.length ? indianSeries : INDIAN_WEB_SERIES,
        },
        {
          title: '💎 Hollywood Blockbusters',
          category: 'Hollywood',
          type: 'movie',
          items: hollywoodEng.length ? hollywoodEng : HOLLYWOOD_MOVIES,
        },
        {
          title: '📈 Trending in India',
          category: 'Trending India',
          type: 'movie',
          items: trendingIndia.length
            ? trendingIndia
            : [...BOLLYWOOD_MOVIES.slice(0, 5), ...HOLLYWOOD_MOVIES.slice(0, 5)],
        },
      ],
    };
  }

  /**
   * Offline / fallback feed when TMDB API key is not present.
   */
  private getOfflineFeed(): HomeFeed {
    return {
      featured: FEATURED_BANNER,
      sections: [
        { title: '🔥 Latest Bollywood', category: 'Bollywood', type: 'movie', items: BOLLYWOOD_MOVIES },
        { title: '🎬 South Indian – Hindi Dubbed', category: 'South Dubbed', type: 'movie', items: SOUTH_HINDI_DUBBED },
        { title: '🍿 Hollywood – Hindi Dubbed', category: 'Hollywood Hindi', type: 'movie', items: HOLLYWOOD_MOVIES },
        { title: '🌟 Tollywood Hits', category: 'Tollywood', type: 'movie', items: TOLLYWOOD_MOVIES },
        { title: '🎥 Tamil Blockbusters', category: 'Tamil', type: 'movie', items: TAMIL_MOVIES },
        { title: '📺 Indian Web Series', category: 'Indian Web Series', type: 'tv', items: INDIAN_WEB_SERIES },
        { title: '💎 Hollywood Blockbusters', category: 'Hollywood', type: 'movie', items: HOLLYWOOD_MOVIES },
        { title: '📺 Popular Web Series', category: 'Web Series', type: 'tv', items: WEB_SERIES },
      ],
    };
  }

  async getMovies(category?: string): Promise<MediaItem[]> {
    const cat = category?.toLowerCase();
    if (cat === 'bollywood') return BOLLYWOOD_MOVIES;
    if (cat === 'hollywood') return HOLLYWOOD_MOVIES;
    if (cat === 'tollywood') return TOLLYWOOD_MOVIES;
    if (cat === 'tamil') return TAMIL_MOVIES;
    if (cat === 'south dubbed' || cat === 'south') return SOUTH_HINDI_DUBBED;
    return [...BOLLYWOOD_MOVIES, ...HOLLYWOOD_MOVIES, ...TOLLYWOOD_MOVIES, ...TAMIL_MOVIES, ...SOUTH_HINDI_DUBBED];
  }

  async getSeries(): Promise<MediaItem[]> {
    return [...INDIAN_WEB_SERIES, ...WEB_SERIES];
  }

  async search(query: string): Promise<MediaItem[]> {
    if (!query) return [];
    const q = query.toLowerCase();

    const all = [
      ...BOLLYWOOD_MOVIES,
      ...HOLLYWOOD_MOVIES,
      ...TOLLYWOOD_MOVIES,
      ...TAMIL_MOVIES,
      ...SOUTH_HINDI_DUBBED,
      ...WEB_SERIES,
      ...INDIAN_WEB_SERIES,
    ];
    const localMatches = all.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.overview || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.genres || []).some((g: string) => g.toLowerCase().includes(q)),
    );

    if (this.apiKey) {
      try {
        const res = await axios.get(
          `${TMDB_BASE_URL}/search/multi?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&region=IN`,
        );
        const tmdbMatches = (res.data.results || [])
          .filter(
            (i: any) => i.media_type === 'movie' || i.media_type === 'tv',
          )
          .slice(0, 15)
          .map((i: any) => this.mapTmdbItem(i, i.media_type));
        return [...localMatches, ...tmdbMatches];
      } catch {
        return localMatches;
      }
    }

    return localMatches;
  }
}

export const tmdbService = new TmdbService();
