import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Movie, ScraperMeta, Series } from '../db';
import { MediaItem } from '../types';
import { ContentService, mapMovieToMediaItem, mapSeriesToMediaItem } from './contentService';
import { extractDirectM3u8 } from './m3u8Extractor';
import { resolveGreenmotors, rot13 } from './greenmotorsResolver';

export { resolveGreenmotors, rot13 };

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://new8.hdhub4u.cl/',
};

const DEFAULT_BASE_URL = 'https://new8.hdhub4u.cl';

function toEmbedLink(url: string): string {
  if (!url) return '';
  url = url.trim();
  if (url.includes('hdstream4u.com/file/')) return url.replace('/file/', '/embed/');
  if (url.includes('hdstream4u.com/embed/')) return url;
  if (url.includes('/e/') || url.includes('embed')) return url;
  return url.replace(/\/(?:file|f|d)\//, '/embed/');
}

function cleanTitle(rawTitle: string): { displayName: string; cleanName: string } {
  const unescaped = rawTitle
    .replace(/&#038;/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .trim();

  const cleanName = unescaped
    .split(
      /\s+(?:WEB-DL|WEBRip|BluRay|HDTS|HDTC|HQ-HDTC|HQ|DS4K|HD|Clean|DTHRip|DVDRip|HDRip|\[|\(|Season|Complete|EP|Episode)/i,
    )[0]
    .trim();

  const yearMatch = unescaped.match(/\((?:19|20)\d{2}\)/);
  const seasonMatch = unescaped.match(/\((?:Season\s*\d+|S\d+)\)/i);

  let extra = '';
  if (yearMatch) {
    extra = ` ${yearMatch[0]}`;
  } else if (seasonMatch) {
    extra = ` ${seasonMatch[0]}`;
  }

  const displayName =
    extra && !cleanName.includes(extra.trim()) ? `${cleanName}${extra}`.trim() : cleanName;

  return {
    displayName: displayName || unescaped,
    cleanName: cleanName || unescaped,
  };
}

function extractReleaseYear(title: string, fullTitle?: string): number {
  const text = `${fullTitle || ''} ${title || ''}`;
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : new Date().getFullYear();
}

const FOREIGN_INDICATORS =
  /\b(english|hollywood|japanese|korean|indonesian|chinese|thai|russian|spanish|french|german|turkish|italian|anime)\b/i;

function isIndianMovie(title: string, fullTitle?: string): boolean {
  const text = `${title || ''} ${fullTitle || ''}`;
  return !FOREIGN_INDICATORS.test(text);
}

export interface ScraperStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  baseUrl: string;
  nextRunAt: string | null;
  totalNewMoviesAdded: number;
  totalNewSeriesAdded: number;
  totalMoviesUpdated: number;
  totalEpisodesUpdated: number;
  lastRunResult: {
    scannedItems: number;
    newMovies: number;
    updatedMovies: number;
    newSeries: number;
    updatedSeriesEpisodes: number;
    skippedExisting: number;
    durationMs: number;
  } | null;
}

export class ScraperPipelineService {
  private baseUrl: string = DEFAULT_BASE_URL;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;

  private totalNewMoviesAdded = 0;
  private totalNewSeriesAdded = 0;
  private totalMoviesUpdated = 0;
  private totalEpisodesUpdated = 0;

  private lastRunResult: ScraperStatus['lastRunResult'] = null;
  private readonly INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  // In-memory cache of exact scraped latest releases matching HDHub4u homepage
  private latestLiveItems: MediaItem[] = [];
  private latestLiveItemsTime = 0;

  constructor(private contentService?: ContentService) {
    this.loadPersistedConfig();
  }

  async getLatestLiveItems(forceRefresh = false): Promise<MediaItem[]> {
    if (!forceRefresh && this.latestLiveItems.length > 0 && Date.now() - this.latestLiveItemsTime < this.INTERVAL_MS) {
      return this.latestLiveItems;
    }
    await this.runPipeline({ maxPages: 2 });
    return this.latestLiveItems;
  }

  private loadPersistedConfig() {
    try {
      const configPath = path.resolve(__dirname, '../../scraper_config.json');
      const tmpPath = path.resolve('/tmp', 'scraper_config.json');
      const targetPath = fs.existsSync(configPath)
        ? configPath
        : fs.existsSync(tmpPath)
          ? tmpPath
          : null;

      if (targetPath) {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.baseUrl && typeof parsed.baseUrl === 'string') {
          this.baseUrl = parsed.baseUrl.trim().replace(/\/+$/, '');
          HEADERS.Referer = this.baseUrl + '/';
          console.log(`📌 [Scraper Pipeline] Loaded custom source URL: ${this.baseUrl}`);
        }
      }
    } catch (err: any) {
      console.warn('Could not read scraper_config.json:', err.message);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async setBaseUrl(newUrl: string): Promise<{ success: boolean; message: string; previousUrl: string; currentUrl: string }> {
    let clean = (newUrl || '').trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    clean = clean.replace(/\/+$/, '');

    const previousUrl = this.baseUrl;
    this.baseUrl = clean;
    HEADERS.Referer = clean + '/';

    const payload = JSON.stringify(
      {
        baseUrl: this.baseUrl,
        previousUrl,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    );

    try {
      const configPath = path.resolve(__dirname, '../../scraper_config.json');
      fs.writeFileSync(configPath, payload);
    } catch {
      try {
        const tmpPath = path.resolve('/tmp', 'scraper_config.json');
        fs.writeFileSync(tmpPath, payload);
      } catch (err: any) {
        console.warn('Failed to persist scraper_config.json in /tmp:', err.message);
      }
    }

    try {
      await ScraperMeta.findOneAndUpdate(
        { key: 'global_scraper_status' },
        { $set: { baseUrl: this.baseUrl } },
        { upsert: true },
      );
    } catch (err: any) {
      console.warn('Could not persist baseUrl to MongoDB:', err.message);
    }

    console.log(`🔄 [Scraper Pipeline] Source URL updated to: ${this.baseUrl}`);
    return {
      success: true,
      message: `Scraper source URL successfully updated to: ${this.baseUrl}`,
      previousUrl,
      currentUrl: this.baseUrl,
    };
  }

  async testConnection(targetUrl?: string): Promise<{ success: boolean; status: number; latencyMs: number; message: string }> {
    const url = (targetUrl || this.baseUrl).trim().replace(/\/+$/, '');
    const start = Date.now();
    try {
      const resp = await axios.get(url, { headers: HEADERS, timeout: 8000 });
      const latencyMs = Date.now() - start;
      return {
        success: resp.status >= 200 && resp.status < 400,
        status: resp.status,
        latencyMs,
        message: `Connection OK (${resp.status}) - Latency: ${latencyMs}ms`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        success: false,
        status: err.response?.status || 0,
        latencyMs,
        message: err.message || 'Connection failed',
      };
    }
  }

  setContentService(service: ContentService) {
    this.contentService = service;
  }

  /**
   * Start recurring 10-minute automated scraper pipeline
   */
  startScheduler() {
    if (this.timer) return;

    this.nextRunAt = new Date(Date.now() + 15000); // First run in 15 seconds
    setTimeout(() => {
      this.runPipeline().catch((err) =>
        console.error('⚠️ Initial scraper pipeline error:', err.message),
      );
    }, 15000);

    this.timer = setInterval(() => {
      this.nextRunAt = new Date(Date.now() + this.INTERVAL_MS);
      this.runPipeline().catch((err) =>
        console.error('⚠️ Scheduled scraper pipeline error:', err.message),
      );
    }, this.INTERVAL_MS);

    console.log('⏰ Scheduled automated Scraper Pipeline every 10 minutes');
  }

  stopScheduler() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getStatus(): Promise<ScraperStatus> {
    try {
      const meta = await ScraperMeta.findOne({ key: 'global_scraper_status' }).lean();
      if (meta) {
        if (meta.baseUrl && meta.baseUrl !== this.baseUrl) {
          this.baseUrl = meta.baseUrl;
          HEADERS.Referer = meta.baseUrl + '/';
        }
        return {
          baseUrl: meta.baseUrl || this.baseUrl,
          isRunning: this.isRunning,
          intervalMinutes: 10,
          lastRunAt: meta.lastRunAt ? new Date(meta.lastRunAt).toISOString() : null,
          nextRunAt: meta.nextRunAt ? new Date(meta.nextRunAt).toISOString() : null,
          totalNewMoviesAdded: meta.totalNewMoviesAdded || 0,
          totalNewSeriesAdded: meta.totalNewSeriesAdded || 0,
          totalMoviesUpdated: meta.totalMoviesUpdated || 0,
          totalEpisodesUpdated: meta.totalEpisodesUpdated || 0,
          lastRunResult: meta.lastRunResult || null,
        };
      }
    } catch (err: any) {
      console.warn('Could not read persistent scraper status from MongoDB:', err.message);
    }

    return {
      baseUrl: this.baseUrl,
      isRunning: this.isRunning,
      intervalMinutes: 10,
      lastRunAt: this.lastRunAt?.toISOString() || null,
      nextRunAt: this.nextRunAt?.toISOString() || null,
      totalNewMoviesAdded: this.totalNewMoviesAdded,
      totalNewSeriesAdded: this.totalNewSeriesAdded,
      totalMoviesUpdated: this.totalMoviesUpdated,
      totalEpisodesUpdated: this.totalEpisodesUpdated,
      lastRunResult: this.lastRunResult,
    };
  }

  /**
   * Main pipeline execution:
   * 1. Fetches latest releases from page 1 (and page 2 if requested).
   * 2. Checks MongoDB in high-speed batches:
   *    - Existing Movies with valid stream links and matching title are fast-skipped in 0ms.
   *    - Movies with updated quality / audio (or missing links) are refreshed.
   *    - Existing Series are fast-skipped if fullTitle matches (no new episodes).
   *    - Series with new episodes are parsed and merged to top of feed.
   * 3. Brand-new releases are parsed & inserted at top of feed (createdAt/updatedAt = now).
   * 4. Invalidates in-memory cache and persists execution metrics to MongoDB.
   */
  async runPipeline(options?: { maxPages?: number }): Promise<ScraperStatus['lastRunResult']> {
    if (this.isRunning) {
      console.log('⏳ Scraper pipeline is already running. Skipping overlapping execution.');
      return this.lastRunResult;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log('\n===============================================================');
    console.log(`🚀 [Scraper Pipeline] Starting scan at ${new Date().toISOString()}...`);

    let scannedCount = 0;
    let newMoviesCount = 0;
    let updatedMoviesCount = 0;
    let newSeriesCount = 0;
    let updatedEpisodesCount = 0;
    let skippedCount = 0;

    try {
      const maxPages = options?.maxPages && options.maxPages > 1 ? options.maxPages : 2;
      const pagesToScan: string[] = [`${this.baseUrl}/`];
      for (let p = 2; p <= maxPages; p++) {
        pagesToScan.push(`${this.baseUrl}/page/${p}/`);
      }

      const discoveredItems: Array<{
        pageUrl: string;
        posterUrl: string;
        fullTitle: string;
        displayName: string;
        isSeriesCandidate: boolean;
      }> = [];

      for (const pageUrl of pagesToScan) {
        try {
          const resp = await axios.get(pageUrl, { headers: HEADERS, timeout: 12000 });
          const html = resp.data;

          // Ignore the top horizontal scrolling cards/carousel and start strictly from "Latest Releases" below it
          let targetHtml = html;
          const latestReleasesIdx = targetHtml.search(/Latest\s+Releases/i);
          if (latestReleasesIdx !== -1) {
            targetHtml = targetHtml.substring(latestReleasesIdx);
          } else {
            const recentMoviesIdx = targetHtml.search(/class=["'][^"']*recent-movies[^"']*["']/i);
            if (recentMoviesIdx !== -1) {
              targetHtml = targetHtml.substring(recentMoviesIdx);
            }
          }

          const items =
            targetHtml.match(/<li[^>]*class=["'][^"']*thumb[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi) || [];

          for (const itemHtml of items) {
            const hrefM = itemHtml.match(/<a\s+[^>]*href=["']([^"']+)["']/i);
            const titleM =
              itemHtml.match(/alt=["']([^"']+)["']/i) || itemHtml.match(/title=["']([^"']+)["']/i);
            const imgM = itemHtml.match(/<img\s+[^>]*src=["']([^"']+)["']/i);

            if (!hrefM || !titleM) continue;

            let href = hrefM[1];
            if (!href.startsWith('http')) {
              href = this.baseUrl + (href.startsWith('/') ? href : '/' + href);
            }

            let posterUrl = imgM ? imgM[1] : '';
            if (posterUrl && !posterUrl.startsWith('http')) {
              posterUrl = this.baseUrl + (posterUrl.startsWith('/') ? posterUrl : '/' + posterUrl);
            }

            const rawTitle = titleM[1];
            const { displayName } = cleanTitle(rawTitle);
            const fullTitle = rawTitle.replace(/&#038;/g, '&').replace(/&amp;/g, '&').trim();

            const isSeriesCandidate =
              /Season|\bS\d{1,2}\b|Episode|\bEP\b/i.test(fullTitle) ||
              /Season|\bS\d{1,2}\b|Episode|\bEP\b/i.test(displayName);

            discoveredItems.push({
              pageUrl: href,
              posterUrl,
              fullTitle,
              displayName,
              isSeriesCandidate,
            });
          }
        } catch (err: any) {
          console.warn(`[Scraper Pipeline] Could not fetch page ${pageUrl}:`, err.message);
        }
      }

      scannedCount = discoveredItems.length;
      console.log(`[Scraper Pipeline] Found ${scannedCount} items from latest page(s).`);

      // High-speed batch lookup in MongoDB
      const pageUrls = discoveredItems.map((d) => d.pageUrl);
      const displayNames = discoveredItems.map((d) => d.displayName);

      const [existingMovies, existingSeriesList] = await Promise.all([
        Movie.find({
          $or: [{ movie_page_url: { $in: pageUrls } }, { title: { $in: displayNames } }],
        }),
        Series.find({
          $or: [{ movie_page_url: { $in: pageUrls } }, { title: { $in: displayNames } }],
        }),
      ]);

      const movieMap = new Map<string, any>();
      for (const m of existingMovies) {
        if (m.movie_page_url) movieMap.set(m.movie_page_url, m);
        if (m.title) movieMap.set(m.title, m);
      }

      const seriesMap = new Map<string, any>();
      for (const s of existingSeriesList) {
        if (s.movie_page_url) seriesMap.set(s.movie_page_url, s);
        if (s.title) seriesMap.set(s.title, s);
      }

      const liveItems: MediaItem[] = [];

      // Process each discovered item
      for (const item of discoveredItems) {
        try {
          const isToxic = /\btoxic\b/i.test(`${item.displayName} ${item.fullTitle} ${item.pageUrl}`);
          const isAdult =
            !isToxic &&
            /\b18\+|\b18\s*\+|adult|erotic|sex|\bhot\b|sensual|softcore|hotshots|ullu|kooku|primeshots|voovi|cineprime|moodx|chikooflix|hunters|nuefliks|besharams|atrangii|papa['’]?s?[\s\-_]*friends?\b/i.test(
              `${item.displayName} ${item.fullTitle} ${item.pageUrl}`,
            );
          if (isAdult) {
            skippedCount++;
            continue; // Filter out 18+ adult content
          }

          const inMovie = movieMap.get(item.pageUrl) || movieMap.get(item.displayName);
          const existingSeries = seriesMap.get(item.pageUrl) || seriesMap.get(item.displayName);

          // 1. Existing Movie in DB
          if (inMovie) {
            let updatedStream = false;
            let metaChanged = false;

            // Fetch detail page to see if website has new or replaced watch_embed / player_2 stream links
            const detailHtml = await this.fetchDetailPage(item.pageUrl);

            if (detailHtml) {
              const parsed = await this.parseMovieOrSeries(detailHtml, item.displayName);
              if (parsed.streams) {
                const newEmbed = (parsed.streams.watch_embed || '').trim();
                const newRaw = (parsed.streams.watch_raw || '').trim();
                const newPlayer2 = (parsed.streams.player_2 || '').trim();
                const newM3u8 = (parsed.streams.m3u8_url || '').trim();
                const newPlayer2M3u8 = (parsed.streams.player_2_m3u8_url || '').trim();

                const oldEmbed = (inMovie.streams?.watch_embed || '').trim();
                const oldRaw = (inMovie.streams?.watch_raw || '').trim();
                const oldPlayer2 = (inMovie.streams?.player_2 || '').trim();
                const oldM3u8 = (inMovie.streams?.m3u8_url || '').trim();
                const oldP2M3u8 = (inMovie.streams?.player_2_m3u8_url || '').trim();

                const embedChanged = Boolean(newEmbed && newEmbed !== oldEmbed);
                const player2Changed = Boolean(newPlayer2 && newPlayer2 !== oldPlayer2);
                const rawChanged = Boolean(newRaw && newRaw !== oldRaw);
                const m3u8Changed = Boolean(newM3u8 && newM3u8 !== oldM3u8);
                const p2M3u8Changed = Boolean(newPlayer2M3u8 && newPlayer2M3u8 !== oldP2M3u8);

                const isChanged = embedChanged || player2Changed || rawChanged || m3u8Changed || p2M3u8Changed;

                if (isChanged) {
                  if (!inMovie.streams) {
                    inMovie.streams = {};
                  }
                  // Replace previous watch_embed link with the new link if changed or present
                  if (newEmbed) {
                    inMovie.streams.watch_embed = newEmbed;
                    // If watch_embed was replaced, reset old stale m3u8 and set new one if available
                    if (embedChanged) {
                      inMovie.streams.m3u8_url = newM3u8 || '';
                    }
                  }
                  // Replace previous player_2 link with the new link if changed or present
                  if (newPlayer2) {
                    inMovie.streams.player_2 = newPlayer2;
                    if (player2Changed) {
                      inMovie.streams.player_2_m3u8_url = newPlayer2M3u8 || '';
                    }
                  }
                  if (newRaw) {
                    inMovie.streams.watch_raw = newRaw;
                  }
                  if (!embedChanged && newM3u8) {
                    inMovie.streams.m3u8_url = newM3u8;
                  }
                  if (!player2Changed && newPlayer2M3u8) {
                    inMovie.streams.player_2_m3u8_url = newPlayer2M3u8;
                  }

                  inMovie.markModified('streams');
                  updatedStream = true;
                }
              }
            }

            if (item.posterUrl && !inMovie.poster_url) {
              inMovie.poster_url = item.posterUrl;
              metaChanged = true;
            }
            if (item.fullTitle && inMovie.full_title !== item.fullTitle) {
              inMovie.full_title = item.fullTitle;
              metaChanged = true;
            }
            if (item.pageUrl && inMovie.movie_page_url !== item.pageUrl) {
              inMovie.movie_page_url = item.pageUrl;
              metaChanged = true;
            }
            if (!inMovie.year || inMovie.year < 1900) {
              inMovie.year = extractReleaseYear(item.displayName, item.fullTitle);
              metaChanged = true;
            }
            if (inMovie.is_indian === undefined || inMovie.is_indian === null) {
              inMovie.is_indian = isIndianMovie(item.displayName, item.fullTitle);
              metaChanged = true;
            }

            if (updatedStream || metaChanged) {
              inMovie.updatedAt = new Date();
              await inMovie.save();

              if (updatedStream) {
                updatedMoviesCount++;
                this.totalMoviesUpdated++;
                console.log(
                  `🔄 [UPDATED MOVIE STREAM] ${inMovie.title}: Replaced old stream links with updated links (watch_embed: ${inMovie.streams?.watch_embed}, player_2: ${inMovie.streams?.player_2}) -> Pushed to TOP!`,
                );
              }
            } else {
              skippedCount++;
            }

            liveItems.push(mapMovieToMediaItem(inMovie));
            continue;
          }

          // 2. Existing Series in DB
          if (existingSeries) {
            let updatedSeries = false;
            let metaChanged = false;

            // Fetch detail page to see if website has new episodes or replaced stream links
            const detailHtml = await this.fetchDetailPage(item.pageUrl);
            if (detailHtml) {
              const parsed = await this.parseMovieOrSeries(detailHtml, item.displayName);
              if (parsed.type === 'series' && parsed.seasons) {
                const updatedCount = this.mergeNewEpisodes(existingSeries, parsed.seasons);
                if (updatedCount > 0) {
                  existingSeries.markModified('seasons');
                  updatedEpisodesCount += updatedCount;
                  updatedSeries = true;
                  console.log(
                    `✨ [UPDATED SERIES] ${existingSeries.title}: Replaced stream links for ${updatedCount} episode(s) -> Pushed to TOP!`,
                  );
                }
              }
            }

            if (item.posterUrl && !existingSeries.poster_url) {
              existingSeries.poster_url = item.posterUrl;
              metaChanged = true;
            }
            if (item.fullTitle && existingSeries.full_title !== item.fullTitle) {
              existingSeries.full_title = item.fullTitle;
              metaChanged = true;
            }
            if (item.pageUrl && existingSeries.movie_page_url !== item.pageUrl) {
              existingSeries.movie_page_url = item.pageUrl;
              metaChanged = true;
            }

            if (updatedSeries || metaChanged) {
              existingSeries.updatedAt = new Date(); // Push to TOP of series!
              await existingSeries.save();
            } else {
              skippedCount++;
            }

            liveItems.push(mapSeriesToMediaItem(existingSeries));
            continue;
          }

          // 3. Brand New Release Not In DB
          const detailHtml = await this.fetchDetailPage(item.pageUrl);
          if (!detailHtml) {
            skippedCount++;
            continue;
          }

          const parsed = await this.parseMovieOrSeries(detailHtml, item.displayName);

          if (parsed.type === 'series' && parsed.seasons && parsed.seasons.length > 0) {
            const newSeriesDoc = new Series({
              id: `series_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              title: item.displayName,
              full_title: item.fullTitle,
              type: 'series',
              poster_url: item.posterUrl,
              movie_page_url: item.pageUrl,
              seasons: parsed.seasons,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            await newSeriesDoc.save();
            liveItems.push(mapSeriesToMediaItem(newSeriesDoc));
            newSeriesCount++;
            this.totalNewSeriesAdded++;
            console.log(
              `🔥 [NEW WEBSERIES ADDED] ${item.displayName} (${parsed.seasons.length} Season(s)) -> Pushed to TOP!`,
            );
          } else {
            const year = extractReleaseYear(item.displayName, item.fullTitle);
            const isIndian = isIndianMovie(item.displayName, item.fullTitle);

            const newMovieDoc = new Movie({
              id: `movie_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              title: item.displayName,
              full_title: item.fullTitle,
              type: 'movie',
              poster_url: item.posterUrl,
              movie_page_url: item.pageUrl,
              year,
              is_indian: isIndian,
              streams: parsed.streams || {},
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            await newMovieDoc.save();
            liveItems.push(mapMovieToMediaItem(newMovieDoc));
            newMoviesCount++;
            this.totalNewMoviesAdded++;
            console.log(`🎬 [NEW MOVIE ADDED] ${item.displayName} -> Pushed to TOP!`);
          }
        } catch (itemErr: any) {
          console.warn(`[Scraper Pipeline] Error processing "${item.displayName}":`, itemErr.message);
        }
      }

      if (liveItems.length > 0) {
        this.latestLiveItems = liveItems;
        this.latestLiveItemsTime = Date.now();
        console.log(`📡 [Scraper Pipeline] Synced ${liveItems.length} latest live releases matching website.`);
      }

      // If new movies/series or updated stream links were added, invalidate in-memory cache
      if (newMoviesCount > 0 || updatedMoviesCount > 0 || newSeriesCount > 0 || updatedEpisodesCount > 0) {
        if (this.contentService) {
          this.contentService.invalidateCache();
        }
      }
    } catch (err: any) {
      console.error('[Scraper Pipeline] Fatal error in execution:', err.message);
    } finally {
      this.isRunning = false;
      this.lastRunAt = new Date();
      this.nextRunAt = new Date(Date.now() + this.INTERVAL_MS);

      const durationMs = Date.now() - startTime;
      this.lastRunResult = {
        scannedItems: scannedCount,
        newMovies: newMoviesCount,
        updatedMovies: updatedMoviesCount,
        newSeries: newSeriesCount,
        updatedSeriesEpisodes: updatedEpisodesCount,
        skippedExisting: skippedCount,
        durationMs,
      };

      try {
        await ScraperMeta.findOneAndUpdate(
          { key: 'global_scraper_status' },
          {
            $set: {
              baseUrl: this.baseUrl,
              lastRunAt: this.lastRunAt,
              nextRunAt: this.nextRunAt,
              lastRunResult: this.lastRunResult,
            },
            $inc: {
              totalNewMoviesAdded: newMoviesCount,
              totalNewSeriesAdded: newSeriesCount,
              totalMoviesUpdated: updatedMoviesCount,
              totalEpisodesUpdated: updatedEpisodesCount,
            },
          },
          { upsert: true, returnDocument: 'after' as any },
        );
      } catch (metaErr: any) {
        console.warn('Could not persist scraper execution metrics to MongoDB:', metaErr.message);
      }

      console.log('---------------------------------------------------------------');
      console.log(
        `✅ [Scraper Pipeline] Completed in ${(durationMs / 1000).toFixed(1)}s: ` +
          `Scanned: ${scannedCount} | Skipped: ${skippedCount} | ` +
          `New Movies: ${newMoviesCount} | Updated Movies: ${updatedMoviesCount} | New Series: ${newSeriesCount} | Updated Episodes: ${updatedEpisodesCount}`,
      );
      console.log(`⏰ Next scheduled run at: ${this.nextRunAt.toISOString()}`);
      console.log('===============================================================\n');

      return this.lastRunResult;
    }
  }

  public async fetchDetailPage(url: string): Promise<string | null> {
    try {
      const resp = await axios.get(url, { headers: HEADERS, timeout: 12000 });
      return resp.data;
    } catch {
      return null;
    }
  }

  private mergeNewEpisodes(existingSeries: any, newSeasons: any[]): number {
    let updatedCount = 0;
    if (!existingSeries.seasons) {
      existingSeries.seasons = [];
    }

    for (const newS of newSeasons) {
      let existingS = existingSeries.seasons.find(
        (s: any) => s.season_name?.toLowerCase() === newS.season_name?.toLowerCase(),
      );

      if (!existingS) {
        existingSeries.seasons.push(newS);
        updatedCount += (newS.episodes || []).length;
        continue;
      }

      for (const newEp of newS.episodes || []) {
        const existingEp = (existingS.episodes || []).find(
          (e: any) => e.episode?.toLowerCase() === newEp.episode?.toLowerCase(),
        );

        if (!existingEp) {
          existingS.episodes.push(newEp);
          existingS.total_episodes = existingS.episodes.length;
          updatedCount++;
        } else {
          // Replace old episode stream links if updated links were scraped
          let epChanged = false;
          const newEmb = (newEp.watch_1_embed || '').trim();
          const newP2 = (newEp.watch_2 || '').trim();
          const newRaw = (newEp.watch_1_raw || '').trim();
          const newM3u8 = (newEp.m3u8_url || '').trim();
          const newP2M3u8 = (newEp.player_2_m3u8_url || '').trim();

          if (newEmb && newEmb !== existingEp.watch_1_embed) {
            existingEp.watch_1_embed = newEmb;
            existingEp.m3u8_url = newM3u8 || ''; // Clear or update old stale m3u8
            epChanged = true;
          } else if (newM3u8 && newM3u8 !== existingEp.m3u8_url) {
            existingEp.m3u8_url = newM3u8;
            epChanged = true;
          }

          if (newP2 && newP2 !== existingEp.watch_2) {
            existingEp.watch_2 = newP2;
            existingEp.player_2_m3u8_url = newP2M3u8 || '';
            epChanged = true;
          } else if (newP2M3u8 && newP2M3u8 !== existingEp.player_2_m3u8_url) {
            existingEp.player_2_m3u8_url = newP2M3u8;
            epChanged = true;
          }

          if (newRaw && newRaw !== existingEp.watch_1_raw) {
            existingEp.watch_1_raw = newRaw;
            epChanged = true;
          }

          if (epChanged) {
            updatedCount++;
          }
        }
      }
    }

    return updatedCount;
  }

  public async parseMovieOrSeries(
    html: string,
    title: string,
    options?: { extractM3u8?: boolean },
  ): Promise<{
    type: 'movie' | 'series';
    streams?: { watch_embed: string; watch_raw: string; player_2: string; m3u8_url?: string; player_2_m3u8_url?: string };
    seasons?: Array<{
      season_name: string;
      total_episodes: number;
      episodes: Array<{
        episode: string;
        watch_1_embed: string;
        watch_1_raw: string;
        watch_2: string;
        m3u8_url?: string;
        player_2_m3u8_url?: string;
      }>;
    }>;
  }> {
    const mainM = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const postBody = mainM ? mainM[1].split('recent-movies')[0] : html;

    const seasonHeaderM = title.match(/\((?:Season\s*(\d+)|S(\d+))\)/i);
    const defaultSeason = seasonHeaderM
      ? `Season ${seasonHeaderM[1] || seasonHeaderM[2]}`
      : 'Season 1';

    const blocks = Array.from(
      postBody.matchAll(/<(h\d|p)[^>]*>([\s\S]*?)<\/\1>/gi),
    ).map((m) => m[2]);

    let currentSeason = defaultSeason;
    let currentEpLabel: string | null = null;
    let currentEpWatch1 = '';
    let currentEpWatch2 = '';

    const seasonsMap: Record<
      string,
      Array<{
        episode: string;
        watch_1_embed: string;
        watch_1_raw: string;
        watch_2: string;
        m3u8_url?: string;
        player_2_m3u8_url?: string;
      }>
    > = {};

    const commitCurrentEp = async () => {
      if (currentEpLabel) {
        if (!seasonsMap[currentSeason]) {
          seasonsMap[currentSeason] = [];
        }

        if (!seasonsMap[currentSeason].some((e) => e.episode === currentEpLabel)) {
          let w1Emb = '';
          let w1Raw = '';
          let gmEpDirect1 = '';

          if (currentEpWatch1.includes('greenmotors')) {
            const gm = await resolveGreenmotors(currentEpWatch1);
            w1Emb = gm.embedUrl;
            gmEpDirect1 = gm.directUrl;
            w1Raw = gm.directUrl || gm.embedUrl;
          } else {
            w1Emb = toEmbedLink(currentEpWatch1);
            w1Raw = currentEpWatch1;
          }

          let w2Emb = '';
          let gmEpDirect2 = '';
          if (currentEpWatch2) {
            if (currentEpWatch2.includes('greenmotors')) {
              const gm2 = await resolveGreenmotors(currentEpWatch2);
              w2Emb = gm2.embedUrl;
              gmEpDirect2 = gm2.directUrl;
            } else {
              w2Emb = toEmbedLink(currentEpWatch2);
            }
          }

          let m3u8Url = '';
          if (options?.extractM3u8 && w1Emb) {
            try {
              m3u8Url = (await extractDirectM3u8(w1Emb)) || '';
            } catch {}
          }
          if (!m3u8Url && gmEpDirect1) {
            m3u8Url = gmEpDirect1;
          }

          let p2M3u8 = '';
          const finalW2 = w2Emb || toEmbedLink(currentEpWatch2);
          if (options?.extractM3u8 && finalW2) {
            try {
              p2M3u8 = (await extractDirectM3u8(finalW2)) || '';
            } catch {}
          }
          if (!p2M3u8 && gmEpDirect2) {
            p2M3u8 = gmEpDirect2;
          }

          seasonsMap[currentSeason].push({
            episode: currentEpLabel,
            watch_1_embed: w1Emb,
            watch_1_raw: w1Raw,
            watch_2: finalW2,
            m3u8_url: m3u8Url,
            player_2_m3u8_url: p2M3u8,
          });
        }
      }
      currentEpLabel = null;
      currentEpWatch1 = '';
      currentEpWatch2 = '';
    };

    for (const blockContent of blocks) {
      const cleanText = blockContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // Check Season Header
      const sMatch = cleanText.match(
        /(?:Index of.*?[-\s]|Download.*?[-\s]|[\s\[\(]|^)(?:Season\s*(\d+)|S(\d{1,2}))[\s\]\)]/i,
      );
      if (sMatch && !/EPiSODE|Episode/i.test(cleanText)) {
        await commitCurrentEp();
        currentSeason = `Season ${sMatch[1] || sMatch[2]}`;
      }

      // Check Episode Header
      const epMatch = cleanText.match(/(?:EPiSODE|Episode|EP)\s*(\d+)/i);
      if (epMatch) {
        await commitCurrentEp();
        currentEpLabel = `Episode ${epMatch[1]}`;
      }

      // Extract links
      const linkMatches = Array.from(
        blockContent.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
      );

      for (const lm of linkMatches) {
        const href = lm[1].trim();
        const linkText = lm[2].replace(/<[^>]+>/g, '').trim().toUpperCase();

        if (currentEpLabel) {
          if (
            href.startsWith('#') ||
            href.includes('javascript:') ||
            href.includes('t.me') ||
            href.includes('telegram')
          ) {
            continue;
          }

          const isStreamingHost = [
            'hdstream4u',
            'vidaraa',
            'hubstream',
            'greenmotors',
            'hubcloud',
          ].some((d) => href.includes(d));
          const isWatchOrPlayer1 =
            linkText.includes('WATCH-1') ||
            linkText.includes('PLAYER 1') ||
            linkText.includes('PLAYER-1') ||
            linkText.includes('SERVER 1') ||
            linkText.includes('SERVER-1');
          const isWatchOrPlayer2 =
            linkText === '2' ||
            linkText.includes('PLAYER-2') ||
            linkText.includes('PLAYER 2') ||
            linkText.includes('WATCH-2') ||
            linkText.includes('SERVER 2') ||
            linkText.includes('SERVER-2') ||
            linkText.includes('ALT');

          if (isWatchOrPlayer2) {
            if (!currentEpWatch2) currentEpWatch2 = href;
          } else if (isWatchOrPlayer1) {
            if (!currentEpWatch1) {
              currentEpWatch1 = href;
            } else if (!currentEpWatch2 && currentEpWatch1 !== href) {
              currentEpWatch2 = href;
            }
          } else if (linkText === 'WATCH' || linkText.includes('WATCH')) {
            if (!currentEpWatch1) {
              currentEpWatch1 = href;
            } else if (!currentEpWatch2 && currentEpWatch1 !== href) {
              currentEpWatch2 = href;
            }
          } else if (isStreamingHost) {
            if (!currentEpWatch1) {
              currentEpWatch1 = href;
            } else if (!currentEpWatch2 && currentEpWatch1 !== href) {
              currentEpWatch2 = href;
            }
          }
        }
      }
    }

    await commitCurrentEp();

    if (Object.keys(seasonsMap).length > 0) {
      const seasonsOutput = Object.entries(seasonsMap).map(([sName, eps]) => ({
        season_name: sName,
        total_episodes: eps.length,
        episodes: eps.sort((a, b) => {
          const numA = parseInt(a.episode.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.episode.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        }),
      }));

      return {
        type: 'series',
        seasons: seasonsOutput,
      };
    }

    // Standalone Movie
    let watchUrl = '';
    let player2Url = '';

    const allAnchors = Array.from(postBody.matchAll(/<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi));

    for (const m of allAnchors) {
      const attrs = m[1];
      const inner = m[2];
      const hrefM = attrs.match(/href=["']([^"']+)["']/i);
      if (!hrefM) continue;
      const href = hrefM[1].trim();
      if (
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.includes('t.me') ||
        href.includes('telegram')
      ) {
        continue;
      }

      const text = inner.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

      // Ignore general download links (e.g. "DOWNLOAD 1080P", "480P", "720P", "G-DIRECT", "FAST CLOUD")
      if (
        /DOWNLOAD|\b\d{3,4}P\b|ZIP|G-DIRECT|GDRIVE|TORRENT|HEVC/i.test(text) &&
        !text.includes('WATCH') &&
        !text.includes('PLAYER')
      ) {
        continue;
      }

      // Match combined WATCH | PLAYER-2 links (frequent on HDHub4u)
      if (
        text.includes('WATCH') &&
        (text.includes('PLAYER-2') || text.includes('PLAYER 2') || text.includes('PLAYER2') || text.includes('PLAYER - 2'))
      ) {
        if (!watchUrl) watchUrl = href;
        if (!player2Url) player2Url = href;
      } else if (
        text.includes('PLAYER-2') ||
        text.includes('PLAYER 2') ||
        text.includes('PLAYER2') ||
        text.includes('SERVER-2') ||
        text.includes('SERVER 2') ||
        text.includes('SERVER2') ||
        text.includes('WATCH-2') ||
        text.includes('WATCH 2') ||
        text.includes('ALT') ||
        text === '2'
      ) {
        if (!player2Url) player2Url = href;
      } else if (
        text.includes('WATCH') ||
        text.includes('PLAYER 1') ||
        text.includes('PLAYER-1') ||
        text.includes('SERVER 1') ||
        text.includes('SERVER-1')
      ) {
        if (!watchUrl) watchUrl = href;
      }
    }

    // Fallback: If watchUrl or player2Url is still missing, check known stream hostnames
    if (!watchUrl || !player2Url) {
      const knownStreamHosts = [
        'hdstream4u',
        'hubstream',
        'vidaraa',
        'greenmotors',
        'multicloudlinks',
        'dr1.multidownload',
        'play4u',
        'hubcloud',
        'streamtape',
        'vidhide',
      ];
      for (const m of allAnchors) {
        const hrefM = m[1].match(/href=["']([^"']+)["']/i);
        if (!hrefM) continue;
        const href = hrefM[1].trim();
        if (knownStreamHosts.some((h) => href.includes(h))) {
          if (!watchUrl) {
            watchUrl = href;
          } else if (!player2Url && href !== watchUrl) {
            player2Url = href;
          }
        }
      }
    }

    let wEmb = '';
    let wRaw = '';
    let gmDirect1 = '';

    if (watchUrl && watchUrl.includes('greenmotors')) {
      const gm = await resolveGreenmotors(watchUrl);
      wEmb = gm.embedUrl;
      gmDirect1 = gm.directUrl;
      wRaw = gm.directUrl || gm.embedUrl;
    } else {
      wEmb = toEmbedLink(watchUrl);
      wRaw = watchUrl;
    }

    let p2Emb = '';
    let gmDirect2 = '';
    if (player2Url) {
      if (player2Url.includes('greenmotors')) {
        const gm2 = await resolveGreenmotors(player2Url);
        p2Emb = gm2.embedUrl;
        gmDirect2 = gm2.directUrl;
      } else {
        p2Emb = toEmbedLink(player2Url);
      }
    }

    let m3u8Url = '';
    if (options?.extractM3u8 && wEmb) {
      try {
        m3u8Url = (await extractDirectM3u8(wEmb)) || '';
      } catch {}
    }
    if (!m3u8Url && gmDirect1) {
      m3u8Url = gmDirect1;
    }

    let p2M3u8 = '';
    const finalP2 = p2Emb || toEmbedLink(player2Url);
    if (options?.extractM3u8 && finalP2) {
      try {
        p2M3u8 = (await extractDirectM3u8(finalP2)) || '';
      } catch {}
    }
    if (!p2M3u8 && gmDirect2) {
      p2M3u8 = gmDirect2;
    }

    return {
      type: 'movie',
      streams: {
        watch_embed: wEmb,
        watch_raw: wRaw,
        player_2: finalP2,
        m3u8_url: m3u8Url,
        player_2_m3u8_url: p2M3u8,
      },
    };
  }
}

export const scraperPipelineService = new ScraperPipelineService();
