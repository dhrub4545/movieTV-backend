/**
 * One-time seed script: pushes movies_and_series_data.json into MongoDB Atlas.
 *
 * Usage:
 *   npx tsx src/seedDb.ts
 *
 * The script reads the JSON file, creates two collections:
 *   - movies   (type === 'movie')
 *   - series   (type === 'series')
 *
 * It uses bulkWrite with ordered:false for speed, and upserts by `id`
 * so re-running is safe (idempotent).
 */

import dns from 'dns';
import dotenv from 'dotenv';
import fs from 'fs';
import mongoose, { Schema } from 'mongoose';
import path from 'path';

// Fix for Windows/local router DNS refusing SRV queries for MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // fallback to system default if not allowed
}

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Schemas ─────────────────────────────────────────────────────────────

const StreamsSchema = new Schema(
  {
    watch_embed: { type: String, default: '' },
    watch_raw: { type: String, default: '' },
    player_2: { type: String, default: '' },
  },
  { _id: false },
);

const EpisodeSchema = new Schema(
  {
    episode: { type: String, required: true },
    watch_1_embed: { type: String, default: '' },
    watch_1_raw: { type: String, default: '' },
    watch_2: { type: String, default: '' },
  },
  { _id: false },
);

const SeasonSchema = new Schema(
  {
    season_name: { type: String, required: true },
    total_episodes: { type: Number, default: 0 },
    episodes: [EpisodeSchema],
  },
  { _id: false },
);

const MovieSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: true },
    full_title: { type: String, default: '' },
    type: { type: String, enum: ['movie'], default: 'movie' },
    poster_filename: { type: String, default: '' },
    poster_url: { type: String, default: '' },
    movie_page_url: { type: String, default: '' },
    streams: { type: StreamsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const SeriesSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: true },
    full_title: { type: String, default: '' },
    type: { type: String, enum: ['series'], default: 'series' },
    poster_filename: { type: String, default: '' },
    poster_url: { type: String, default: '' },
    movie_page_url: { type: String, default: '' },
    seasons: [SeasonSchema],
  },
  { timestamps: true },
);

const Movie = mongoose.model('Movie', MovieSchema);
const Series = mongoose.model('Series', SeriesSchema);

// ── Main ────────────────────────────────────────────────────────────────

async function seed() {
  const uri = process.env.MONOGO_URI; // note: .env has a typo "MONOGO_URI"
  if (!uri) {
    console.error('❌ MONOGO_URI not found in .env — cannot connect to MongoDB.');
    process.exit(1);
  }

  // 1. Read JSON
  const jsonPath = path.resolve(__dirname, '../../movies_and_series_data.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ JSON file not found at: ${jsonPath}`);
    process.exit(1);
  }

  console.log('📄 Reading JSON file…');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const allItems: any[] = JSON.parse(raw);
  console.log(`   Total items in JSON: ${allItems.length}`);

  const movies = allItems.filter((i) => i.type === 'movie');
  const series = allItems.filter((i) => i.type === 'series');
  console.log(`   Movies: ${movies.length}  |  Series: ${series.length}`);

  // 2. Connect to MongoDB Atlas
  console.log('🔌 Connecting to MongoDB Atlas…');
  await mongoose.connect(uri, { dbName: 'movieTV' });
  console.log('✅ Connected!');

  // 3. Upsert movies
  if (movies.length > 0) {
    console.log(`🎬 Upserting ${movies.length} movies…`);
    const movieOps = movies.map((m) => ({
      updateOne: {
        filter: { id: m.id },
        update: { $set: m },
        upsert: true,
      },
    }));

    // bulkWrite in batches of 500
    const BATCH = 500;
    for (let i = 0; i < movieOps.length; i += BATCH) {
      const batch = movieOps.slice(i, i + BATCH);
      const result = await Movie.bulkWrite(batch, { ordered: false });
      console.log(
        `   batch ${Math.floor(i / BATCH) + 1}: upserted=${result.upsertedCount} modified=${result.modifiedCount}`,
      );
    }
  }

  // 4. Upsert series
  if (series.length > 0) {
    console.log(`📺 Upserting ${series.length} series…`);
    const seriesOps = series.map((s) => ({
      updateOne: {
        filter: { id: s.id },
        update: { $set: s },
        upsert: true,
      },
    }));

    const BATCH = 500;
    for (let i = 0; i < seriesOps.length; i += BATCH) {
      const batch = seriesOps.slice(i, i + BATCH);
      const result = await Series.bulkWrite(batch, { ordered: false });
      console.log(
        `   batch ${Math.floor(i / BATCH) + 1}: upserted=${result.upsertedCount} modified=${result.modifiedCount}`,
      );
    }
  }

  // 5. Summary
  const movieCount = await Movie.countDocuments();
  const seriesCount = await Series.countDocuments();
  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Seed complete!`);
  console.log(`   📀 Database: movieTV`);
  console.log(`   🎬 Movies collection:  ${movieCount} documents`);
  console.log(`   📺 Series collection:  ${seriesCount} documents`);
  console.log('═══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
