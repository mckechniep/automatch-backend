// models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Basic user info
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    enum: ['buyer', 'seller'],
    default: 'buyer'
  },
  
  // Profile information
  profile: {
    firstName: String,
    lastName: String,
    phone: String,
    dateOfBirth: Date,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String
    }
  },
  
  // Seller-specific fields
  sellerInfo: {
    businessName: String,
    businessType: {
      type: String,
      enum: ['individual', 'broker', 'enterprise']
    },
    volumeTier: {
      type: String,
      enum: ['standard', 'silver', 'gold', 'platinum'],
      default: 'standard'
    },
    feePercentage: {
      type: Number,
      default: 10 // 10% standard fee, can edit for loyaltly programs
    },
    stripeConnectAccountId: String,
    payoutSchedule: {
      type: String,
      enum: ['daily', 'weekly', 'net-15'],
      default: 'daily'
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  
  // Buyer-specific fields
  buyerInfo: {
    stripeCustomerId: String,
    savedPaymentMethods: [{
      id: String,
      last4: String,
      brand: String,
      isDefault: Boolean
    }]
  },
  
  // Security and status
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Fraud prevention
  trustScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  flaggedForReview: {
    type: Boolean,
    default: false
  },
  suspendedUntil: Date,
  
  // Timestamps
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Password hashing middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Password comparison method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Export the model
const User = mongoose.model('User', userSchema);
export default User;