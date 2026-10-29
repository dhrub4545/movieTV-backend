import axios from 'axios';
import mongoose from 'mongoose';
import { Movie, Series } from '../db';
import { StreamResolveResponse, StreamSource, SubtitleTrack } from '../types';
import { extractDirectM3u8, unpackDeanEdwards } from './m3u8Extractor';
import { scraperPipelineService } from './scraperPipelineService';
import { resolveGreenmotors } from './greenmotorsResolver';

export { extractDirectM3u8, unpackDeanEdwards, resolveGreenmotors };

/**
 * Checks if a stream URL is reachable and does not return HTTP 403 Forbidden.
 */
export function getHeadersForStreamUrl(url: string): Record<string, string> {
  if (!url) return {};
  if (url.includes('hubstream') || url.includes('skyline') || url.includes('greenstream') || url.includes('94.131.217')) {
    return {
      Referer: 'https://hubstream.art/',
      Origin: 'https://hubstream.art',
    };
  }
  if (url.includes('vidaraa') || url.includes('97bf1.com') || url.includes('s1q2105.com')) {
    return {
      Referer: 'https://vidaraa.cc/',
      Origin: 'https://vidaraa.cc',
    };
  }
  if (url.includes('multidownload') || url.includes('multicloudlinks')) {
    return {
      Referer: 'https://new.multicloudlinks.com/',
      Origin: 'https://new.multicloudlinks.com',
    };
  }
  return {
    Referer: 'https://hdstream4u.com/',
    Origin: 'https://hdstream4u.com',
  };
}

export async function isStreamUrlAlive(url: string, timeoutMs: number = 3000): Promise<boolean> {
  if (!url || typeof url !== 'string') return false;
  if (!isM3u8TokenValid(url)) return false;

  if (url.includes('.m3u8')) {
    try {
      const headers = getHeadersForStreamUrl(url);
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...headers,
        },
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      return resp.status === 200;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Checks if a direct .m3u8 or streaming URL has an expired token.
 * Accurately calculates expiration for:
 * - HDStream4u acek-cdn / dramiyos-cdn: s=<start_time_sec> & e=<duration_sec> -> expires at (s + e)
 * - Hubstream: kx=<timestamp_sec>
 * - multidownload / multicloudlinks: exp=<timestamp_sec>
 * - Vidaraa: token=...-<timestamp_sec>-...
 */
export function isM3u8TokenValid(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.includes('&asn=&') || url.endsWith('&asn=')) return false;
  const nowSec = Math.floor(Date.now() / 1000);

  // HDStream4u acek-cdn / dramiyos-cdn: s=<start_sec>&e=<duration_sec>
  const matchS = url.match(/[?&]s=(\d+)/);
  const matchE = url.match(/[?&]e=(\d+)/);
  if (matchS && matchE) {
    const expiresAt = parseInt(matchS[1], 10) + parseInt(matchE[1], 10);
    return expiresAt > nowSec + 180;
  }

  // Hubstream: kx=<timestamp>
  const matchKx = url.match(/[?&]kx=(\d+)/);
  if (matchKx) {
    const kx = parseInt(matchKx[1], 10);
    return kx > nowSec + 120;
  }

  // multidownload / multicloudlinks: exp=<timestamp>
  const matchExp = url.match(/[?&]exp=(\d+)/);
  if (matchExp) {
    const exp = parseInt(matchExp[1], 10);
    return exp > nowSec + 120;
  }

  // Vidaraa: token=...-<timestamp>-...
  const matchVidaraa = url.match(/[?&]token=[a-f0-9]+-(\d+)-/i);
  if (matchVidaraa) {
    const exp = parseInt(matchVidaraa[1], 10);
    return exp > nowSec + 120;
  }

  return true;
}

/**
 * Saves an extracted permanent direct .m3u8 link into MongoDB database for Movie or Series episode
 * Specifically for Server 1 (watch_embed -> streams.m3u8_url).
 * Player 2 links are dynamic live links and are NOT persisted to the database.
 */
export async function saveDirectM3u8(params: {
  id?: string;
  title?: string;
  type?: 'movie' | 'tv' | 'series';
  season?: number;
  episode?: number | string;
  m3u8Url: string;
  player?: 1 | 2;
}): Promise<boolean> {
  const { id, title, type = 'movie', season = 1, episode = 1, m3u8Url, player = 1 } = params;
  if (!m3u8Url || typeof m3u8Url !== 'string') return false;

  // Player 2 uses dynamic live M3U8 on-the-fly and is never stored in DB
  if (player === 2) {
    return true;
  }

  // Reject URLs with empty asn= parameter or broken tokens
  if (m3u8Url.includes('&asn=&') || m3u8Url.endsWith('&asn=')) {
    console.warn(`[StreamResolver] Rejecting save for M3U8 with empty asn: ${m3u8Url}`);
    return false;
  }

  try {
    const cleanUrl = m3u8Url.trim();

    if (type === 'movie' || (!type && !season && !episode)) {
      const orList: any[] = [];
      if (id) {
        orList.push({ id: String(id) });
        if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
          orList.push({ _id: new mongoose.Types.ObjectId(id) });
        }
      }
      if (title) {
        const clean = title.replace(/\(\d{4}\)/g, '').trim();
        orList.push({ title: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
        orList.push({ title: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
      }
      if (orList.length > 0) {
        const query = { $or: orList };
        const res = await Movie.updateOne(
          query,
          { $set: { 'streams.m3u8_url': cleanUrl } },
          { timestamps: false }
        );
        console.log(`💾 Saved permanent M3U8 for watch_embed in DB: ${title || id} -> ${cleanUrl}`);
        return res.modifiedCount > 0 || res.matchedCount > 0;
      }
    } else {
      const orList: any[] = [];
      if (id) {
        orList.push({ id: String(id) });
        if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
          orList.push({ _id: new mongoose.Types.ObjectId(id) });
        }
      }
      if (title) {
        const clean = title.replace(/\(\d{4}\)/g, '').trim();
        orList.push({ title: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
        orList.push({ title: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
      }
      if (orList.length > 0) {
        const sQuery = { $or: orList };
        const sDoc = await Series.findOne(sQuery);
        if (sDoc && sDoc.seasons && sDoc.seasons.length > 0) {
          const sIdx = Math.max(0, season - 1);
          const targetSeason = sDoc.seasons[sIdx] || sDoc.seasons[0];
          if (targetSeason && targetSeason.episodes) {
            let targetEp: any = null;
            if (typeof episode === 'number') {
              const epIdx = Math.max(0, episode - 1);
              targetEp = targetSeason.episodes[epIdx];
            } else if (typeof episode === 'string') {
              targetEp = targetSeason.episodes.find((e: any) =>
                e.episode.toLowerCase().includes(episode.toLowerCase()),
              );
            }
            if (!targetEp && targetSeason.episodes.length > 0) {
              targetEp = targetSeason.episodes[0];
            }
            if (targetEp) {
              targetEp.m3u8_url = cleanUrl;
              await Series.updateOne(
                { _id: sDoc._id },
                { $set: { seasons: sDoc.seasons } },
                { timestamps: false },
              );
              console.log(
                `💾 Saved permanent M3U8 for Series episode in DB: ${sDoc.title} S${season}:E${episode} -> ${cleanUrl}`,
              );
              return true;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`Failed to save permanent M3U8 to DB:`, err.message);
  }
  return false;
}

export class StreamResolverService {
  // In-memory cache for resolved stream responses (TTL: 10 minutes)
  private cache = new Map<string, { data: StreamResolveResponse; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000;

  async saveDirectM3u8(params: {
    id?: string;
    title?: string;
    type?: 'movie' | 'tv' | 'series';
    season?: number;
    episode?: number | string;
    m3u8Url: string;
    player?: 1 | 2;
  }): Promise<boolean> {
    return saveDirectM3u8(params);
  }

  /**
   * Resolves playable stream options for a given movie / series from MongoDB Atlas:
   * - Server 1 (Primary Stream): Permanent direct .m3u8 extracted from watch_embed and saved in MongoDB.
   * - Server 2 (Alternate Player): Always extracts a fresh LIVE .m3u8 on-the-fly from player_2 (not stored in DB).
   */
  async resolveStream(params: {
    id?: string;
    title?: string;
    type?: 'movie' | 'tv';
    season?: number;
    episode?: number;
    forceRefresh?: boolean;
  }): Promise<StreamResolveResponse> {
    const { id, title, type = 'movie', season = 1, episode = 1, forceRefresh = false } = params;
    const cacheKey = `${id || ''}-${title || ''}-${type}-${season}-${episode}`;

    const isDirectStream = (url: string) => {
      if (!url) return false;
      return (
        url.includes('.m3u8') ||
        url.includes('action=watch') ||
        url.includes('multidownload') ||
        url.endsWith('.mp4') ||
        url.endsWith('.mkv')
      );
    };

    // Check in-memory cache if not force refreshing
    if (!forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        const p1Source = cached.data.sources.find((s) => s.quality.includes('Server 1'));
        const p2Source = cached.data.sources.find((s) => s.quality.includes('Server 2'));
        const p1Valid = !p1Source || !p1Source.url || !isDirectStream(p1Source.url) || isM3u8TokenValid(p1Source.url);
        const p2Valid = !p2Source || !p2Source.url || !isDirectStream(p2Source.url) || isM3u8TokenValid(p2Source.url);
        if (p1Valid && p2Valid) {
          return cached.data;
        }
      }
    }

    let targetTitle = title || 'Stream';
    let streams: any = null;
    let livePlayer2M3u8: string | null = null;

    // 1. Try finding in MongoDB (handle both ObjectId and string ID)
    try {
      if (type === 'movie' || !type) {
        let doc = null;
        if (id) {
          const query: any = mongoose.Types.ObjectId.isValid(id)
            ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { id }] }
            : { id };
          doc = await Movie.findOne(query).select('id _id title streams full_title movie_page_url').lean();
        }
        if (!doc && title) {
          const clean = title.replace(/\(\d{4}\)/g, '').trim();
          doc = await Movie.findOne({
            $or: [
              { title: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
              { title: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
              { full_title: new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            ],
          })
            .select('id _id title streams full_title movie_page_url')
            .lean();
        }
        if (doc) {
          targetTitle = doc.title;
          streams = {
            watch_embed: doc.streams?.watch_embed || '',
            player_2: doc.streams?.player_2 || '',
            m3u8_url: doc.streams?.m3u8_url || '',
          };

          const docId = (doc as any).id || (doc as any)._id?.toString();
          const moviePageUrl = (doc as any).movie_page_url || '';

          // On-the-fly self healing: if direct stream is missing or watch_embed points to hblinks download aggregator
          const needsHealing =
            !isDirectStream(streams.m3u8_url) &&
            (!streams.watch_embed ||
              streams.watch_embed.includes('hblinks') ||
              streams.watch_embed.includes('/archives/') ||
              !streams.watch_embed.startsWith('http'));

          if (needsHealing && moviePageUrl) {
            try {
              console.log(`[StreamResolver] Auto-healing missing stream for "${doc.title}" via: ${moviePageUrl}`);
              const detailHtml = await scraperPipelineService.fetchDetailPage(moviePageUrl);
              if (detailHtml) {
                const parsed = await scraperPipelineService.parseMovieOrSeries(detailHtml, doc.title);
                if (parsed && parsed.streams) {
                  streams = {
                    watch_embed: parsed.streams.watch_embed || streams.watch_embed,
                    watch_raw: parsed.streams.watch_raw || streams.watch_raw,
                    player_2: parsed.streams.player_2 || streams.player_2,
                    m3u8_url: parsed.streams.m3u8_url || streams.m3u8_url,
                  };
                  await Movie.updateOne(
                    { _id: (doc as any)._id },
                    { $set: { streams } },
                    { timestamps: false },
                  );
                  console.log(`[StreamResolver] Auto-healing succeeded for: ${doc.title}`);
                }
              }
            } catch (healErr: any) {
              console.warn(`[StreamResolver] Auto-healing error for ${doc.title}:`, healErr.message);
            }
          }

          // Resolve greenmotors directly if present in watch_embed
          if (streams.watch_embed && streams.watch_embed.includes('greenmotors')) {
            try {
              const gm = await resolveGreenmotors(streams.watch_embed);
              streams.watch_embed = gm.embedUrl;
              if (gm.directUrl) {
                streams.m3u8_url = gm.directUrl;
                streams.watch_raw = gm.directUrl;
              }
            } catch {}
          }

          // SERVER 1: Permanent M3U8 from watch_embed
          // Check if stream needs re-extraction:
          // 1) forceRefresh requested
          // 2) Not in DB or not direct
          // 3) Token expired (s + e, kx, exp)
          // 4) Probing stream returns HTTP 403 or failure
          let m3u8NeedsExtraction =
            forceRefresh ||
            !streams.m3u8_url ||
            !isDirectStream(streams.m3u8_url) ||
            !isM3u8TokenValid(streams.m3u8_url);

          if (!m3u8NeedsExtraction && streams.m3u8_url) {
            const alive = await isStreamUrlAlive(streams.m3u8_url, 1500);
            if (!alive) {
              console.log(`[StreamResolver] Stored M3U8 failed health check (HTTP 403/down). Invalidation triggered for: ${doc.title}`);
              m3u8NeedsExtraction = true;
            }
          }

          if (m3u8NeedsExtraction && streams.watch_embed && streams.watch_embed !== '#' && streams.watch_embed.startsWith('http')) {
            try {
              const directM3u8 = await extractDirectM3u8(streams.watch_embed);
              if (directM3u8) {
                streams.m3u8_url = directM3u8;
                await saveDirectM3u8({
                  id: docId,
                  title: doc.title,
                  type: 'movie',
                  player: 1,
                  m3u8Url: directM3u8,
                });
              }
            } catch (extErr: any) {
              console.warn('On-the-fly Player 1 M3U8 extraction error:', extErr.message);
            }
          }

          // SERVER 2: Live .m3u8 extraction on-the-fly (NEVER saved to DB)
          if (streams.player_2 && streams.player_2 !== '#') {
            try {
              livePlayer2M3u8 = await extractDirectM3u8(streams.player_2);
            } catch (extErr: any) {
              console.warn('On-the-fly Player 2 live extraction error:', extErr.message);
            }
          }
        }
      } else {
        let sDoc = null;
        if (id) {
          const query: any = mongoose.Types.ObjectId.isValid(id)
            ? { $or: [{ _id: new mongoose.Types.ObjectId(id) }, { id }] }
            : { id };
          sDoc = await Series.findOne(query).select('id _id title seasons movie_page_url').lean();
        }
        if (!sDoc && title) {
          const clean = title.replace(/\(\d{4}\)/g, '').trim();
          sDoc = await Series.findOne({
            $or: [
              { title: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
              { title: new RegExp('^' + clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            ],
          })
            .select('id _id title seasons movie_page_url')
            .lean();
        }
        if (sDoc && sDoc.seasons && sDoc.seasons.length > 0) {
          targetTitle = sDoc.title;
          const sIdx = Math.max(0, season - 1);
          const targetSeason = sDoc.seasons[sIdx] || sDoc.seasons[0];
          const epIdx = Math.max(0, episode - 1);
          const ep = targetSeason.episodes[epIdx] || targetSeason.episodes[0];
          if (ep) {
            streams = {
              watch_embed: ep.watch_1_embed || '',
              player_2: ep.watch_2 || '',
              m3u8_url: ep.m3u8_url || '',
            };

            const sDocId = (sDoc as any).id || (sDoc as any)._id?.toString();

            // SERVER 1 for Series: Extract permanent M3U8 from watch_1_embed and save to DB
            let epM3u8NeedsExtraction =
              forceRefresh ||
              !streams.m3u8_url ||
              !isDirectStream(streams.m3u8_url) ||
              !isM3u8TokenValid(streams.m3u8_url);

            if (!epM3u8NeedsExtraction && streams.m3u8_url) {
              const alive = await isStreamUrlAlive(streams.m3u8_url, 1500);
              if (!alive) {
                console.log(`[StreamResolver] Episode M3U8 failed health check (HTTP 403). Invalidation triggered for: ${sDoc.title}`);
                epM3u8NeedsExtraction = true;
              }
            }

            if (epM3u8NeedsExtraction && streams.watch_embed && streams.watch_embed !== '#' && streams.watch_embed.startsWith('http')) {
              try {
                const directM3u8 = await extractDirectM3u8(streams.watch_embed);
                if (directM3u8) {
                  streams.m3u8_url = directM3u8;
                  await saveDirectM3u8({
                    id: sDocId,
                    title: sDoc.title,
                    type: 'series',
                    season,
                    episode,
                    player: 1,
                    m3u8Url: directM3u8,
                  });
                }
              } catch (extErr: any) {
                console.warn('On-the-fly Player 1 M3U8 extraction error for episode:', extErr.message);
              }
            }

            // SERVER 2 for Series: Live M3U8 extraction on-the-fly (NOT saved to DB)
            if (streams.player_2 && streams.player_2 !== '#') {
              try {
                livePlayer2M3u8 = await extractDirectM3u8(streams.player_2);
              } catch (extErr: any) {
                console.warn('On-the-fly Player 2 live extraction error for episode:', extErr.message);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('DB lookup failed in resolver:', err.message);
    }

    const sources: StreamSource[] = [];

    const normalizeStreamUrl = (url: string): string => {
      if (!url) return '';
      url = url.trim();
      if (url.includes('hdstream4u.com/file/')) return url.replace('/file/', '/embed/');
      if (url.includes('/file/')) return url.replace('/file/', '/embed/');
      return url;
    };

    const isLinkValid = (url: string) => {
      return url.length > 0 && !url.includes('/file/') && (url.startsWith('http') || url.startsWith('//') || url.includes('#'));
    };

    // SERVER 1 (Primary Stream):
    // Use the permanent direct .m3u8 saved in the DB
    if (streams && streams.m3u8_url && isDirectStream(streams.m3u8_url) && isM3u8TokenValid(streams.m3u8_url)) {
      const isHls = streams.m3u8_url.includes('.m3u8');
      sources.push({
        quality: isHls ? '🎬 Server 1: Primary Stream (Direct HLS)' : '🎬 Server 1: Primary Stream (Direct Fast Stream)',
        url: streams.m3u8_url.trim(),
        format: isHls ? 'hls' : 'mp4',
        headers: getHeadersForStreamUrl(streams.m3u8_url),
      });
    } else if (streams && streams.watch_embed) {
      const normW1 = normalizeStreamUrl(streams.watch_embed);
      if (isLinkValid(normW1)) {
        const isDirect = isDirectStream(normW1);
        sources.push({
          quality: '🎬 Server 1: Primary Stream',
          url: normW1,
          format: normW1.includes('.m3u8') ? 'hls' : isDirect ? 'mp4' : 'embed',
          headers: getHeadersForStreamUrl(normW1),
        });
      }
    }

    // SERVER 2 (Alternate Player):
    // Use the fresh live .m3u8 extracted dynamically on-the-fly!
    if (livePlayer2M3u8 && isDirectStream(livePlayer2M3u8)) {
      const isHls = livePlayer2M3u8.includes('.m3u8');
      sources.push({
        quality: isHls ? '🍿 Server 2: Alternate Player (Live HLS)' : '🍿 Server 2: Alternate Player (Live Stream)',
        url: livePlayer2M3u8.trim(),
        format: isHls ? 'hls' : 'mp4',
        headers: getHeadersForStreamUrl(livePlayer2M3u8),
      });
    } else if (streams && streams.player_2) {
      const normP2 = normalizeStreamUrl(streams.player_2);
      if (isLinkValid(normP2)) {
        sources.push({
          quality: '🍿 Server 2: Alternate Player',
          url: normP2,
          format: 'embed',
          headers: getHeadersForStreamUrl(normP2),
        });
      }
    }

    // SERVER 3 (Player 3 - Web Stream from watch_embed):
    // Plays the watch_embed stream link directly instead of the .m3u8 link
    if (streams && streams.watch_embed) {
      const normW1 = normalizeStreamUrl(streams.watch_embed);
      if (isLinkValid(normW1)) {
        sources.push({
          quality: '🌐 Server 3: Web Stream (Watch Embed)',
          url: normW1,
          format: 'embed',
          headers: getHeadersForStreamUrl(normW1),
        });
      }
    }

    // Fallback if DB had 0 links
    if (sources.length === 0) {
      sources.push({
        quality: '🎬 Server 1: Primary Stream',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        format: 'hls',
      });
    }

    const subtitles: SubtitleTrack[] = [
      {
        language: 'en',
        label: 'English [CC]',
        url: 'https://bitdash-a.akamaihd.net/content/sintel/subtitles/subtitles_en.vtt',
      },
      {
        language: 'hi',
        label: 'Hindi [Sub]',
        url: 'https://bitdash-a.akamaihd.net/content/sintel/subtitles/subtitles_en.vtt',
      },
    ];

    const result: StreamResolveResponse = {
      title: targetTitle,
      type,
      sources,
      m3u8_url: streams && streams.m3u8_url && isDirectStream(streams.m3u8_url) ? streams.m3u8_url.trim() : undefined,
      player_2_m3u8_url: livePlayer2M3u8 && isDirectStream(livePlayer2M3u8) ? livePlayer2M3u8.trim() : undefined,
      watch_embed_url: streams && streams.watch_embed ? normalizeStreamUrl(streams.watch_embed) : undefined,
      subtitles,
    };

    this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const streamResolverService = new StreamResolverService();
