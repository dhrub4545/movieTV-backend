# MovieTV Backend API

Stateless aggregator backend for MovieTV (Android TV, Web, and Mobile). Provides unified feeds for Movies, TV Series, Live IPTV Channels, and dynamic stream resolution.

## Features
- **Stateless & Serverless Ready**: Deployable directly to Vercel or runnable as a standalone Node.js service.
- **MongoDB Atlas Integration**: Automated connection caching across cold and warm serverless invocations.
- **Dynamic Scraper Pipeline**: Automated scheduled content fetching with Vercel Cron support (`GET /api/scraper/trigger`).
- **Live TV**: Direct M3U streaming from IPTV GitHub repositories (800+ channels).
- **Stream Resolver**: Embed unpacking and direct M3U8 stream resolution.

## Endpoints
- `GET /api/health` - Server health status
- `GET /api/feed/home` - Featured media and categorized sections
- `GET /api/feed/movies` - Paginated movies with search & category filters
- `GET /api/feed/series` - Paginated web series
- `GET /api/feed/movie/:id` - Movie details
- `GET /api/feed/series/:id` - Series details & seasons/episodes
- `GET /api/channels` - Live TV channel list (filterable by category)
- `GET /api/channels/categories` - Channel category list
- `GET /api/stream/resolve?id=...&type=movie` - Stream resolver
- `GET /api/search?q=...` - Multi-entity search
- `GET /api/scraper/status` - Scraper pipeline status
- `GET /api/scraper/config` - Scraper mirror configuration
- `POST /api/scraper/config` - Update scraper mirror baseUrl
- `GET /api/scraper/trigger` - Trigger scraper pipeline run (Vercel Cron compatible)

## Setup & Local Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   Copy `.env.example` to `.env` and set `MONGO_URI`.

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Deploying to Vercel
1. Set **Root Directory** to `backend`.
2. Add environment variable `MONGO_URI`.
3. Deploy!
