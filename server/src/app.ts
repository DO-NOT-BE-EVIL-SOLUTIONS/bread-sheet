import express from 'express';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiLimiter, authLimiter } from './middlewares/rateLimit.js';
import userRoutes from './routes/userRoutes.js';
import productRoutes from './routes/productRoutes.js';
import ratingRoutes from './routes/ratingRoutes.js';
import itemRoutes from './routes/itemRoutes.js';

const app = express();

app.use(express.json());

// Rate limiting
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Health check
app.get('/', (_req, res) => {
  res.send('Bread Sheet API is running');
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/items', itemRoutes);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
