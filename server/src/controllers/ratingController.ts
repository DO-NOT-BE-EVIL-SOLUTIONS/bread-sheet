import { Response, NextFunction } from 'express';
import prisma from '../db.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import logger from '../logger.js';

// POST /api/ratings
// Body: { barcode, taste, texture, value, comment? }
export const createRating = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { barcode, taste, texture, value, comment } = req.body;

    if (!barcode || taste == null || texture == null || value == null) {
      return res.status(400).json({ message: 'barcode, taste, texture, and value are required' });
    }

    const product = await prisma.product.findUnique({ where: { barcode } });
    if (!product) {
      return res.status(404).json({ message: 'Product not found. Fetch it via GET /api/products/:barcode first.' });
    }

    const score = Math.round((taste + texture + value) / 3);

    const rating = await prisma.rating.create({
      data: {
        userId,
        productId: product.id,
        taste,
        texture,
        value,
        score,
        comment: comment ?? null,
      },
      include: { product: true },
    });

    logger.info(`Rating created by ${userId} for product ${barcode}`);
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
    const { barcode } = req.params;

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
