import axios from 'axios';
import { LIVE_CHANNELS } from '../data/mockData';
import { ChannelItem } from '../types';

const DEFAULT_GITHUB_PLAYLISTS = [
  'https://iptv-org.github.io/iptv/categories/sports.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/in.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/pk.m3u',
  'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/au.m3u',
  'https://iptv-org.github.io/iptv/countries/in.m3u',
  'https://iptv-org.github.io/iptv/languages/hin.m3u',
];

export class IptvService {
  private channels: ChannelItem[] = [...LIVE_CHANNELS];
  private categoryMap = new Map<string, ChannelItem[]>();
  private lastFetchedAt: number = 0;
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private isFetching = false;

  constructor() {
    this.rebuildCategoryIndex();
    // Initial fetch from GitHub directly in background
    this.refreshFromGitHub().catch(() => {});
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
   * Fetches the latest IPTV M3U playlists directly from GitHub repositories
   */
  async refreshFromGitHub(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      console.log('📡 Updating Live TV channels directly from GitHub...');
      const targetUrls = process.env.GITHUB_IPTV_URL
        ? [process.env.GITHUB_IPTV_URL, ...DEFAULT_GITHUB_PLAYLISTS]
        : DEFAULT_GITHUB_PLAYLISTS;

      const parsedChannels: ChannelItem[] = [];

      for (const url of targetUrls) {
        try {
          const res = await axios.get(url, {
            timeout: 12000,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
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

        // Put curated fast channels first
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
        console.log(`✅ Loaded ${this.channels.length} Live TV channels from GitHub!`);
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
        
        // Comprehensive sports & cricket detection so Willow, Star Sports, Sony Ten, etc. go to Sports
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

  getChannels(category?: string): ChannelItem[] {
    // If cache expired, trigger background refresh
    if (Date.now() - this.lastFetchedAt > this.CACHE_TTL_MS) {
      this.refreshFromGitHub().catch(() => {});
    }

    if (!category || category.toLowerCase() === 'all') {
      return this.channels;
    }
    const cat = category.toLowerCase();
    return this.categoryMap.get(cat) || [];
  }

  getChannelById(id: string): ChannelItem | undefined {
    return this.channels.find((ch) => ch.id === id);
  }

  searchChannels(query: string): ChannelItem[] {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.channels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.category.toLowerCase().includes(q) ||
        ch.country.toLowerCase().includes(q),
    );
  }
}

export const iptvService = new IptvService();
