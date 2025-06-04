// routes/authRoutes.js
import express from 'express';
import authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateSignup, validateSignin } from '../middleware/validation.js';

const router = express.Router();

// Public routes
router.post('/signup', validateSignup, authController.signup);
router.post('/signin', validateSignin, authController.signin);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// Protected routes
router.get('/me', protect, authController.getMe);
router.post('/signout', protect, authController.signout);

export default router;