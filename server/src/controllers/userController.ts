import { Response, NextFunction } from 'express';
import prisma from '../db.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import logger from '../logger.js';

// POST /api/users/sync
// Upserts a User row using the Supabase user ID. Call this once after login.
export const syncUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id, email } = req.user!;

    const user = await prisma.user.upsert({
      where: { id },
      update: { email: email ?? null },
      create: { id, email: email ?? null },
    });

    logger.info(`User synced: ${user.id}`);
    res.status(200).json(user);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};
