// services/matchingService.js
import SellerListing from '../models/SellerListing.js';
import { createMatch } from './transactionService.js';

export async function checkForInstantMatch(buyerOffer) {
  // Find matching seller listings
  const matchingListings = await SellerListing.find({
    event: buyerOffer.event,
    section: { $in: buyerOffer.sections },
    status: 'active',
    isLive: true,
    quantity: { $lte: buyerOffer.quantity },
    minimumAcceptablePrice: { $lte: buyerOffer.maxPrice }
  }).sort('minimumAcceptablePrice');
  
  if (matchingListings.length > 0) {
    // Auto-match with best listing
    const bestListing = matchingListings[0];
    await createMatch(buyerOffer, bestListing);
  }
}

export async function processAutoSellListings() {
  // Run periodically to check for auto-sell triggers
  const now = new Date();
  const listingsToProcess = await SellerListing.find({
    'autoSell.enabled': true,
    'autoSell.triggerTime': { $lte: now },
    status: 'active'
  });
  
  for (const listing of listingsToProcess) {
    await findBestOfferForListing(listing);
  }
}

async function findBestOfferForListing(listing) {
  // Find best matching offer for a listing
  const offers = await BuyerOffer.find({
    event: listing.event,
    sections: listing.section,
    status: 'active',
    quantity: { $gte: listing.quantity }
  }).sort('-maxPrice');
  
  if (offers.length > 0 && listing.autoSell.acceptHighestOffer) {
    await createMatch(offers[0], listing);
  }
}