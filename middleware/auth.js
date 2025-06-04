// middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Protect routes - require authentication
export const protect = async (req, res, next) => {
  let token;
  
  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Make sure token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User no longer exists'
      });
    }
    
    // Check if user is active
    if (!req.user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account has been deactivated'
      });
    }
    
    // Check if user is suspended
    if (req.user.suspendedUntil && req.user.suspendedUntil > new Date()) {
      return res.status(401).json({
        success: false,
        error: `Account suspended until ${req.user.suspendedUntil.toLocaleDateString()}`
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }
};

// Grant access to specific user types
export const authorize = (...userTypes) => {
  return (req, res, next) => {
    if (!userTypes.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: `User type ${req.user.userType} is not authorized to access this route`
      });
    }
    next();
  };
};

// Check if user is verified (for certain actions)
export const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return res.status(403).json({
      success: false,
      error: 'Please verify your email address to access this feature'
    });
  }
  next();
};

// Check if seller has Stripe connected (for payouts)
export const requireStripeConnect = (req, res, next) => {
  if (req.user.userType === 'seller' && !req.user.sellerInfo.stripeConnectAccountId) {
    return res.status(403).json({
      success: false,
      error: 'Please connect your Stripe account to access this feature'
    });
  }
  next();
};