import { Router } from 'express';
import { iptvService } from '../services/iptvService';

export const channelRouter = Router();

// GET /api/channels/categories
channelRouter.get('/categories', (_req, res) => {
  const categories = iptvService.getCategories();
  res.json({ categories });
});

// GET /api/channels/refresh or POST /api/channels/refresh
channelRouter.all('/refresh', async (_req, res) => {
  await iptvService.refreshFromGitHub(true);
  const channels = iptvService.getChannels();
  res.json({
    success: true,
    message: 'Channels synced with GitHub in real time',
    total: channels.length,
    commitSha: iptvService.getLastCommitSha(),
    refreshedAt: iptvService.getLastFetchedAt(),
  });
});

// GET /api/channels?category=Sports&refresh=true
channelRouter.get('/', async (req, res) => {
  const category = req.query.category as string | undefined;
  const forceRefresh = req.query.refresh === 'true';

  if (forceRefresh) {
    await iptvService.refreshFromGitHub(true);
  }

  const channels = iptvService.getChannels(category);
  res.json({
    total: channels.length,
    category: category || 'All',
    commitSha: iptvService.getLastCommitSha(),
    refreshedAt: iptvService.getLastFetchedAt(),
    channels,
  });
});

// GET /api/channels/:id
channelRouter.get('/:id', (req, res) => {
  const channel = iptvService.getChannelById(req.params.id);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  res.json(channel);
});
