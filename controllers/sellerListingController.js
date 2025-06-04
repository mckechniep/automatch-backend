// controllers/sellerListingController.js
import mongoose from 'mongoose';
import SellerListing from '../models/SellerListing.js';
import BuyerOffer from '../models/BuyerOffer.js';
import Transaction from '../models/Transaction.js';
import Event from '../models/Event.js';
import stripe from '../config/stripe.js';
import { notifyMatch } from '../services/notificationService.js';
import { AppError } from '../middleware/errorHandler.js';

class SellerListingController {
  // View offers for an event (EXISTING)
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
  
  // Accept a buyer's offer (EXISTING)
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
  
  // Bulk upload listings (EXISTING)
  async bulkUpload(req, res) {
    try {
      const { listings } = req.body;
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

  // NEW: Create a single listing
  async createListing(req, res) {
    try {
      const {
        eventId,
        section,
        row,
        seats,
        quantity,
        askingPrice,
        minimumAcceptablePrice,
        deliveryMethod,
        deliveryDetails,
        goLiveAt,
        autoSell
      } = req.body;

      // Verify event exists and is upcoming
      const event = await Event.findById(eventId);
      if (!event || event.status !== 'upcoming') {
        throw new AppError('Invalid or past event', 400);
      }

      // Create listing
      const listing = new SellerListing({
        seller: req.user.id,
        event: eventId,
        section,
        row,
        seats,
        quantity,
        askingPrice,
        minimumAcceptablePrice,
        deliveryMethod,
        deliveryDetails,
        status: goLiveAt ? 'draft' : 'active',
        isLive: !goLiveAt,
        goLiveAt,
        autoSell
      });

      await listing.save();

      res.status(201).json({
        success: true,
        listing: await listing.populate('event')
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ 
        error: error.message || 'Failed to create listing' 
      });
    }
  }

  // NEW: Get seller's listings
  async getMyListings(req, res) {
    try {
      const { status, eventId, page = 1, limit = 20 } = req.query;
      
      // Build query
      const query = { seller: req.user.id };
      
      if (status) {
        query.status = status;
      }
      
      if (eventId) {
        query.event = eventId;
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get listings
      const listings = await SellerListing.find(query)
        .populate('event', 'name dateTime venue')
        .sort('-createdAt')
        .limit(limit * 1)
        .skip(skip);
      
      // Get total count
      const total = await SellerListing.countDocuments(query);
      
      res.json({
        success: true,
        listings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch listings' });
    }
  }

  // NEW: Update a listing
  async updateListing(req, res) {
    try {
      const listing = await SellerListing.findOne({
        _id: req.params.id,
        seller: req.user.id
      });
      
      if (!listing) {
        throw new AppError('Listing not found', 404);
      }
      
      // Can't update if already matched or sold
      if (['matched', 'sold'].includes(listing.status)) {
        throw new AppError('Cannot update listing in current status', 400);
      }
      
      // Update allowed fields
      const allowedUpdates = [
        'section', 'row', 'seats', 'quantity',
        'askingPrice', 'minimumAcceptablePrice',
        'deliveryMethod', 'deliveryDetails',
        'goLiveAt', 'autoSell'
      ];
      
      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          listing[field] = req.body[field];
        }
      });
      
      // Update status based on goLiveAt
      if (req.body.goLiveAt) {
        listing.status = 'draft';
        listing.isLive = false;
      }
      
      await listing.save();
      
      res.json({
        success: true,
        listing: await listing.populate('event')
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ 
        error: error.message || 'Failed to update listing' 
      });
    }
  }

  // NEW: Delete a listing
  async deleteListing(req, res) {
    try {
      const listing = await SellerListing.findOne({
        _id: req.params.id,
        seller: req.user.id
      });
      
      if (!listing) {
        throw new AppError('Listing not found', 404);
      }
      
      // Can't delete if already matched or sold
      if (['matched', 'sold'].includes(listing.status)) {
        throw new AppError('Cannot delete listing in current status', 400);
      }
      
      // Soft delete by updating status
      listing.status = 'cancelled';
      await listing.save();
      
      res.json({
        success: true,
        message: 'Listing deleted successfully'
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ 
        error: error.message || 'Failed to delete listing' 
      });
    }
  }

  // NEW: Make a listing go live
  async goLive(req, res) {
    try {
      const listing = await SellerListing.findOne({
        _id: req.params.id,
        seller: req.user.id,
        status: 'draft'
      });
      
      if (!listing) {
        throw new AppError('Draft listing not found', 404);
      }
      
      // Check if event is still upcoming
      const event = await Event.findById(listing.event);
      if (event.status !== 'upcoming') {
        throw new AppError('Event has already passed', 400);
      }
      
      // Make listing live
      listing.status = 'active';
      listing.isLive = true;
      listing.goLiveAt = new Date();
      
      await listing.save();
      
      // Check for instant matches
      await checkForInstantMatchForListing(listing);
      
      res.json({
        success: true,
        listing: await listing.populate('event'),
        message: 'Listing is now live'
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ 
        error: error.message || 'Failed to make listing live' 
      });
    }
  }

  // NEW: Get seller's transactions
  async getMyTransactions(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      
      // Build query
      const query = { seller: req.user.id };
      
      if (status) {
        query.deliveryStatus = status;
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get transactions
      const transactions = await Transaction.find(query)
        .populate('buyer', 'email profile.firstName profile.lastName')
        .populate('event', 'name dateTime venue')
        .sort('-createdAt')
        .limit(limit * 1)
        .skip(skip);
      
      // Get total count
      const total = await Transaction.countDocuments(query);
      
      res.json({
        success: true,
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  }

  // NEW: Transfer tickets to buyer
  async transferTickets(req, res) {
    try {
      const { transferConfirmation, notes } = req.body;
      
      const transaction = await Transaction.findOne({
        _id: req.params.id,
        seller: req.user.id,
        deliveryStatus: 'pending'
      });
      
      if (!transaction) {
        throw new AppError('Transaction not found or already transferred', 404);
      }
      
      // Update transaction
      transaction.deliveryStatus = 'transferred';
      transaction.transferredAt = new Date();
      transaction.notes = notes;
      
      // If Ticketmaster transfer, store confirmation
      if (transaction.deliveryMethod === 'ticketmaster' && transferConfirmation) {
        transaction.ticketmasterTransferId = transferConfirmation;
      }
      
      await transaction.save();
      
      // Notify buyer
      await notifyBuyerOfTransfer(transaction);
      
      res.json({
        success: true,
        transaction,
        message: 'Tickets transferred successfully'
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ 
        error: error.message || 'Failed to transfer tickets' 
      });
    }
  }

  // NEW: Get analytics summary for seller
  async getAnalyticsSummary(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const sellerId = req.user.id;
      
      // Date range query
      const dateQuery = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) dateQuery.$lte = new Date(endDate);
      
      // Get all transactions
      const transactions = await Transaction.find({
        seller: sellerId,
        ...(startDate || endDate ? { createdAt: dateQuery } : {})
      });
      
      // Calculate analytics
      const analytics = {
        overview: {
          totalSales: transactions.length,
          totalRevenue: transactions.reduce((sum, t) => sum + t.salePrice, 0),
          totalPayout: transactions.reduce((sum, t) => sum + t.sellerPayout, 0),
          totalFees: transactions.reduce((sum, t) => sum + t.sellerFee, 0),
          averageSalePrice: transactions.length ? 
            transactions.reduce((sum, t) => sum + t.salePrice, 0) / transactions.length : 0
        },
        byStatus: {
          pending: transactions.filter(t => t.deliveryStatus === 'pending').length,
          transferred: transactions.filter(t => t.deliveryStatus === 'transferred').length,
          confirmed: transactions.filter(t => t.deliveryStatus === 'confirmed').length,
          disputed: transactions.filter(t => t.hasDispute).length
        },
        listings: {
          active: await SellerListing.countDocuments({ 
            seller: sellerId, 
            status: 'active' 
          }),
          draft: await SellerListing.countDocuments({ 
            seller: sellerId, 
            status: 'draft' 
          }),
          totalViews: await SellerListing.aggregate([
            { $match: { seller: mongoose.Types.ObjectId(sellerId) } },
            { $group: { _id: null, total: { $sum: '$viewCount' } } }
          ]).then(result => result[0]?.total || 0)
        }
      };
      
      res.json({
        success: true,
        analytics,
        period: {
          startDate: startDate || 'all-time',
          endDate: endDate || 'present'
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }
}

// Helper function to check for instant matches when listing goes live
async function checkForInstantMatchForListing(listing) {
  const matchingOffers = await BuyerOffer.find({
    event: listing.event,
    sections: listing.section,
    status: 'active',
    quantity: { $gte: listing.quantity },
    maxPrice: { $gte: listing.minimumAcceptablePrice || listing.askingPrice }
  }).sort('-maxPrice');
  
  if (matchingOffers.length > 0 && listing.autoSell?.enabled) {
    // Auto-match with highest offer
    const bestOffer = matchingOffers[0];
    // Implement auto-match logic here
  }
}

// Helper function to notify buyer of ticket transfer
async function notifyBuyerOfTransfer(transaction) {
  // Implement notification logic
  // This could be email, in-app notification, SMS, etc.
}

// Export an instance of the controller
export default new SellerListingController();