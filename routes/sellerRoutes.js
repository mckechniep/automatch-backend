// routes/sellerRoutes.js
import express from 'express';
import sellerListingController from '../controllers/sellerListingController.js';
import { protect, authorize, requireVerified, requireStripeConnect } from '../middleware/auth.js';
import { validateListing, validateBulkUpload } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and seller role
router.use(protect, authorize('seller'));

// View buyer offers
router.get('/events/:eventId/offers', requireVerified, sellerListingController.viewEventOffers);

// Accept offers (requires Stripe connected)
router.post('/offers/:offerId/accept', requireVerified, requireStripeConnect, sellerListingController.acceptOffer);

// Listing management
router.post('/listings/bulk', requireVerified, validateBulkUpload, sellerListingController.bulkUpload);

// Listing management routes
router.post('/listings', requireVerified, validateListing, sellerListingController.createListing);
router.get('/listings', sellerListingController.getMyListings);
router.put('/listings/:id', sellerListingController.updateListing);
router.delete('/listings/:id', sellerListingController.deleteListing);
router.post('/listings/:id/go-live', sellerListingController.goLive);

// Transaction management
router.get('/transactions', sellerListingController.getMyTransactions);
router.post('/transactions/:id/transfer-tickets', requireStripeConnect, sellerListingController.transferTickets);

// Analytics
router.get('/analytics/summary', sellerListingController.getAnalyticsSummary);

export default router;