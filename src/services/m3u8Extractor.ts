import axios from 'axios';
import crypto from 'crypto';

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
    const hashMatch = url.match(/#([a-zA-Z0-9_-]+)/);
    if (!hashMatch) return null;
    const videoId = hashMatch[1];
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

/**
 * Extracts the direct .m3u8 streaming link from an embed URL (e.g. hdstream4u, greenmotors, hubstream, etc.)
 */
export async function extractDirectM3u8(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  let targetUrl = url.trim();

  if (targetUrl.includes('.m3u8')) return targetUrl;
  if (targetUrl.includes('/file/')) targetUrl = targetUrl.replace('/file/', '/embed/');

  // 1. Hubstream AES video extraction
  if (targetUrl.includes('hubstream') && targetUrl.includes('#')) {
    const hs = await extractHubstreamM3u8(targetUrl);
    if (hs) return hs;
  }

  // 2. HTTP page fetching & Dean Edwards / Regex extraction
  try {
    const origin = new URL(targetUrl).origin;
    const resp = await axios.get(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: origin + '/',
      },
      timeout: 8000,
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    if (!html) return null;

    // A. Direct match in html
    const directMatch = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
    if (directMatch) return directMatch[0];

    // B. Dean Edwards packed script
    const unpacked = unpackDeanEdwards(html);
    if (unpacked) {
      const m3u8Match = unpacked.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (m3u8Match) return m3u8Match[0];

      const streamMatch = unpacked.match(/\/stream\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
      if (streamMatch) return origin + streamMatch[0];

      const relMatch = unpacked.match(/["'](\/[^"']+\.m3u8[^"']*)["']/i);
      if (relMatch) return origin + relMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}
