import { Response, NextFunction } from 'express';
import prisma from '../db.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import logger from '../logger.js';

// POST /api/ratings
// Body: { barcode, taste, comment? }
// taste: Float 0–10 in 0.5 increments (e.g. 0, 0.5, 1, ..., 10)
export const createRating = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { barcode, taste, comment } = req.body;

    if (!barcode || taste == null) {
      return res.status(400).json({ message: 'barcode and taste are required' });
    }

    // Validate taste is in range and on a 0.5 boundary
    const tasteNum = Number(taste);
    if (
      isNaN(tasteNum) ||
      tasteNum < 0 ||
      tasteNum > 10 ||
      (tasteNum * 2) % 1 !== 0  // must be a multiple of 0.5
    ) {
      return res.status(400).json({ message: 'taste must be between 0 and 10 in 0.5 increments' });
    }

    const product = await prisma.product.findUnique({ where: { barcode } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found. Fetch it via GET /api/products/:barcode first.' });
    }

    const rating = await prisma.rating.create({
      data: {
        userId,
        productId: product.id,
        taste: tasteNum,
        score: tasteNum,  // score mirrors taste (single dimension)
        comment: comment ?? null,
      },
      include: { product: true },
    });

    logger.info(`Rating created by ${userId} for product ${barcode}: taste=${tasteNum}`);
    res.status(201).json(rating);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

// GET /api/ratings/product/:barcode
// Returns all ratings for a product, most recent first
export const getRatingsForProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const barcode = req.params.barcode as string;

    const product = await prisma.product.findUnique({ where: { barcode } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const ratings = await prisma.rating.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });

    res.json(ratings);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

// GET /api/users/me/ratings
// Returns the authenticated user's rating history with product details
export const getMyRatings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const ratings = await prisma.rating.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    res.json(ratings);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};
