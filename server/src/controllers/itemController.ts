import { Request, Response, NextFunction } from 'express';
import prisma from '../db.js';

// Create an item
export const createItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;
    const newItem = await prisma.item.create({
      data: { name },
    });
    res.status(201).json(newItem);
  } catch (error) {
    next(error);
  }
};

// Read all items
export const getItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.item.findMany();
    res.json(items);
  } catch (error) {
    next(error);
  }
};

// Read single item
export const getItemById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const item = await prisma.item.findUnique({
      where: { id },
    });
    if (!item) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }
    res.json(item);
  } catch (error) {
    next(error);
  }
};

// Update an item
export const updateItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { name } = req.body;
    
    // Check if item exists first
    const existingItem = await prisma.item.findUnique({ where: { id } });
    if (!existingItem) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const updatedItem = await prisma.item.update({ where: { id }, data: { name } });
    res.json(updatedItem);
  } catch (error) {
    next(error);
  }
};

// Delete an item
export const deleteItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    // Check if item exists first
    const existingItem = await prisma.item.findUnique({ where: { id } });
    if (!existingItem) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const deletedItem = await prisma.item.delete({ where: { id } });
    res.json(deletedItem);
  } catch (error) {
    next(error);
  }
};