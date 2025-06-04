// routes/eventRoutes.js
import express from 'express';
import eventController from '../controllers/eventController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes - no authentication required
router.get('/', eventController.getEvents);
router.get('/:id', eventController.getEvent);
router.get('/search', eventController.searchEvents);

// Protected routes - require authentication
router.use(protect);

// Get market data for an event
router.get('/:id/market-data', eventController.getMarketData);

export default router;