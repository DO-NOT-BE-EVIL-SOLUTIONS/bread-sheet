import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { syncUser } from '../controllers/userController.js';
import { getMyRatings } from '../controllers/ratingController.js';

const router = Router();

router.post('/sync', requireAuth, syncUser);
router.get('/me/ratings', requireAuth, getMyRatings);

export default router;
