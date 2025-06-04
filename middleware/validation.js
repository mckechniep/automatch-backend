// middleware/validation.js
import { body, validationResult } from 'express-validator';

// Helper function to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Auth validations
export const validateSignup = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('userType')
    .isIn(['buyer', 'seller'])
    .withMessage('User type must be either buyer or seller'),
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  handleValidationErrors
];

export const validateSignin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Buyer offer validations
export const validateOffer = [
  body('eventId')
    .isMongoId()
    .withMessage('Invalid event ID'),
  body('sections')
    .isArray({ min: 1 })
    .withMessage('At least one section must be selected'),
  body('sections.*')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Section names must be valid strings'),
  body('maxPrice')
    .isFloat({ min: 1 })
    .withMessage('Maximum price must be at least $1'),
  body('quantity')
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10'),
  handleValidationErrors
];

// Seller listing validations
export const validateListing = [
  body('eventId')
    .isMongoId()
    .withMessage('Invalid event ID'),
  body('section')
    .trim()
    .notEmpty()
    .withMessage('Section is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('askingPrice')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Asking price must be at least $1'),
  body('minimumAcceptablePrice')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Minimum price must be at least $1'),
  body('deliveryMethod')
    .isIn(['ticketmaster', 'axs', 'pdf', 'willcall', 'other'])
    .withMessage('Invalid delivery method'),
  handleValidationErrors
];

export const validateBulkUpload = [
  body('listings')
    .isArray({ min: 1, max: 100 })
    .withMessage('Must upload between 1 and 100 listings'),
  body('listings.*.eventId')
    .isMongoId()
    .withMessage('Invalid event ID in listing'),
  body('listings.*.section')
    .trim()
    .notEmpty()
    .withMessage('Section is required for each listing'),
  body('listings.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  handleValidationErrors
];

// Accept offer validation
export const validateAcceptOffer = [
  body('section')
    .trim()
    .notEmpty()
    .withMessage('Section is required'),
  body('row')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Row must be a valid string if provided'),
  body('seats')
    .optional()
    .isArray()
    .withMessage('Seats must be an array'),
  body('deliveryMethod')
    .isIn(['ticketmaster', 'axs', 'pdf', 'willcall', 'other'])
    .withMessage('Invalid delivery method'),
  body('deliveryDetails.transferEmail')
    .optional()
    .isEmail()
    .withMessage('Transfer email must be valid'),
  handleValidationErrors
];