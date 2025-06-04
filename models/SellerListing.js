// models/SellerListing.js
import mongoose from 'mongoose';

const sellerListingSchema = new mongoose.Schema({
  // References
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  
  // Ticket details
  section: {
    type: String,
    required: true
  },
  row: String,
  seats: [String], // Array of seat numbers
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Pricing
  askingPrice: Number, // Can be hidden from buyers initially
  minimumAcceptablePrice: Number, // For auto-accept logic
  
  // Visibility and automation
  isLive: {
    type: Boolean,
    default: false
  },
  goLiveAt: Date, // Scheduled visibility
  
  autoSell: {
    enabled: {
      type: Boolean,
      default: false
    },
    triggerTime: Date, // X hours before event
    acceptHighestOffer: {
      type: Boolean,
      default: true
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'matched', 'sold', 'expired', 'cancelled'],
    default: 'draft',
    index: true
  },
  
  // External references
  externalListingId: String, // SkyBox/AutoProcessor ID
  ticketmasterTransferId: String,
  
  // Delivery
  deliveryMethod: {
    type: String,
    enum: ['ticketmaster', 'axs', 'pdf', 'willcall', 'other'],
    required: true
  },
  deliveryDetails: {
    transferEmail: String,
    barcodes: [String],
    notes: String
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  offerCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
sellerListingSchema.index({ event: 1, status: 1, section: 1 });
sellerListingSchema.index({ seller: 1, status: 1 });
sellerListingSchema.index({ goLiveAt: 1, isLive: 1 });

// Export the model
const SellerListing = mongoose.model('SellerListing', sellerListingSchema);
export default SellerListing;