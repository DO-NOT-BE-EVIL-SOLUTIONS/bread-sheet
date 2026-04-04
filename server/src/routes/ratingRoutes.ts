import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { createRating, getRatingsForProduct } from '../controllers/ratingController.js';

const router = Router();

router.post('/', requireAuth, createRating);
router.get('/product/:barcode', requireAuth, getRatingsForProduct);

export default router;
