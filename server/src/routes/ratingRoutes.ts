import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { userLimiter } from '../middlewares/rateLimit.js';
import { createRating, getRatingsForProduct } from '../controllers/ratingController.js';

const router = Router();

router.post('/', requireAuth, userLimiter, createRating);
router.get('/product/:barcode', requireAuth, userLimiter, getRatingsForProduct);

export default router;
