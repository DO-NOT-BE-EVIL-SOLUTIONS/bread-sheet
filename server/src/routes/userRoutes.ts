import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { syncLimiter, userLimiter } from '../middlewares/rateLimit.js';
import { syncUser } from '../controllers/userController.js';
import { getMyRatings } from '../controllers/ratingController.js';

const router = Router();

router.post('/sync', syncLimiter, requireAuth, syncUser);
router.get('/me/ratings', requireAuth, userLimiter, getMyRatings);

export default router;
