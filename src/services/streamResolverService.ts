import mongoose from 'mongoose';
import { Movie, Series } from '../db';
import { StreamResolveResponse, StreamSource, SubtitleTrack } from '../types';
import { extractDirectM3u8, unpackDeanEdwards } from './m3u8Extractor';
import { scraperPipelineService } from './scraperPipelineService';
import { resolveGreenmotors } from './greenmotorsResolver';

export { extractDirectM3u8, unpackDeanEdwards, resolveGreenmotors };

/**
 * Saves an extracted direct .m3u8 link into the MongoDB database for Movie or Series episode
 * Supports both Player 1 (m3u8_url) and Player 2 (player_2_m3u8_url) separately!
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

  try {
    const cleanUrl = m3u8Url.trim();
    const fieldName = player === 2 ? 'streams.player_2_m3u8_url' : 'streams.m3u8_url';

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
        const updateObj: any = {};
        updateObj[fieldName] = cleanUrl;
        const res = await Movie.updateOne(query, { $set: updateObj }, { timestamps: false });
        console.log(`💾 Saved Player ${player} direct M3U8 to Movie in DB: ${title || id} -> ${cleanUrl}`);
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
              if (player === 2) {
                targetEp.player_2_m3u8_url = cleanUrl;
              } else {
                targetEp.m3u8_url = cleanUrl;
              }
              await Series.updateOne(
                { _id: sDoc._id },
                { $set: { seasons: sDoc.seasons } },
                { timestamps: false },
              );
              console.log(
                `💾 Saved Player ${player} direct M3U8 to Series episode in DB: ${sDoc.title} S${season}:E${episode} -> ${cleanUrl}`,
              );
              return true;
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`Failed to save direct M3U8 for Player ${player} to DB:`, err.message);
  }
  return false;
}

export class StreamResolverService {
  // In-memory cache for resolved stream responses (TTL: 30 minutes)
  private cache = new Map<string, { data: StreamResolveResponse; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000;

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
   * Resolves playable stream options for a given movie / series from MongoDB Atlas.
   * Extracts and saves 2 direct .m3u8 links in the database:
   * - Player 1 direct M3U8 (from Server 1 / watch_embed)
   * - Player 2 direct M3U8 (from Server 2 / player_2)
   * Both are preserved and returned cleanly for instant direct streaming!
   */
  async resolveStream(params: {
    id?: string;
    title?: string;
    type?: 'movie' | 'tv';
    season?: number;
    episode?: number;
  }): Promise<StreamResolveResponse> {
    const { id, title, type = 'movie', season = 1, episode = 1 } = params;
    const cacheKey = `${id || ''}-${title || ''}-${type}-${season}-${episode}`;

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let targetTitle = title || 'Stream';
    let streams: any = null;

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
            player_2_m3u8_url: doc.streams?.player_2_m3u8_url || '',
          };

          const docId = (doc as any).id || (doc as any)._id?.toString();
          const moviePageUrl = (doc as any).movie_page_url || '';

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
                    player_2_m3u8_url: parsed.streams.player_2_m3u8_url || streams.player_2_m3u8_url,
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

          // Resolve greenmotors directly if present in player_2
          if (streams.player_2 && streams.player_2.includes('greenmotors')) {
            try {
              const gm2 = await resolveGreenmotors(streams.player_2);
              streams.player_2 = gm2.embedUrl;
              if (gm2.directUrl) {
                streams.player_2_m3u8_url = gm2.directUrl;
              }
            } catch {}
          }

          // If Player 1 direct stream / .m3u8 is not yet stored, extract it from watch_embed and save to DB!
          if (!streams.m3u8_url && streams.watch_embed) {
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

          // If Player 2 direct stream / .m3u8 is not yet stored, extract it from player_2 and save to DB!
          if (!streams.player_2_m3u8_url && streams.player_2) {
            try {
              const p2M3u8 = await extractDirectM3u8(streams.player_2);
              if (p2M3u8) {
                streams.player_2_m3u8_url = p2M3u8;
                await saveDirectM3u8({
                  id: docId,
                  title: doc.title,
                  type: 'movie',
                  player: 2,
                  m3u8Url: p2M3u8,
                });
              }
            } catch (extErr: any) {
              console.warn('On-the-fly Player 2 M3U8 extraction error:', extErr.message);
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
              player_2_m3u8_url: ep.player_2_m3u8_url || '',
            };

            const sDocId = (sDoc as any).id || (sDoc as any)._id?.toString();

            // If Player 1 .m3u8 is not yet stored, extract it from watch_1_embed and save to DB!
            if (!streams.m3u8_url && streams.watch_embed) {
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

            // If Player 2 .m3u8 is not yet stored, extract it from watch_2 and save to DB!
            if (!streams.player_2_m3u8_url && streams.player_2) {
              try {
                const p2M3u8 = await extractDirectM3u8(streams.player_2);
                if (p2M3u8) {
                  streams.player_2_m3u8_url = p2M3u8;
                  await saveDirectM3u8({
                    id: sDocId,
                    title: sDoc.title,
                    type: 'series',
                    season,
                    episode,
                    player: 2,
                    m3u8Url: p2M3u8,
                  });
                }
              } catch (extErr: any) {
                console.warn('On-the-fly Player 2 M3U8 extraction error for episode:', extErr.message);
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
      return url.length > 0 && !url.includes('/file/') && url.startsWith('http');
    };

    const isM3u8TokenValid = (url: string) => {
      if (!url) return false;
      const match = url.match(/[?&]kx=(\d+)/);
      if (!match) return true;
      const kx = parseInt(match[1], 10);
      const nowSec = Math.floor(Date.now() / 1000);
      return kx > nowSec + 180;
    };

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

    // SERVER 1 (Primary Stream):
    // Use the direct .m3u8 or fast progressive direct stream link from the DB
    if (streams && streams.m3u8_url && isDirectStream(streams.m3u8_url)) {
      const isHls = streams.m3u8_url.includes('.m3u8');
      const isMulti = streams.m3u8_url.includes('multidownload') || streams.m3u8_url.includes('multicloudlinks');
      sources.push({
        quality: isHls ? '🎬 Server 1: Primary Stream (Direct HLS)' : '🎬 Server 1: Primary Stream (Direct Fast Stream)',
        url: streams.m3u8_url.trim(),
        format: isHls ? 'hls' : 'mp4',
        headers: isMulti
          ? {
              Referer: 'https://new.multicloudlinks.com/',
              Origin: 'https://new.multicloudlinks.com',
            }
          : {
              Referer: 'https://hdstream4u.com/',
              Origin: 'https://hdstream4u.com',
            },
      });
    }

    // SERVER 2 (Alternate Player):
    // Use the direct .m3u8 link from the DB if its token is valid; otherwise extract fresh live m3u8 on-the-fly!
    if (streams && streams.player_2_m3u8_url && isDirectStream(streams.player_2_m3u8_url) && isM3u8TokenValid(streams.player_2_m3u8_url)) {
      const isHls = streams.player_2_m3u8_url.includes('.m3u8');
      const isMulti = streams.player_2_m3u8_url.includes('multidownload') || streams.player_2_m3u8_url.includes('multicloudlinks');
      sources.push({
        quality: isHls ? '🍿 Server 2: Alternate Player (Direct HLS)' : '🍿 Server 2: Alternate Player (Direct Fast Stream)',
        url: streams.player_2_m3u8_url.trim(),
        format: isHls ? 'hls' : 'mp4',
        headers: isMulti
          ? {
              Referer: 'https://new.multicloudlinks.com/',
              Origin: 'https://new.multicloudlinks.com',
            }
          : {
              Referer: 'https://hubstream.art/',
              Origin: 'https://hubstream.art',
            },
      });
    } else if (streams && streams.player_2) {
      let freshP2: string | null = null;
      try {
        freshP2 = await extractDirectM3u8(streams.player_2);
        if (freshP2) {
          streams.player_2_m3u8_url = freshP2;
        }
      } catch {}

      if (freshP2 && isDirectStream(freshP2)) {
        const isHls = freshP2.includes('.m3u8');
        const isMulti = freshP2.includes('multidownload') || freshP2.includes('multicloudlinks');
        sources.push({
          quality: isHls ? '🍿 Server 2: Alternate Player (Direct HLS)' : '🍿 Server 2: Alternate Player (Direct Fast Stream)',
          url: freshP2.trim(),
          format: isHls ? 'hls' : 'mp4',
          headers: isMulti
            ? {
                Referer: 'https://new.multicloudlinks.com/',
                Origin: 'https://new.multicloudlinks.com',
              }
            : {
                Referer: 'https://hubstream.art/',
                Origin: 'https://hubstream.art',
              },
        });
      } else {
        const normP2 = normalizeStreamUrl(streams.player_2);
        if (isLinkValid(normP2)) {
          sources.push({
            quality: '🍿 Server 2: Alternate Player',
            url: normP2,
            format: 'embed',
            headers: {
              Referer: 'https://hubstream.art/',
              Origin: 'https://hubstream.art',
            },
          });
        }
      }
    }

    // If Server 1 was not added yet, fallback to raw embed stream link
    if (!sources.some((s) => s.quality.includes('Server 1'))) {
      if (streams && streams.watch_embed) {
        const normW1 = normalizeStreamUrl(streams.watch_embed);
        if (isLinkValid(normW1)) {
          const isDirect = isDirectStream(normW1);
          sources.unshift({
            quality: '🎬 Server 1: Primary Stream',
            url: normW1,
            format: normW1.includes('.m3u8') ? 'hls' : isDirect ? 'mp4' : 'embed',
            headers: {
              Referer: normW1.includes('multicloudlinks') ? 'https://new.multicloudlinks.com/' : `${scraperPipelineService.getBaseUrl()}/`,
            },
          });
        }
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
      player_2_m3u8_url: streams && streams.player_2_m3u8_url && isDirectStream(streams.player_2_m3u8_url) ? streams.player_2_m3u8_url.trim() : undefined,
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


