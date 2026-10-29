export type MediaType = 'movie' | 'tv' | 'live';

export interface MediaItem {
  id: string;
  tmdbId?: number;
  title: string;
  overview: string;
  posterUrl: string;
  backdropUrl: string;
  releaseYear: string;
  year?: number;
  isIndian?: boolean;
  region?: 'Indian' | 'Non-Indian';
  rating: number; // e.g. 8.4
  type: MediaType;
  category: string; // e.g. 'Bollywood', 'Hollywood', 'Web Series', 'Action'
  genres: string[];
  duration?: string; // e.g. "2h 15m" or "Season 1"
  streamUrl?: string; // Direct preview or pre-resolved stream if available
  m3u8_url?: string; // Server 1 direct .m3u8 link from DB
  player_2_m3u8_url?: string; // Server 2 direct .m3u8 link from DB
  quality?: string; // 'HDCAM' | 'HD' | '4K'
  seasons?: any[];
}

export interface HomeFeed {
  featured: MediaItem;
  sections: {
    title: string;
    category: string;
    type: MediaType;
    items: MediaItem[];
  }[];
}

export interface ChannelItem {
  id: string;
  name: string;
  logo: string;
  category: 'Sports' | 'News' | 'Movies' | 'Entertainment' | 'Music' | 'Kids';
  streamUrl: string;
  country: string;
  quality: string; // e.g. '1080p', '720p'
  headers?: Record<string, string>;
}

export interface StreamSource {
  quality: string; // '1080p', '720p', '4K', 'Auto'
  url: string;
  format: 'hls' | 'mp4' | 'dash' | 'embed';
  headers?: Record<string, string>;
}

export interface SubtitleTrack {
  language: string;
  label: string;
  url: string;
}

export interface StreamResolveResponse {
  title: string;
  tmdbId?: number;
  type: MediaType;
  sources: StreamSource[];
  m3u8_url?: string;
  player_2_m3u8_url?: string;
  watch_embed_url?: string;
  subtitles: SubtitleTrack[];
}
