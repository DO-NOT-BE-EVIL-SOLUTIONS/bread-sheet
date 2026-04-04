import { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';
import { fetchFromOpenFoodFacts } from '../services/productService.js';
import logger from '../logger.js';

// GET /api/products/:barcode
export const getProductByBarcode = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { barcode } = req.params;

    // 1. Check local cache first
    const cached = await prisma.product.findUnique({ where: { barcode } });
    if (cached) {
      logger.info(`Product cache hit: ${barcode}`);
      return res.json(cached);
    }

    // 2. Fetch from Open Food Facts
    const data = await fetchFromOpenFoodFacts(barcode);
    if (!data) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // 3. Cache in DB and return
    const product = await prisma.product.create({ data });
    logger.info(`Product fetched and cached: ${barcode}`);
    res.status(201).json(product);
  } catch (error) {
    logger.error(error);
    next(error);
  }
};
