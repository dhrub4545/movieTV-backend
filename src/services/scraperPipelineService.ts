import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Movie, Series } from '../db';
import { ContentService } from './contentService';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://new8.hdhub4u.cl/',
};

const DEFAULT_BASE_URL = 'https://new8.hdhub4u.cl';

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
    return c;
  });
}

async function resolveGreenmotors(url: string): Promise<{ embedUrl: string; directUrl: string }> {
  if (!url || !url.includes('greenmotors')) {
    return { embedUrl: url || '', directUrl: '' };
  }

  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 12000 });
    const match = res.data.match(/s\('o',\s*'([^']+)'/);
    if (!match) return { embedUrl: url, directUrl: '' };

    const b64 = match[1];
    const d1 = Buffer.from(b64, 'base64').toString('utf8');
    const d2 = Buffer.from(d1, 'base64').toString('utf8');
    const d3 = rot13(d2);
    const d4 = Buffer.from(d3, 'base64').toString('utf8');
    const data = JSON.parse(d4);
    const playerEmbedUrl = Buffer.from(data.o, 'base64').toString('utf8');

    const pRes = await axios.get(playerEmbedUrl, {
      headers: { ...HEADERS, Referer: 'https://greenmotors.cc/homelander/' },
      timeout: 12000,
    });
    const sMatch = pRes.data.match(/const\s+streamSrc\s*=\s*"([^"]+)"/);
    const directStreamUrl = sMatch ? sMatch[1] : '';

    return { embedUrl: playerEmbedUrl || url, directUrl: directStreamUrl };
  } catch {
    return { embedUrl: url, directUrl: '' };
  }
}

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

export interface ScraperStatus {
  isRunning: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  baseUrl: string;
  nextRunAt: string | null;
  totalNewMoviesAdded: number;
  totalNewSeriesAdded: number;
  totalEpisodesUpdated: number;
  lastRunResult: {
    scannedItems: number;
    newMovies: number;
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
  private totalEpisodesUpdated = 0;

  private lastRunResult: ScraperStatus['lastRunResult'] = null;
  private readonly INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(private contentService?: ContentService) {
    this.loadPersistedConfig();
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

  setBaseUrl(newUrl: string): { success: boolean; message: string; previousUrl: string; currentUrl: string } {
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

  getStatus(): ScraperStatus {
    return {
      baseUrl: this.baseUrl,
      isRunning: this.isRunning,
      intervalMinutes: 10,
      lastRunAt: this.lastRunAt?.toISOString() || null,
      nextRunAt: this.nextRunAt?.toISOString() || null,
      totalNewMoviesAdded: this.totalNewMoviesAdded,
      totalNewSeriesAdded: this.totalNewSeriesAdded,
      totalEpisodesUpdated: this.totalEpisodesUpdated,
      lastRunResult: this.lastRunResult,
    };
  }

  /**
   * Main pipeline execution:
   * 1. Fetches latest releases from page 1 and page 2.
   * 2. Checks MongoDB - SKIPS any movie or webseries already in DB.
   * 3. For series already in DB, checks if new episodes were uploaded and appends them.
   * 4. For new items, parses stream links & pushes to DB with createdAt/updatedAt = now (TOP OF FEED).
   */
  async runPipeline(): Promise<void> {
    if (this.isRunning) {
      console.log('⏳ Scraper pipeline is already running. Skipping overlapping execution.');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log('\n===============================================================');
    console.log(`🚀 [Scraper Pipeline] Starting 10-min scan at ${new Date().toISOString()}...`);

    let scannedCount = 0;
    let newMoviesCount = 0;
    let newSeriesCount = 0;
    let updatedEpisodesCount = 0;
    let skippedCount = 0;

    try {
      // Scan Page 1 and Page 2 (covers the newest 100+ releases)
      const pagesToScan = [
        `${this.baseUrl}/`,
        `${this.baseUrl}/page/2/`,
      ];

      const discoveredItems: Array<{
        pageUrl: string;
        posterUrl: string;
        fullTitle: string;
        displayName: string;
        isSeriesCandidate: boolean;
      }> = [];

      for (const pageUrl of pagesToScan) {
        try {
          const resp = await axios.get(pageUrl, { headers: HEADERS, timeout: 15000 });
          const html = resp.data;
          const items =
            html.match(/<li[^>]*class=["'][^"']*thumb[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi) || [];

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
      console.log(`[Scraper Pipeline] Found ${scannedCount} items from latest pages.`);

      // Process each discovered item
      for (const item of discoveredItems) {
        try {
          // 1. FAST DB CHECK: Check if item is already saved as a Movie
          const inMovie = await Movie.exists({
            $or: [{ movie_page_url: item.pageUrl }, { title: item.displayName }],
          });

          if (inMovie) {
            skippedCount++;
            continue; // Already in DB -> SKIP!
          }

          // 2. FAST DB CHECK: Check if item is already saved as a Series
          const existingSeries = await Series.findOne({
            $or: [{ movie_page_url: item.pageUrl }, { title: item.displayName }],
          });

          if (existingSeries) {
            // Check if post has new episodes (e.g. "[EP-06 Added]" or more episodes than in DB)
            const isEpisodeUpdate =
              /EP-?\d+\s*Added|Episode\s*\d+\s*Added/i.test(item.fullTitle) ||
              item.isSeriesCandidate;

            if (isEpisodeUpdate) {
              const detailHtml = await this.fetchDetailPage(item.pageUrl);
              if (detailHtml) {
                const parsed = await this.parseMovieOrSeries(detailHtml, item.displayName);
                if (parsed.type === 'series' && parsed.seasons) {
                  const addedCount = this.mergeNewEpisodes(existingSeries, parsed.seasons);
                  if (addedCount > 0) {
                    existingSeries.updatedAt = new Date(); // Push to TOP of series!
                    await existingSeries.save();
                    updatedEpisodesCount += addedCount;
                    console.log(
                      `✨ [UPDATED SERIES] ${existingSeries.title}: Added ${addedCount} new episode(s) -> Pushed to TOP!`,
                    );
                    continue;
                  }
                }
              }
            }

            skippedCount++;
            continue; // Already up to date -> SKIP!
          }

          // 3. BRAND NEW ITEM NOT IN DB: Fetch details and insert!
          const detailHtml = await this.fetchDetailPage(item.pageUrl);
          if (!detailHtml) {
            skippedCount++;
            continue;
          }

          const parsed = await this.parseMovieOrSeries(detailHtml, item.displayName);

          if (parsed.type === 'series' && parsed.seasons && parsed.seasons.length > 0) {
            // Create new Series
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
            newSeriesCount++;
            this.totalNewSeriesAdded++;
            console.log(
              `🔥 [NEW WEBSERIES ADDED] ${item.displayName} (${parsed.seasons.length} Season(s)) -> Pushed to TOP!`,
            );
          } else {
            // Create new Movie
            const newMovieDoc = new Movie({
              id: `movie_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              title: item.displayName,
              full_title: item.fullTitle,
              type: 'movie',
              poster_url: item.posterUrl,
              movie_page_url: item.pageUrl,
              streams: parsed.streams || {},
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            await newMovieDoc.save();
            newMoviesCount++;
            this.totalNewMoviesAdded++;
            console.log(`🎬 [NEW MOVIE ADDED] ${item.displayName} -> Pushed to TOP!`);
          }
        } catch (itemErr: any) {
          console.warn(`[Scraper Pipeline] Error processing "${item.displayName}":`, itemErr.message);
        }
      }

      // If new movies/series or new episodes were added, clear cache so app sees them immediately
      if (newMoviesCount > 0 || newSeriesCount > 0 || updatedEpisodesCount > 0) {
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
        newSeries: newSeriesCount,
        updatedSeriesEpisodes: updatedEpisodesCount,
        skippedExisting: skippedCount,
        durationMs,
      };

      console.log('---------------------------------------------------------------');
      console.log(
        `✅ [Scraper Pipeline] Completed in ${(durationMs / 1000).toFixed(1)}s: ` +
          `Scanned: ${scannedCount} | Skipped: ${skippedCount} | ` +
          `New Movies: ${newMoviesCount} | New Series: ${newSeriesCount} | Updated Episodes: ${updatedEpisodesCount}`,
      );
      console.log(`⏰ Next scheduled run at: ${this.nextRunAt.toISOString()}`);
      console.log('===============================================================\n');
    }
  }

  private async fetchDetailPage(url: string): Promise<string | null> {
    try {
      const resp = await axios.get(url, { headers: HEADERS, timeout: 12000 });
      return resp.data;
    } catch {
      return null;
    }
  }

  private mergeNewEpisodes(existingSeries: any, newSeasons: any[]): number {
    let addedCount = 0;
    if (!existingSeries.seasons) {
      existingSeries.seasons = [];
    }

    for (const newS of newSeasons) {
      let existingS = existingSeries.seasons.find(
        (s: any) => s.season_name?.toLowerCase() === newS.season_name?.toLowerCase(),
      );

      if (!existingS) {
        existingSeries.seasons.push(newS);
        addedCount += (newS.episodes || []).length;
        continue;
      }

      for (const newEp of newS.episodes || []) {
        const epExists = (existingS.episodes || []).some(
          (e: any) => e.episode?.toLowerCase() === newEp.episode?.toLowerCase(),
        );

        if (!epExists) {
          existingS.episodes.push(newEp);
          existingS.total_episodes = existingS.episodes.length;
          addedCount++;
        }
      }
    }

    return addedCount;
  }

  private async parseMovieOrSeries(
    html: string,
    title: string,
  ): Promise<{
    type: 'movie' | 'series';
    streams?: { watch_embed: string; watch_raw: string; player_2: string };
    seasons?: Array<{
      season_name: string;
      total_episodes: number;
      episodes: Array<{
        episode: string;
        watch_1_embed: string;
        watch_1_raw: string;
        watch_2: string;
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

          if (currentEpWatch1.includes('greenmotors')) {
            const gm = await resolveGreenmotors(currentEpWatch1);
            w1Emb = gm.embedUrl;
            w1Raw = gm.directUrl || gm.embedUrl;
          } else {
            w1Emb = toEmbedLink(currentEpWatch1);
            w1Raw = currentEpWatch1;
          }

          seasonsMap[currentSeason].push({
            episode: currentEpLabel,
            watch_1_embed: w1Emb,
            watch_1_raw: w1Raw,
            watch_2: currentEpWatch2,
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
            linkText.includes('WATCH-1') ||
            linkText === 'WATCH' ||
            linkText.includes('PLAYER 1') ||
            linkText.includes('PLAYER-1')
          ) {
            if (!currentEpWatch1) currentEpWatch1 = href;
          } else if (
            linkText === '2' ||
            linkText.includes('PLAYER-2') ||
            linkText.includes('PLAYER 2') ||
            linkText.includes('WATCH-2')
          ) {
            if (!currentEpWatch2) currentEpWatch2 = href;
          } else if (
            !currentEpWatch1 &&
            ['hdstream4u', 'vidaraa', 'hubstream', 'greenmotors'].some((d) => href.includes(d))
          ) {
            currentEpWatch1 = href;
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

    const pairMatch = postBody.match(
      /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:<span[^>]*>)?WATCH(?:<\/span>)?<\/a>\s*(?:[|•\s]+)\s*<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:<span[^>]*>)?PLAYER-?2(?:<\/span>)?<\/a>/i,
    );

    if (pairMatch) {
      watchUrl = pairMatch[1].trim();
      player2Url = pairMatch[2].trim();
    } else {
      const wMatch = postBody.match(
        /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:<span[^>]*>)?WATCH(?:\s*Online)?(?:<\/span>)?<\/a>/i,
      );
      if (wMatch) watchUrl = wMatch[1].trim();

      const p2Match = postBody.match(
        /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(?:<span[^>]*>)?PLAYER-?2(?:<\/span>)?<\/a>/i,
      );
      if (p2Match) player2Url = p2Match[1].trim();
    }

    if (!watchUrl) {
      const allLinks = Array.from(
        postBody.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi),
      ).map((m) => m[1]);
      for (const h of allLinks) {
        if (
          ['hdstream4u.com', 'hubstream.art', 'vidaraa.cc', 'greenmotors.club'].some((d) =>
            h.includes(d),
          )
        ) {
          watchUrl = h;
          break;
        }
      }
    }

    let wEmb = '';
    let wRaw = '';

    if (watchUrl && watchUrl.includes('greenmotors')) {
      const gm = await resolveGreenmotors(watchUrl);
      wEmb = gm.embedUrl;
      wRaw = gm.directUrl || gm.embedUrl;
    } else {
      wEmb = toEmbedLink(watchUrl);
      wRaw = watchUrl;
    }

    return {
      type: 'movie',
      streams: {
        watch_embed: wEmb,
        watch_raw: wRaw,
        player_2: player2Url,
      },
    };
  }
}

export const scraperPipelineService = new ScraperPipelineService();
