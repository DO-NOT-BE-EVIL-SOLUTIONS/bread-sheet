import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { getProductByBarcode } from '../controllers/productController.js';

const router = Router();

router.get('/:barcode', requireAuth, getProductByBarcode);

export default router;
