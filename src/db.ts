import dns from 'dns';
import dotenv from 'dotenv';
import mongoose, { Document, Model, Schema } from 'mongoose';
import path from 'path';

// Fix for Windows / ISP DNS refusing SRV queries for MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if not permitted
}

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// ── Models ─────────────────────────────────────────────────────────────

export interface IStreams {
  watch_embed?: string;
  watch_raw?: string;
  player_2?: string;
}

export interface IMovie extends Document {
  id: string;
  title: string;
  full_title?: string;
  type: 'movie';
  poster_filename?: string;
  poster_url?: string;
  movie_page_url?: string;
  streams?: IStreams;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IEpisode {
  episode: string;
  watch_1_embed?: string;
  watch_1_raw?: string;
  watch_2?: string;
}

export interface ISeason {
  season_name: string;
  total_episodes: number;
  episodes: IEpisode[];
}

export interface ISeries extends Document {
  id: string;
  title: string;
  full_title?: string;
  type: 'series';
  poster_filename?: string;
  poster_url?: string;
  movie_page_url?: string;
  seasons?: ISeason[];
  createdAt?: Date;
  updatedAt?: Date;
}

const StreamsSchema = new Schema<IStreams>(
  {
    watch_embed: { type: String, default: '' },
    watch_raw: { type: String, default: '' },
    player_2: { type: String, default: '' },
  },
  { _id: false },
);

const EpisodeSchema = new Schema<IEpisode>(
  {
    episode: { type: String, required: true },
    watch_1_embed: { type: String, default: '' },
    watch_1_raw: { type: String, default: '' },
    watch_2: { type: String, default: '' },
  },
  { _id: false },
);

const SeasonSchema = new Schema<ISeason>(
  {
    season_name: { type: String, required: true },
    total_episodes: { type: Number, default: 0 },
    episodes: [EpisodeSchema],
  },
  { _id: false },
);

const MovieSchema = new Schema<IMovie>(
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

// Compound text index for sub-millisecond search across 11,000+ movies
MovieSchema.index({ title: 'text', full_title: 'text' });

const SeriesSchema = new Schema<ISeries>(
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

// Compound text index for series search
SeriesSchema.index({ title: 'text', full_title: 'text' });

export const Movie: Model<IMovie> =
  mongoose.models.Movie || mongoose.model<IMovie>('Movie', MovieSchema);
export const Series: Model<ISeries> =
  mongoose.models.Series || mongoose.model<ISeries>('Series', SeriesSchema);

export interface IScraperMeta extends Document {
  key: string;
  baseUrl: string;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalNewMoviesAdded: number;
  totalNewSeriesAdded: number;
  totalMoviesUpdated: number;
  totalEpisodesUpdated: number;
  lastRunResult?: any;
}

const ScraperMetaSchema = new Schema<IScraperMeta>(
  {
    key: { type: String, required: true, unique: true, index: true },
    baseUrl: { type: String, default: 'https://new8.hdhub4u.cl' },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
    totalNewMoviesAdded: { type: Number, default: 0 },
    totalNewSeriesAdded: { type: Number, default: 0 },
    totalMoviesUpdated: { type: Number, default: 0 },
    totalEpisodesUpdated: { type: Number, default: 0 },
    lastRunResult: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const ScraperMeta: Model<IScraperMeta> =
  mongoose.models.ScraperMeta || mongoose.model<IScraperMeta>('ScraperMeta', ScraperMetaSchema);

let isConnected = false;
let connectionPromise: Promise<void> | null = null;

export async function connectDb(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) return;
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONOGO_URI || process.env.MONGO_URI;
  if (!uri) {
    console.warn('⚠️ No MONOGO_URI found in environment; running without database.');
    return;
  }

  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, {
        dbName: 'movieTV',
        maxPoolSize: 20,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
      });
      isConnected = true;
      console.log('✅ Connected to MongoDB Atlas (movieTV) [Pool size: 5-20]');
    } catch (err: any) {
      connectionPromise = null;
      console.error('❌ Failed to connect to MongoDB Atlas:', err.message);
    }
  })();

  return connectionPromise;
}
