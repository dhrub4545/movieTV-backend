import axios from 'axios';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

export function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + 13) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + 13) % 26) + 97);
    return c;
  });
}

/**
 * Resolves greenmotors.club obfuscated stream URLs into player embed URL and direct video stream URL.
 * Handles multicloudlinks and multidownload.lol streams.
 */
export async function resolveGreenmotors(url: string): Promise<{ embedUrl: string; directUrl: string }> {
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

