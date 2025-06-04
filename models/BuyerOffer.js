// models/BuyerOffer.js
import mongoose from 'mongoose';

const buyerOfferSchema = new mongoose.Schema({
  // References
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  
  // Offer details
  sections: [{
    type: String,
    required: true
  }], // Multiple sections buyer is willing to sit in
  
  maxPrice: {
    type: Number,
    required: true,
    min: 0
  },
  
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  
  // Pricing intelligence algo (needs work)
  suggestedPrice: Number, // From your "Better Likelihood" algorithm
  acceptanceProbability: Number, // Percentage likelihood
  
  // Payment
  paymentIntent: {
    stripePaymentIntentId: String,
    amount: Number,
    status: String, // 'pending', 'authorized', 'captured', 'cancelled'
    authorizedAt: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'matched', 'expired', 'cancelled', 'completed'],
    default: 'active',
    index: true
  },
  
  // Matching
  matchedListing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SellerListing'
  },
  matchedAt: Date,
  
  // Expiration
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  
  // Feature flags
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredUntil: Date,
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  lastViewedBy: [{
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: Date
  }]
}, {
  timestamps: true
});

// Compound indexes for efficient queries
buyerOfferSchema.index({ event: 1, status: 1, maxPrice: -1 });
buyerOfferSchema.index({ sections: 1, status: 1 });
buyerOfferSchema.index({ buyer: 1, status: 1 });

// Export the model
const BuyerOffer = mongoose.model('BuyerOffer', buyerOfferSchema);
export default BuyerOffer;