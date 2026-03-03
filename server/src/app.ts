import express from 'express';
import itemRoutes from './routes/itemRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiLimiter, authLimiter } from './middlewares/rateLimit.js';

const app = express();

app.use(express.json());

// Rate Limiting
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// Health Check
app.get('/', (req, res) => {
  res.send('Bread Sheet API is running');
});

// Routes
app.use('/api/items', itemRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;