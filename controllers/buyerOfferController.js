// controllers/buyerOfferController.js
import BuyerOffer from '../models/BuyerOffer.js';
import Event from '../models/Event.js';
import stripe from '../config/stripe.js';
import { calculateSuggestedPrice } from '../services/pricingEngine.js';
import { checkForInstantMatch } from '../services/matchingService.js';

class BuyerOfferController {
  // Create a new buyer offer
  async createOffer(req, res) {
    try {
      const { eventId, sections, maxPrice, quantity } = req.body;
      const buyerId = req.user.id;
      
      // Validate event exists and is upcoming
      const event = await Event.findById(eventId);
      if (!event || event.status !== 'upcoming') {
        return res.status(400).json({ error: 'Invalid or past event' });
      }
      
      // Calculate suggested price using pricing algorithm
      const pricingSuggestion = await calculateSuggestedPrice({
        eventId,
        sections,
        maxPrice,
        quantity
      });
      
      // Create Stripe payment intent (authorize only)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: maxPrice * quantity * 100, // Convert to cents
        currency: 'usd',
        customer: req.user.buyerInfo.stripeCustomerId,
        capture_method: 'manual', // Don't capture until match
        metadata: {
          buyerId,
          eventId
        }
      });
      
      // Set expiration (default: 1 hour before event)
      const expiresAt = new Date(event.dateTime);
      expiresAt.setHours(expiresAt.getHours() - 1);
      
      // Create offer
      const offer = new BuyerOffer({
        buyer: buyerId,
        event: eventId,
        sections,
        maxPrice,
        quantity,
        suggestedPrice: pricingSuggestion.suggestedPrice,
        acceptanceProbability: pricingSuggestion.probability,
        paymentIntent: {
          stripePaymentIntentId: paymentIntent.id,
          amount: maxPrice * quantity,
          status: 'authorized',
          authorizedAt: new Date()
        },
        expiresAt
      });
      
      await offer.save();
      
      // Notify matching service for instant matches
      await checkForInstantMatch(offer);
      
      res.status(201).json({
        success: true,
        offer: await offer.populate('event')
      });
    } catch (error) {
      console.error('Create offer error:', error);
      res.status(500).json({ error: 'Failed to create offer' });
    }
  }
  
  // Get buyer's offers
  async getMyOffers(req, res) {
    try {
      const offers = await BuyerOffer.find({ 
        buyer: req.user.id 
      })
      .populate('event')
      .sort('-createdAt');
      
      res.json({ offers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch offers' });
    }
  }
  
  // Cancel an offer
  async cancelOffer(req, res) {
    try {
      const offer = await BuyerOffer.findOne({
        _id: req.params.id,
        buyer: req.user.id,
        status: 'active'
      });
      
      if (!offer) {
        return res.status(404).json({ error: 'Offer not found' });
      }
      
      // Cancel Stripe payment intent
      await stripe.paymentIntents.cancel(
        offer.paymentIntent.stripePaymentIntentId
      );
      
      offer.status = 'cancelled';
      offer.paymentIntent.status = 'cancelled';
      await offer.save();
      
      res.json({ success: true, message: 'Offer cancelled' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to cancel offer' });
    }
  }

  // Get buyer's transactions
  async getMyTransactions(req, res) {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      
      // Build query
      const query = { buyer: req.user.id };
      
      if (status) {
        query.deliveryStatus = status;
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Get transactions with related data
      const transactions = await Transaction.find(query)
        .populate('seller', 'email profile.firstName profile.lastName sellerInfo.businessName')
        .populate('event', 'name dateTime venue imageUrl')
        .populate('buyerOffer', 'sections maxPrice quantity')
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
      console.error('Get transactions error:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  }
  
  // Confirm ticket delivery
  async confirmDelivery(req, res) {
    try {
      const transaction = await Transaction.findOne({
        _id: req.params.id,
        buyer: req.user.id,
        deliveryStatus: 'transferred'
      });
      
      if (!transaction) {
        return res.status(404).json({ 
          error: 'Transaction not found or not ready for confirmation' 
        });
      }
      
      // Check if event hasn't passed yet (tickets should be confirmed before event)
      const event = await Event.findById(transaction.event);
      if (new Date() > new Date(event.dateTime)) {
        return res.status(400).json({ 
          error: 'Cannot confirm delivery after event has passed' 
        });
      }
      
      // Update transaction status
      transaction.deliveryStatus = 'confirmed';
      transaction.confirmedAt = new Date();
      
      // Release escrow to seller
      transaction.escrowStatus = 'released';
      transaction.escrowReleaseDate = new Date();
      
      await transaction.save();
      
      // Process seller payout
      await this.processSellerPayout(transaction);
      
      res.json({
        success: true,
        message: 'Delivery confirmed successfully',
        transaction
      });
    } catch (error) {
      console.error('Confirm delivery error:', error);
      res.status(500).json({ error: 'Failed to confirm delivery' });
    }
  }
  
  // Dispute a transaction
  async disputeTransaction(req, res) {
    try {
      const { reason, details } = req.body;
      
      // Validate dispute reason
      const validReasons = [
        'tickets_not_received',
        'invalid_tickets',
        'wrong_section',
        'wrong_quantity',
        'event_cancelled',
        'other'
      ];
      
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ 
          error: 'Invalid dispute reason' 
        });
      }
      
      const transaction = await Transaction.findOne({
        _id: req.params.id,
        buyer: req.user.id,
        deliveryStatus: { $in: ['pending', 'transferred'] }
      });
      
      if (!transaction) {
        return res.status(404).json({ 
          error: 'Transaction not found or cannot be disputed' 
        });
      }
      
      // Check if already disputed
      if (transaction.hasDispute) {
        return res.status(400).json({ 
          error: 'Transaction already has an active dispute' 
        });
      }
      
      // Check dispute time window (e.g., can't dispute after event)
      const event = await Event.findById(transaction.event);
      const eventDate = new Date(event.dateTime);
      const now = new Date();
      
      if (now > eventDate) {
        return res.status(400).json({ 
          error: 'Cannot dispute transaction after event date' 
        });
      }
      
      // Create dispute
      transaction.hasDispute = true;
      transaction.disputeReason = reason;
      transaction.disputeDetails = details;
      transaction.disputedAt = new Date();
      transaction.deliveryStatus = 'disputed';
      
      // Hold escrow
      transaction.escrowStatus = 'held';
      
      await transaction.save();
      
      // Notify seller and admin
      await this.notifyDisputeParties(transaction, reason, details);
      
      res.json({
        success: true,
        message: 'Dispute submitted successfully. Our team will review and contact you within 24 hours.',
        transaction
      });
    } catch (error) {
      console.error('Dispute transaction error:', error);
      res.status(500).json({ error: 'Failed to submit dispute' });
    }
  }
  
  // Helper method to process seller payout
  async processSellerPayout(transaction) {
    try {
      const seller = await User.findById(transaction.seller);
      
      // Create Stripe transfer to seller's connected account
      if (seller.sellerInfo.stripeConnectAccountId) {
        const transfer = await stripe.transfers.create({
          amount: Math.round(transaction.sellerPayout * 100), // Convert to cents
          currency: 'usd',
          destination: seller.sellerInfo.stripeConnectAccountId,
          transfer_group: `transaction_${transaction._id}`,
          metadata: {
            transactionId: transaction._id.toString(),
            eventId: transaction.event.toString()
          }
        });
        
        // Update transaction with transfer info
        transaction.stripeTransferId = transfer.id;
        transaction.payoutStatus = 'completed';
        await transaction.save();
      }
    } catch (error) {
      console.error('Payout processing error:', error);
      // Update payout status to failed
      transaction.payoutStatus = 'failed';
      await transaction.save();
      throw error;
    }
  }
  
  // Helper method to notify parties about dispute
  async notifyDisputeParties(transaction, reason, details) {
    // Import notification service
    const { sendDisputeNotificationToSeller, sendDisputeNotificationToAdmin } = await import('../services/notificationService.js');
    
    // Populate transaction data
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate('buyer seller event');
    
    // Notify seller
    await sendDisputeNotificationToSeller(populatedTransaction, reason, details);
    
    // Notify admin/support team
    await sendDisputeNotificationToAdmin(populatedTransaction, reason, details);
  }
}

// Export an instance of the controller
export default new BuyerOfferController();


