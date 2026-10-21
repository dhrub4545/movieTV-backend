import { Router } from 'express';
import { iptvService } from '../services/iptvService';

export const channelRouter = Router();

// GET /api/channels/categories
channelRouter.get('/categories', (_req, res) => {
  const categories = iptvService.getCategories();
  res.json({ categories });
});

// GET /api/channels?category=Sports
channelRouter.get('/', (req, res) => {
  const category = req.query.category as string | undefined;
  const channels = iptvService.getChannels(category);
  res.json({
    total: channels.length,
    category: category || 'All',
    channels
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
