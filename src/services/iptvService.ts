import axios from 'axios';
import { LIVE_CHANNELS } from '../data/mockData';
import { ChannelItem } from '../types';

/**
 * Playlists directly from https://github.com/iptv-org/iptv/tree/master/streams
 * iptv-org/iptv constantly updates streams across 326+ countries.
 * index.m3u compiles all streams from the /streams folder into a single master build.
 */
const DEFAULT_GITHUB_PLAYLISTS = [
  // Full automated build of all streams in /streams
  'https://iptv-org.github.io/iptv/index.m3u',
  // Sports category containing international cricket and sports
  'https://iptv-org.github.io/iptv/categories/sports.m3u',
  // Raw GitHub direct streams from /streams folder
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/pk.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/au.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/uk.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/ca.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/bd.m3u',
];

export class IptvService {
  private channels: ChannelItem[] = [...LIVE_CHANNELS];
  private categoryMap = new Map<string, ChannelItem[]>();
  private lastFetchedAt: number = 0;
  private lastCommitSha: string = '';
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes real-time TTL
  private isFetching = false;

  constructor() {
    this.rebuildCategoryIndex();
    // Initial fetch from GitHub in background
    this.refreshFromGitHub().catch(() => {});

    // Periodic check for real-time GitHub commits every 5 minutes
    setInterval(() => {
      this.checkAndSyncRealtime().catch(() => {});
    }, 5 * 60 * 1000);
  }

  private rebuildCategoryIndex(): void {
    const map = new Map<string, ChannelItem[]>();
    for (const ch of this.channels) {
      const catKey = (ch.category || 'entertainment').toLowerCase();
      const existing = map.get(catKey) || [];
      existing.push(ch);
      map.set(catKey, existing);
    }
    this.categoryMap = map;
  }

  /**
   * Checks GitHub API for the latest commit on the /streams directory
   */
  async checkLatestGitHubCommit(): Promise<string | null> {
    try {
      const res = await axios.get(
        'https://api.github.com/repos/iptv-org/iptv/commits?path=streams&per_page=1',
        {
          timeout: 6000,
          headers: {
            'User-Agent': 'MovieTV-App/2.0',
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );
      if (res.data && res.data.length > 0 && res.data[0].sha) {
        return res.data[0].sha;
      }
    } catch (err: any) {
      console.warn('⚠️ Could not check GitHub commit SHA:', err.message);
    }
    return null;
  }

  /**
   * If a new commit has landed on GitHub /streams, refreshes in real-time
   */
  async checkAndSyncRealtime(): Promise<void> {
    const latestSha = await this.checkLatestGitHubCommit();
    if (latestSha && latestSha !== this.lastCommitSha) {
      console.log(
        `🔄 Real-Time GitHub update detected on /streams (${latestSha.substring(0, 7)} vs ${this.lastCommitSha.substring(0, 7)}). Refreshing channels...`
      );
      await this.refreshFromGitHub(true);
    }
  }

  /**
   * Fetches latest IPTV M3U streams directly from GitHub
   */
  async refreshFromGitHub(force = false): Promise<void> {
    if (this.isFetching && !force) return;
    this.isFetching = true;

    try {
      console.log('📡 Updating Live TV channels directly from GitHub streams in real time...');
      const targetUrls = process.env.GITHUB_IPTV_URL
        ? [process.env.GITHUB_IPTV_URL, ...DEFAULT_GITHUB_PLAYLISTS]
        : DEFAULT_GITHUB_PLAYLISTS;

      const parsedChannels: ChannelItem[] = [];

      // Query GitHub for latest commit SHA
      const currentSha = await this.checkLatestGitHubCommit();
      if (currentSha) {
        this.lastCommitSha = currentSha;
      }

      for (const url of targetUrls) {
        try {
          // Append cache buster to guarantee live, un-cached GitHub content
          const liveUrl = url.includes('?')
            ? `${url}&_t=${Date.now()}`
            : `${url}?_t=${Date.now()}`;

          const res = await axios.get(liveUrl, {
            timeout: 15000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          });

          const items = this.parseM3U(res.data);
          parsedChannels.push(...items);
        } catch (err: any) {
          console.warn(`⚠️ Failed to fetch GitHub playlist ${url}:`, err.message);
        }
      }

      if (parsedChannels.length > 0) {
        const seen = new Set<string>();
        const merged: ChannelItem[] = [];

        // Put curated fast channels (Willow, Sony Ten, Star Sports Select, Cricket Gold, etc.) first
        for (const ch of LIVE_CHANNELS) {
          seen.add(ch.name.toLowerCase());
          merged.push(ch);
        }

        for (const ch of parsedChannels) {
          const key = ch.name.toLowerCase();
          if (!seen.has(key) && ch.streamUrl) {
            seen.add(key);
            merged.push(ch);
          }
        }

        this.channels = merged;
        this.rebuildCategoryIndex();
        this.lastFetchedAt = Date.now();
        console.log(`✅ Real-time sync complete: Loaded ${this.channels.length} Live TV channels from GitHub! (SHA: ${this.lastCommitSha.substring(0, 7) || 'latest'})`);
      }
    } catch (err: any) {
      console.error('❌ Error refreshing GitHub IPTV:', err.message);
    } finally {
      this.isFetching = false;
    }
  }

  private parseM3U(content: string): ChannelItem[] {
    const lines = content.split(/\r?\n/);
    const channels: ChannelItem[] = [];

    let currentMetadata: {
      name?: string;
      logo?: string;
      category?: string;
      country?: string;
      quality?: string;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
        const groupMatch = line.match(/group-title="([^"]+)"/i);
        const commaIdx = line.lastIndexOf(',');
        const rawName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Live Channel';

        let cat: any = 'Entertainment';
        const group = (groupMatch ? groupMatch[1] : '').toLowerCase();

        // Categorize all cricket & sports into Sports section
        const isSportOrCricket =
          /sport|cricket|willow|star sports|sony ten|ten sports|ten cricket|ptv sports|sky sports|supersport|astro cricket|t sports/i.test(group) ||
          /sport|cricket|willow|star sports|sony ten|ten sports|ten cricket|ptv sports|sky sports|supersport|astro cricket|t sports/i.test(rawName);

        if (isSportOrCricket) cat = 'Sports';
        else if (/news/i.test(group) || /news/i.test(rawName)) cat = 'News';
        else if (/movie|cinema/i.test(group) || /cinema|movie/i.test(rawName)) cat = 'Movies';
        else if (/music/i.test(group) || /music/i.test(rawName)) cat = 'Music';
        else if (/kid|cartoon|anim/i.test(group) || /kids/i.test(rawName)) cat = 'Kids';

        let defaultLogo = 'https://images.pluto.tv/channels/5ca29c9ef472141527498c11/colorLogoPNG.png';
        if (/willow/i.test(rawName)) {
          defaultLogo = 'https://cricket.willow.tv/_nuxt/img/willow_blue_logo.362ed8e.png';
        } else if (/cricket gold/i.test(rawName)) {
          defaultLogo = 'https://resources.cricket-australia.pulselive.com/cricket-australia/photo/2025/07/25/836eddae-4329-4542-ad17-dcd37e9d951a/Cricket-Gold-1920x1080_noBG.png';
        } else if (/star sports/i.test(rawName)) {
          defaultLogo = 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_2/images/LOGO_HD/image.png';
        } else if (/sony.*ten/i.test(rawName)) {
          defaultLogo = 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_SPORTS_TEN_1/images/LOGO_HD/image.png';
        }

        let qual = 'HD';
        if (/1080p/i.test(rawName) || /1080/i.test(rawName)) qual = '1080p';
        else if (/720p/i.test(rawName) || /720/i.test(rawName)) qual = '720p';
        else if (/576p|480p|sd/i.test(rawName)) qual = 'SD';

        let cty = 'India';
        if (/willow/i.test(rawName)) cty = 'USA';
        else if (/ptv sports|ten sports pakistan/i.test(rawName)) cty = 'Pakistan';
        else if (/cricket gold/i.test(rawName)) cty = 'Australia';

        currentMetadata = {
          name: rawName,
          logo: logoMatch ? logoMatch[1] : defaultLogo,
          category: cat,
          country: cty,
          quality: qual,
        };
      } else if (line.startsWith('http://') || line.startsWith('https://')) {
        if (currentMetadata && currentMetadata.name) {
          channels.push({
            id: `git-${channels.length + 1}`,
            name: currentMetadata.name,
            logo: currentMetadata.logo || '',
            category: (currentMetadata.category as any) || 'Entertainment',
            streamUrl: line,
            country: currentMetadata.country || 'India',
            quality: currentMetadata.quality || '1080p',
          });
        }
        currentMetadata = null;
      }
    }

    return channels;
  }

  getCategories(): string[] {
    return ['All', 'Sports', 'News', 'Movies', 'Entertainment', 'Music', 'Kids'];
  }

  getChannels(category?: string, limit?: number): ChannelItem[] {
    // If cache expired, check GitHub in background
    if (Date.now() - this.lastFetchedAt > this.CACHE_TTL_MS) {
      this.checkAndSyncRealtime().catch(() => {});
    }

    let list: ChannelItem[];
    if (!category || category.toLowerCase() === 'all') {
      list = this.channels;
    } else {
      const cat = category.toLowerCase();
      list = this.categoryMap.get(cat) || [];
    }

    if (limit && limit > 0) {
      return list.slice(0, limit);
    }
    return list;
  }

  getChannelById(id: string): ChannelItem | undefined {
    return this.channels.find((ch) => ch.id === id);
  }

  getLastFetchedAt(): number {
    return this.lastFetchedAt;
  }

  getLastCommitSha(): string {
    return this.lastCommitSha;
  }

  searchChannels(query: string): ChannelItem[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.channels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.category.toLowerCase().includes(q) ||
        ch.country.toLowerCase().includes(q)
    );
  }
}

export const iptvService = new IptvService();
