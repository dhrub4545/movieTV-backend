import os from 'os';
import { app } from './app';
import { connectDb } from './db';

const PORT = process.env.PORT || 5000;

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

import { contentService } from './services/contentService';
import { scraperPipelineService } from './services/scraperPipelineService';

// Connect to MongoDB Atlas & start automated 10-minute scraper pipeline
connectDb()
  .then(() => {
    scraperPipelineService.setContentService(contentService);
    scraperPipelineService.startScheduler();
  })
  .catch((e) => console.error('MongoDB startup connection error:', e));

const server = app.listen(PORT, () => {
  const localIps = getLocalIpAddresses();
  console.log(`=================================================`);
  console.log(`🚀 MovieTV Backend is RUNNING with MongoDB & GitHub IPTV!`);
  console.log(`📡 Local Host:       http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`📺 Android TV URL:   http://${localIps[0]}:${PORT}`);
  }
  console.log(`📱 Android Emulator: http://10.0.2.2:${PORT}`);
  console.log(`⚡ Health Check:     http://localhost:${PORT}/api/health`);
  console.log(`🎬 Home Feed:        http://localhost:${PORT}/api/feed/home`);
  console.log(`🎬 Movies Feed:      http://localhost:${PORT}/api/feed/movies`);
  console.log(`📺 Series Feed:      http://localhost:${PORT}/api/feed/series`);
  console.log(`🏏 Live TV Channels: http://localhost:${PORT}/api/channels`);
  console.log(`🤖 Scraper Status:   http://localhost:${PORT}/api/scraper/status`);
  console.log(`=================================================`);
});

export default server;
