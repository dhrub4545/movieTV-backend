import axios from 'axios';
import crypto from 'crypto';
import https from 'https';
import { resolveGreenmotors } from './greenmotorsResolver';

// High-throughput insecure HTTPS agent for personal use (ignores SSL expiration, reuses sockets)
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: 64,
});

// In-memory cache for extracted M3U8 URLs (TTL: 15 minutes)
const extractionCache = new Map<string, { m3u8: string; expiresAt: number }>();

export function unpackDeanEdwards(packed: string): string {
  try {
    const regex =
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('(.*?)',(\d+),(\d+),'(.*?)'\.split\('\|'\)/;
    const match = packed.match(regex);
    if (!match) return '';
    let [_, p, aStr, cStr, kStr] = match;
    let a = parseInt(aStr, 10) || 36;
    let c = parseInt(cStr, 10) || 0;
    const k = kStr.split('|');
    while (c--) {
      if (k[c]) {
        p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
      }
    }
    return p;
  } catch {
    return '';
  }
}

function getHubstreamKey(): Buffer {
  const p = 'https:';
  const L = '10';
  const M = 110;
  const W = 1;
  let N = '';
  const q = ('ᵟ'.charCodeAt(0) || 0).toString().split('');
  for (let Ge = 0; Ge < q.length; Ge++) {
    N += String.fromCodePoint(parseInt(L + q[Ge], 10));
  }
  N += String.fromCodePoint(p.charCodeAt(parseInt(L, 10) / 10) || 0);
  N += N.slice(1, 3);
  N += String.fromCodePoint(M, M - 1, M + 7);
  const he = '3579'.split('');
  N += String.fromCodePoint(parseInt(he[3] + he[2], 10), parseInt(he[1] + he[2], 10));
  N += String.fromCodePoint(
    (he[0] as any) * W + W + (he[3] as any),
    (he[0] as any) * W + W + (he[3] as any),
  );
  N += String.fromCodePoint(
    (he[3] as any) * (L as any) + (he[3] as any) * W,
    parseInt(he.slice().reverse().join('').slice(0, 2), 10),
  );
  return Buffer.from(new TextEncoder().encode(N));
}

function getHubstreamIV(hash: string): Buffer {
  if (!hash.startsWith('#')) hash = '#' + hash;
  const p = 'https:';
  const L = p + '//';
  const M = hash;
  const W = p.length * L.length;
  const N = 1;
  let q = '';
  for (let Be = N; Be < 10; Be++) q += String.fromCodePoint(Be + W);
  let he = '';
  he = N + he + N + he + N;
  const Ge = he.length * (M.charCodeAt(0) || 0);
  const at = (he as any) * N + p.length;
  const X = at + 4;
  const Ee = p.charCodeAt(N) || 0;
  const Me = Ee * N - 2;
  q += String.fromCodePoint(W, parseInt(he, 10), Ge, at, X, Ee, Me);
  return Buffer.from(new TextEncoder().encode(q));
}

export async function extractHubstreamM3u8(url: string): Promise<string | null> {
  try {
    let videoId = '';
    const hashMatch = url.match(/#([a-zA-Z0-9_-]+)/);
    if (hashMatch) {
      videoId = hashMatch[1];
    } else {
      const pathMatch = url.match(/\/(?:meb|unl|video|stream)\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) {
        videoId = pathMatch[1];
      } else {
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch) {
          videoId = idMatch[1];
        } else {
          const slugMatch = url.match(/hubstream\.[a-z]+\/([a-zA-Z0-9_-]{5,})/);
          if (slugMatch) videoId = slugMatch[1];
        }
      }
    }
    if (!videoId) return null;
    const apiUrl = `https://hubstream.art/api/v1/video?id=${videoId}&w=1920&h=1080`;

    let res: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await axios.get(apiUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://hubstream.art/',
          },
          timeout: 15000,
          httpsAgent: insecureAgent,
        });
        if (res && res.status === 200 && res.data) break;
      } catch (err) {
        if (attempt === 1) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!res || res.status !== 200 || !res.data) return null;

    const key = getHubstreamKey();
    const iv = getHubstreamIV('#' + videoId);
    const cipherBytes = Buffer.from(res.data, 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    const decrypted = Buffer.concat([decipher.update(cipherBytes), decipher.final()]);
    const json = JSON.parse(decrypted.toString('utf8'));

    if (json.cfNative && typeof json.cfNative === 'string' && json.cfNative.includes('.m3u8')) {
      return json.cfNative;
    }
    if (json.source && typeof json.source === 'string' && json.source.includes('.m3u8')) {
      return json.source;
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractVidaraaM3u8(url: string): Promise<string | null> {
  try {
    let filecode = '';
    const match = url.match(/\/(?:e|v)\/([a-zA-Z0-9_-]+)/);
    if (match) filecode = match[1];
    if (!filecode) {
      const parts = url.split('/');
      filecode = parts[parts.length - 1].split('?')[0];
    }
    if (!filecode || filecode.length < 3) return null;

    const res = await axios.post(
      'https://vidaraa.cc/api/stream',
      {
        filecode,
        device: 'desktop',
        codecs: { h264: true, aac: true },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: `https://vidaraa.cc/e/${filecode}`,
          Origin: 'https://vidaraa.cc',
        },
        timeout: 12000,
        httpsAgent: insecureAgent,
      },
    );
    if (res.data?.streaming_url && typeof res.data.streaming_url === 'string' && res.data.streaming_url.includes('.m3u8')) {
      return res.data.streaming_url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts the direct .m3u8 or progressive video streaming link from an embed URL (e.g. hdstream4u, greenmotors, hubstream, multicloudlinks, vidaraa, etc.)
 */
export async function extractDirectM3u8(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  let targetUrl = url.trim();

  // Normalize common mirror / typo domains
  if (targetUrl.includes('hdstrram4u.com')) {
    targetUrl = targetUrl.replace('hdstrram4u.com', 'hdstream4u.com');
  }

  // If already a direct media stream or progressive file URL, return immediately
  if (
    targetUrl.includes('.m3u8') ||
    targetUrl.includes('action=watch') ||
    targetUrl.includes('multidownload.lol') ||
    targetUrl.endsWith('.mp4') ||
    targetUrl.endsWith('.mkv')
  ) {
    return targetUrl;
  }

  // Check in-memory extraction cache
  const cached = extractionCache.get(targetUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.m3u8;
  }

  // If greenmotors is passed, resolve its obfuscated token directly
  if (targetUrl.includes('greenmotors')) {
    try {
      const gm = await resolveGreenmotors(targetUrl);
      if (gm.directUrl) {
        extractionCache.set(targetUrl, { m3u8: gm.directUrl, expiresAt: Date.now() + 15 * 60 * 1000 });
        return gm.directUrl;
      }
      if (gm.embedUrl && gm.embedUrl !== targetUrl) {
        targetUrl = gm.embedUrl;
      }
    } catch {}
  }

  if (targetUrl.includes('/file/')) targetUrl = targetUrl.replace('/file/', '/embed/');

  // 1. Vidaraa API extraction
  if (targetUrl.includes('vidaraa.cc') || targetUrl.includes('vidaraa.')) {
    const vd = await extractVidaraaM3u8(targetUrl);
    if (vd) {
      extractionCache.set(url.trim(), { m3u8: vd, expiresAt: Date.now() + 15 * 60 * 1000 });
      return vd;
    }
  }

  // 2. Hubstream AES video extraction
  if (targetUrl.includes('hubstream') || targetUrl.includes('/meb/') || targetUrl.includes('/unl/') || targetUrl.includes('#')) {
    const hs = await extractHubstreamM3u8(targetUrl);
    if (hs) {
      extractionCache.set(url.trim(), { m3u8: hs, expiresAt: Date.now() + 15 * 60 * 1000 });
      return hs;
    }
  }

  // 3. HTTP page fetching & Dean Edwards / streamSrc / Regex extraction
  try {
    const origin = new URL(targetUrl).origin;
    const resp = await axios.get(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: origin + '/',
      },
      timeout: 10000,
      httpsAgent: insecureAgent,
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    if (!html) return null;

    let foundM3u8: string | null = null;

    // A. streamSrc match (e.g. multicloudlinks, multidownload)
    const streamSrcMatch =
      html.match(/(?:const|var|let)\s+streamSrc\s*=\s*["']([^"']+)["']/i) ||
      html.match(/["'](https?:\/\/[^"']+(?:action=watch|multidownload)[^"']*)["']/i);
    if (streamSrcMatch) {
      foundM3u8 = streamSrcMatch[1];
    }

    // B. Direct match in html
    if (!foundM3u8) {
      const directMatch = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (directMatch) foundM3u8 = directMatch[0];
    }

    // C. Dean Edwards packed script
    if (!foundM3u8) {
      const unpacked = unpackDeanEdwards(html);
      if (unpacked) {
        const m3u8Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
        if (m3u8Match) {
          foundM3u8 = m3u8Match[0];
        } else {
          const streamMatch = unpacked.match(/\/stream\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
          if (streamMatch) {
            foundM3u8 = origin + streamMatch[0];
          } else {
            const relMatch = unpacked.match(/["'](\/[^"']+\.m3u8[^"']*)["']/i);
            if (relMatch) foundM3u8 = origin + relMatch[1];
          }
        }
      }
    }

    if (foundM3u8) {
      extractionCache.set(url.trim(), { m3u8: foundM3u8, expiresAt: Date.now() + 15 * 60 * 1000 });
      return foundM3u8;
    }

    return null;
  } catch {
    return null;
  }
}
