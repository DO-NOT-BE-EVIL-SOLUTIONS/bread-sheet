import express from 'express';
import itemRoutes from './routes/itemRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(express.json());

// Health Check
app.get('/', (req, res) => {
  res.send('Bread Sheet API is running');
});

// Routes
app.use('/api/items', itemRoutes);

// Global error handler (should be after routes)
app.use(errorHandler);

export default app;