// models/Event.js
import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  // Basic event info
  externalId: String, // ID from Ticketmaster/AXS API
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['sports', 'concert', 'theater', 'other'],
    required: true
  },
  
  // Event details
  venue: {
    name: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
    latitude: Number,
    longitude: Number
  },
  
  dateTime: {
    type: Date,
    required: true,
    index: true
  },
  
  // Seating information
  sections: [{
    name: String,
    rows: [String],
    priceRange: {
      min: Number,
      max: Number
    }
  }],
  
  // Market data
  marketStats: {
    averagePrice: Number,
    lowestPrice: Number,
    highestPrice: Number,
    totalListings: Number,
    lastUpdated: Date
  },
  
  // Status
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  
  // Metadata
  imageUrl: String,
  performers: [String],
  category: String,
  subCategory: String
}, {
  timestamps: true
});

// Index for efficient queries
eventSchema.index({ dateTime: 1, status: 1 });
eventSchema.index({ 'venue.city': 1, dateTime: 1 });

// Export the model
const Event = mongoose.model('Event', eventSchema);
export default Event;