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
}

// Export an instance of the controller
export default new BuyerOfferController();