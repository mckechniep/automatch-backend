// controllers/authController.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendVerificationEmail } from '../services/emailService.js';
import crypto from 'crypto';

class AuthController {
  // Generate JWT token
  generateToken(userId) {
    return jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );
  }

  // Create and send JWT token in response
  sendTokenResponse(user, statusCode, res) {
    const token = this.generateToken(user._id);
    
    // Remove password from output
    user.password = undefined;
    
    res.status(statusCode).json({
      success: true,
      token,
      user
    });
  }

  // User signup
  async signup(req, res) {
    try {
      const { email, password, userType, firstName, lastName, phone } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ 
          success: false,
          error: 'Email already registered' 
        });
      }
      
      // Create verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Create user
      const user = await User.create({
        email,
        password,
        userType,
        profile: {
          firstName,
          lastName,
          phone
        },
        verificationToken
      });
      
      // Send verification email
      await sendVerificationEmail(user.email, verificationToken);
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      
      // Send token response
      this.sendTokenResponse(user, 201, res);
      
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to create account' 
      });
    }
  }

  // User signin
  async signin(req, res) {
    try {
      const { email, password } = req.body;
      
      // Validate email & password
      if (!email || !password) {
        return res.status(400).json({ 
          success: false,
          error: 'Please provide email and password' 
        });
      }
      
      // Check for user
      const user = await User.findOne({ email }).select('+password');
      
      if (!user) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid credentials' 
        });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ 
          success: false,
          error: 'Account has been deactivated' 
        });
      }
      
      // Check if user is suspended
      if (user.suspendedUntil && user.suspendedUntil > new Date()) {
        return res.status(401).json({ 
          success: false,
          error: `Account suspended until ${user.suspendedUntil.toLocaleDateString()}` 
        });
      }
      
      // Check password
      const isPasswordMatch = await user.comparePassword(password);
      
      if (!isPasswordMatch) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid credentials' 
        });
      }
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
      
      // Send token response
      this.sendTokenResponse(user, 200, res);
      
    } catch (error) {
      console.error('Signin error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to sign in' 
      });
    }
  }

  // Get current user
  async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      res.status(200).json({
        success: true,
        user
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to get user data' 
      });
    }
  }

  // Sign out (client-side token removal, but we can add token blacklisting)
  async signout(req, res) {
    // In a production app, you might want to implement token blacklisting
    // For now, we'll just send a success response
    res.status(200).json({
      success: true,
      message: 'Signed out successfully'
    });
  }

  // Verify email
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      
      const user = await User.findOne({ 
        verificationToken: token 
      });
      
      if (!user) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid verification token' 
        });
      }
      
      user.isVerified = true;
      user.verificationToken = undefined;
      await user.save();
      
      res.status(200).json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to verify email' 
      });
    }
  }

  // Forgot password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      
      const user = await User.findOne({ email });
      
      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: 'No user found with that email' 
        });
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      user.passwordResetToken = resetToken;
      user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
      
      await user.save();
      
      // Send reset email
      await sendPasswordResetEmail(user.email, resetToken);
      
      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to send reset email' 
      });
    }
  }

  // Reset password
  async resetPassword(req, res) {
    try {
      const { token } = req.params;
      const { password } = req.body;
      
      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: Date.now() }
      });
      
      if (!user) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid or expired reset token' 
        });
      }
      
      // Set new password
      user.password = password;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      
      await user.save();
      
      // Send token response
      this.sendTokenResponse(user, 200, res);
      
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to reset password' 
      });
    }
  }
}

// Export an instance of the controller
export default new AuthController();