import axios from 'axios';
import { Request, Response } from 'express';

export async function proxyStream(req: Request, res: Response) {
  const targetUrl = req.query.url as string;
  const referer = req.query.referer as string;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent':
        (req.headers['user-agent'] as string) ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
    };
    if (referer) {
      headers['Referer'] = referer;
    }

    const response = await axios({
      method: 'GET',
      url: targetUrl,
      headers,
      responseType: 'stream',
      timeout: 10000,
    });

    // Cleanup upstream socket if downstream client disconnects
    req.on('close', () => {
      try {
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
      } catch {
        // Ignore
      }
    });

    if (response.headers['content-type']) {
      res.setHeader('Content-Type', String(response.headers['content-type']));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    response.data.pipe(res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Proxy stream error',
        message: err.message,
      });
    }
  }
}
