// services/pricingEngine.js
import Event from '../models/Event.js';
import BuyerOffer from '../models/BuyerOffer.js';
import Transaction from '../models/Transaction.js';

export async function calculateSuggestedPrice({ eventId, sections, maxPrice, quantity }) {
  // Analyze historical data, current offers, and market trends
  const event = await Event.findById(eventId);
  const activeOffers = await BuyerOffer.find({
    event: eventId,
    status: 'active',
    sections: { $in: sections }
  });
  
  const completedTransactions = await Transaction.find({
    event: eventId,
    section: { $in: sections }
  });
  
  // Complex algorithm considering:
  // - Time until event
  // - Section desirability
  // - Current offer competition
  // - Historical sale prices
  // - Market conditions
  
  // Simplified example
  const avgOfferPrice = activeOffers.reduce((sum, o) => sum + o.maxPrice, 0) / activeOffers.length || 0;
  const avgSalePrice = completedTransactions.reduce((sum, t) => sum + t.salePrice, 0) / completedTransactions.length || 0;
  
  const suggestedPrice = Math.max(avgOfferPrice * 1.1, avgSalePrice * 0.95);
  const probability = calculateAcceptanceProbability(suggestedPrice, event, sections);
  
  return {
    suggestedPrice: Math.min(suggestedPrice, maxPrice),
    probability,
    marketData: {
      avgOfferPrice,
      avgSalePrice,
      activeOffers: activeOffers.length
    }
  };
}

function calculateAcceptanceProbability(price, event, sections) {
  // Calculate probability based on price competitiveness
  // Returns percentage (0-100)
  return Math.min(95, Math.max(10, 50 + (price / event.marketStats.averagePrice - 1) * 100));
}