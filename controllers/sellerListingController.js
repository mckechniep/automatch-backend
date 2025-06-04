// controllers/sellerListingController.js
import mongoose from 'mongoose';
import SellerListing from '../models/SellerListing.js';
import BuyerOffer from '../models/BuyerOffer.js';
import Transaction from '../models/Transaction.js';
import stripe from '../config/stripe.js';
import { notifyMatch } from '../services/notificationService.js';

class SellerListingController {
  // View offers for an event
  async viewEventOffers(req, res) {
    try {
      const { eventId } = req.params;
      const { sections, minPrice, sortBy = 'maxPrice' } = req.query;
      
      // Build query
      const query = {
        event: eventId,
        status: 'active'
      };
      
      if (sections) {
        query.sections = { $in: sections.split(',') };
      }
      
      if (minPrice) {
        query.maxPrice = { $gte: parseFloat(minPrice) };
      }
      
      // Get offers with analytics update
      const offers = await BuyerOffer.find(query)
        .populate('buyer', 'profile.firstName profile.lastName trustScore')
        .sort(sortBy === 'maxPrice' ? '-maxPrice' : '-createdAt');
      
      // Update view analytics
      await BuyerOffer.updateMany(
        { _id: { $in: offers.map(o => o._id) } },
        {
          $inc: { viewCount: 1 },
          $push: {
            lastViewedBy: {
              seller: req.user.id,
              viewedAt: new Date()
            }
          }
        }
      );
      
      res.json({ offers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch offers' });
    }
  }
  
  // Accept a buyer's offer
  async acceptOffer(req, res) {
    try {
      const { offerId } = req.params;
      const { section, row, seats, deliveryMethod, deliveryDetails } = req.body;
      
      // Start transaction
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Get and lock the offer
        const offer = await BuyerOffer.findById(offerId)
          .session(session)
          .populate('event buyer');
        
        if (!offer || offer.status !== 'active') {
          throw new Error('Offer not available');
        }
        
        // Verify section matches offer
        if (!offer.sections.includes(section)) {
          throw new Error('Section not in buyer preferences');
        }
        
        // Create listing record (for history)
        const listing = new SellerListing({
          seller: req.user.id,
          event: offer.event._id,
          section,
          row,
          seats,
          quantity: offer.quantity,
          askingPrice: offer.maxPrice,
          status: 'matched',
          deliveryMethod,
          deliveryDetails
        });
        await listing.save({ session });
        
        // Update offer status
        offer.status = 'matched';
        offer.matchedListing = listing._id;
        offer.matchedAt = new Date();
        await offer.save({ session });
        
        // Create transaction
        const transaction = new Transaction({
          buyer: offer.buyer._id,
          seller: req.user.id,
          buyerOffer: offer._id,
          sellerListing: listing._id,
          event: offer.event._id,
          quantity: offer.quantity,
          section,
          row,
          seats,
          salePrice: offer.maxPrice,
          buyerPaid: offer.maxPrice,
          sellerFee: offer.maxPrice * 0.1, // 10% fee
          sellerPayout: offer.maxPrice * 0.9,
          stripePaymentIntentId: offer.paymentIntent.stripePaymentIntentId,
          deliveryMethod
        });
        await transaction.save({ session });
        
        // Capture payment
        await stripe.paymentIntents.capture(
          offer.paymentIntent.stripePaymentIntentId
        );
        
        await session.commitTransaction();
        
        // Send notifications
        await notifyMatch(transaction);
        
        res.json({
          success: true,
          transaction: await transaction.populate('event buyer')
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error('Accept offer error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Bulk upload listings
  async bulkUpload(req, res) {
    try {
      const { listings } = req.body; // Array of listing objects
      const sellerId = req.user.id;
      
      const createdListings = await Promise.all(
        listings.map(async (listing) => {
          const newListing = new SellerListing({
            ...listing,
            seller: sellerId,
            status: listing.goLiveAt ? 'draft' : 'active',
            isLive: !listing.goLiveAt
          });
          
          return await newListing.save();
        })
      );
      
      res.json({
        success: true,
        created: createdListings.length,
        listings: createdListings
      });
    } catch (error) {
      res.status(500).json({ error: 'Bulk upload failed' });
    }
  }
}

// Export an instance of the controller
export default new SellerListingController();