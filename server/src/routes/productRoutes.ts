import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { userLimiter } from '../middlewares/rateLimit.js';
import { getProductByBarcode } from '../controllers/productController.js';

const router = Router();

router.get('/:barcode', requireAuth, userLimiter, getProductByBarcode);

export default router;
