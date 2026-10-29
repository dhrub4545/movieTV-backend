const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { extractDirectM3u8 } = require('../dist/services/m3u8Extractor');

(async () => {
  try {
    const uri = process.env.MONOGO_URI || process.env.MONGO_URI;
    await mongoose.connect(uri, { dbName: 'movieTV' });
    console.log('✅ Connected to MongoDB Atlas');

    const Movie = mongoose.model('Movie', new mongoose.Schema({
      title: String,
      streams: Object
    }), 'movies');

    const Series = mongoose.model('Series', new mongoose.Schema({
      title: String,
      seasons: Array
    }), 'series');

    // 1. Unset all player_2_m3u8_url from Movies
    const mRes = await Movie.updateMany(
      { 'streams.player_2_m3u8_url': { $exists: true, $ne: '' } },
      { $set: { 'streams.player_2_m3u8_url': '' } }
    );
    console.log(`🧹 Cleared stale player_2_m3u8_url from ${mRes.modifiedCount} movies.`);

    // 2. Unset all player_2_m3u8_url from Series episodes
    const seriesList = await Series.find({ 'seasons.episodes.player_2_m3u8_url': { $exists: true, $ne: '' } });
    let epClearedCount = 0;
    for (const s of seriesList) {
      let changed = false;
      if (s.seasons) {
        for (const season of s.seasons) {
          if (season.episodes) {
            for (const ep of season.episodes) {
              if (ep.player_2_m3u8_url) {
                ep.player_2_m3u8_url = '';
                changed = true;
                epClearedCount++;
              }
            }
          }
        }
      }
      if (changed) {
        await Series.updateOne({ _id: s._id }, { $set: { seasons: s.seasons } });
      }
    }
    console.log(`🧹 Cleared stale player_2_m3u8_url from ${epClearedCount} series episodes.`);

    // 3. Check and refresh "Tu Hai Meri Kiran" specifically
    const kiran = await Movie.findOne({ title: /tu hai meri kiran/i });
    if (kiran && kiran.streams && kiran.streams.watch_embed) {
      console.log('Extracting fresh link for Tu Hai Meri Kiran from watch_embed...');
      const fresh = await extractDirectM3u8(kiran.streams.watch_embed);
      if (fresh) {
        kiran.streams.m3u8_url = fresh;
        kiran.streams.player_2_m3u8_url = '';
        await Movie.updateOne({ _id: kiran._id }, { $set: { streams: kiran.streams } });
        console.log('✅ Updated Tu Hai Meri Kiran m3u8_url:', fresh);
      }
    }

    console.log('🎉 Cleanup completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  }
})();

