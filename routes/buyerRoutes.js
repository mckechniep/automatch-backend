// routes/buyerRoutes.js
import express from 'express';
import buyerOfferController from '../controllers/buyerOfferController.js';
import { protect, authorize, requireVerified } from '../middleware/auth.js';
import { validateOffer } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and buyer role
router.use(protect, authorize('buyer'));

// Buyer offer routes
router.post('/offers', requireVerified, validateOffer, buyerOfferController.createOffer);
router.get('/offers', buyerOfferController.getMyOffers);
router.delete('/offers/:id', buyerOfferController.cancelOffer);

// TODO: Add these controller methods
// router.get('/transactions', buyerOfferController.getMyTransactions);
// router.post('/transactions/:id/confirm-delivery', buyerOfferController.confirmDelivery);
// router.post('/transactions/:id/dispute', buyerOfferController.disputeTransaction);

export default router;