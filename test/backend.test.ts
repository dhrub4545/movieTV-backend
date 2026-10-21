import assert from 'node:assert';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app';
import { connectDb } from '../src/db';

before(async () => {
  await connectDb();
});

after(async () => {
  await mongoose.disconnect();
  // Allow pending handles to close
  setTimeout(() => process.exit(0), 100);
});

test('1. Health Check Endpoint returns 200 and ok status', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.strictEqual(res.body.app, 'MovieTV Stateless Backend');
  assert.ok(res.body.timestamp);
});

test('2. Home Feed returns featured item and categorized sections', async () => {
  const res = await request(app).get('/api/feed/home');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.featured);
  assert.ok(res.body.featured.title);
  assert.ok(res.body.sections);
  assert.ok(Array.isArray(res.body.sections));
  assert.ok(res.body.sections.length >= 3);
});

test('3. Movies & Series endpoints return media items', async () => {
  const moviesRes = await request(app).get('/api/feed/movies');
  assert.strictEqual(moviesRes.status, 200);
  assert.ok(Array.isArray(moviesRes.body));
  assert.ok(moviesRes.body.length > 0);
  assert.ok(moviesRes.body[0].posterUrl);

  const seriesRes = await request(app).get('/api/feed/series');
  assert.strictEqual(seriesRes.status, 200);
  assert.ok(Array.isArray(seriesRes.body));
  assert.ok(seriesRes.body.length > 0);
});

test('4. Channels Categories endpoint returns valid categories', async () => {
  const res = await request(app).get('/api/channels/categories');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(res.body.categories.includes('Sports'));
  assert.ok(res.body.categories.includes('News'));
  assert.ok(res.body.categories.includes('Movies'));
  assert.ok(res.body.categories.includes('Entertainment'));
});

test('5. Channels list endpoint supports category filtering', async () => {
  const allRes = await request(app).get('/api/channels');
  assert.strictEqual(allRes.status, 200);
  assert.ok(allRes.body.channels.length > 0);

  const sportsRes = await request(app).get('/api/channels?category=Sports');
  assert.strictEqual(sportsRes.status, 200);
  assert.ok(sportsRes.body.channels.length > 0);
  sportsRes.body.channels.forEach((ch: any) => {
    assert.strictEqual(ch.category, 'Sports');
    assert.ok(ch.streamUrl);
  });

  const newsRes = await request(app).get('/api/channels?category=News');
  assert.strictEqual(newsRes.status, 200);
  assert.ok(newsRes.body.channels.length > 0);
  newsRes.body.channels.forEach((ch: any) => {
    assert.strictEqual(ch.category, 'News');
    assert.ok(ch.streamUrl);
  });
});

test('6. Stream Resolver endpoint returns playable sources and subtitles', async () => {
  const res = await request(app).get('/api/stream/resolve?id=1&type=movie');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.sources);
  assert.ok(Array.isArray(res.body.sources));
  assert.ok(res.body.sources.length >= 1);
  assert.ok(res.body.sources[0].url.startsWith('http'));
  assert.ok(Array.isArray(res.body.subtitles));
});

test('7. Search endpoint returns results for movies and channels', async () => {
  const res = await request(app).get('/api/search?q=Sports');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.channels.length > 0);

  const movieSearch = await request(app).get('/api/search?q=Aryabhatt');
  assert.strictEqual(movieSearch.status, 200);
  assert.ok(movieSearch.body.media.length > 0);
});

test('8. 404 Not Found is handled gracefully', async () => {
  const res = await request(app).get('/api/invalid-route');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'Endpoint not found');
});

test('9. Scraper Status endpoint returns status and scraper configuration', async () => {
  const res = await request(app).get('/api/scraper/status');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.ok(res.body.scraper);
  assert.strictEqual(typeof res.body.scraper.isRunning, 'boolean');
  assert.strictEqual(typeof res.body.scraper.baseUrl, 'string');
});

test('10. Scraper Config endpoint returns mirror list and accepts new baseUrl', async () => {
  const res = await request(app).get('/api/scraper/config');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  assert.ok(res.body.baseUrl);
  assert.ok(Array.isArray(res.body.knownMirrors));

  // Test updating config
  const updateRes = await request(app)
    .post('/api/scraper/config')
    .send({ baseUrl: 'https://new8.hdhub4u.cl' });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.body.status, 'ok');
  assert.strictEqual(updateRes.body.currentUrl, 'https://new8.hdhub4u.cl');
});
