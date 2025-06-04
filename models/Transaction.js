// models/Transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  // References
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerOffer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BuyerOffer',
    required: true
  },
  sellerListing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SellerListing'
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  
  // Transaction details
  quantity: Number,
  section: String,
  row: String,
  seats: [String],
  
  // Financial
  salePrice: {
    type: Number,
    required: true
  },
  buyerPaid: Number, // Should equal salePrice
  sellerFee: Number, // 10% or volume-based
  sellerPayout: Number, // salePrice - sellerFee
  
  // Payment processing
  stripePaymentIntentId: String,
  stripeTransferId: String,
  paymentStatus: {
    type: String,
    enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'],
    default: 'pending'
  },
  payoutStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Delivery tracking
  deliveryStatus: {
    type: String,
    enum: ['pending', 'transferred', 'confirmed', 'disputed', 'failed'],
    default: 'pending'
  },
  deliveryMethod: String,
  transferredAt: Date,
  confirmedAt: Date,
  
  // Escrow
  escrowReleaseDate: Date,
  escrowStatus: {
    type: String,
    enum: ['held', 'released', 'refunded'],
    default: 'held'
  },
  
  // Dispute handling
  hasDispute: {
    type: Boolean,
    default: false
  },
  disputeReason: String,
  disputeResolution: String,
  
  // Metadata
  notes: String,
  adminNotes: String
}, {
  timestamps: true
});

// Indexes for reporting and queries
transactionSchema.index({ buyer: 1, createdAt: -1 });
transactionSchema.index({ seller: 1, createdAt: -1 });
transactionSchema.index({ event: 1, deliveryStatus: 1 });
transactionSchema.index({ payoutStatus: 1, seller: 1 });

// Export the model
const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;