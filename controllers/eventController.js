// controllers/eventController.js
import Event from '../models/Event.js';
import BuyerOffer from '../models/BuyerOffer.js';
import SellerListing from '../models/SellerListing.js';

class EventController {
  // Get all events with filters
  async getEvents(req, res) {
    try {
      const {
        type,
        city,
        startDate,
        endDate,
        page = 1,
        limit = 20,
        sort = 'dateTime'
      } = req.query;
      
      // Build query
      const query = { status: 'upcoming' };
      
      if (type) {
        query.type = type;
      }
      
      if (city) {
        query['venue.city'] = new RegExp(city, 'i');
      }
      
      if (startDate || endDate) {
        query.dateTime = {};
        if (startDate) query.dateTime.$gte = new Date(startDate);
        if (endDate) query.dateTime.$lte = new Date(endDate);
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      
      // Execute query
      const events = await Event.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip(skip)
        .select('-sections'); // Exclude detailed section data for list view
      
      // Get total count
      const total = await Event.countDocuments(query);
      
      res.json({
        success: true,
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch events'
      });
    }
  }
  
  // Get single event with market data
  async getEvent(req, res) {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return res.status(404).json({
          success: false,
          error: 'Event not found'
        });
      }
      
      res.json({
        success: true,
        event
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch event'
      });
    }
  }
  
  // Search events
  async searchEvents(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        });
      }
      
      // Search in name, performers, venue name
      const events = await Event.find({
        status: 'upcoming',
        $or: [
          { name: new RegExp(q, 'i') },
          { performers: new RegExp(q, 'i') },
          { 'venue.name': new RegExp(q, 'i') }
        ]
      })
      .limit(10)
      .select('name dateTime venue type imageUrl');
      
      res.json({
        success: true,
        events
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Search failed'
      });
    }
  }
  
  // Get market data for an event
  async getMarketData(req, res) {
    try {
      const eventId = req.params.id;
      
      // Get active offers
      const activeOffers = await BuyerOffer.find({
        event: eventId,
        status: 'active'
      }).select('sections maxPrice quantity createdAt');
      
      // Get active listings
      const activeListings = await SellerListing.find({
        event: eventId,
        status: 'active',
        isLive: true
      }).select('section askingPrice quantity createdAt');
      
      // Calculate market statistics
      const offerPrices = activeOffers.map(o => o.maxPrice);
      const listingPrices = activeListings.filter(l => l.askingPrice).map(l => l.askingPrice);
      
      const marketData = {
        offers: {
          count: activeOffers.length,
          totalQuantity: activeOffers.reduce((sum, o) => sum + o.quantity, 0),
          avgPrice: offerPrices.length ? offerPrices.reduce((a, b) => a + b, 0) / offerPrices.length : 0,
          maxPrice: offerPrices.length ? Math.max(...offerPrices) : 0,
          minPrice: offerPrices.length ? Math.min(...offerPrices) : 0
        },
        listings: {
          count: activeListings.length,
          totalQuantity: activeListings.reduce((sum, l) => sum + l.quantity, 0),
          avgPrice: listingPrices.length ? listingPrices.reduce((a, b) => a + b, 0) / listingPrices.length : 0,
          maxPrice: listingPrices.length ? Math.max(...listingPrices) : 0,
          minPrice: listingPrices.length ? Math.min(...listingPrices) : 0
        },
        lastUpdated: new Date()
      };
      
      // Update event market stats
      await Event.findByIdAndUpdate(eventId, {
        marketStats: {
          averagePrice: (marketData.offers.avgPrice + marketData.listings.avgPrice) / 2,
          lowestPrice: Math.min(marketData.offers.minPrice, marketData.listings.minPrice),
          highestPrice: Math.max(marketData.offers.maxPrice, marketData.listings.maxPrice),
          totalListings: marketData.listings.count,
          lastUpdated: new Date()
        }
      });
      
      res.json({
        success: true,
        marketData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch market data'
      });
    }
  }
}

// Export an instance of the controller
export default new EventController();