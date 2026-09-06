import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  requireAuth,
  requireRegistered,
} from '../middlewares/authMiddleware.js';
import { apiLimiter, userLimiter } from '../middlewares/rateLimit.js';
import { requestDeadline } from '../middlewares/requestDeadline.js';
import {
  getProductByBarcode,
  submitProduct,
  uploadImage,
  approveProduct,
  rejectProduct,
} from '../controllers/productController.js';
import { extractLabel } from '../controllers/labelExtractionController.js';
import {
  correctProduct,
  createProductEdit,
  getPendingProductEdit,
  voteOnProductEdit,
  retractVoteOnProductEdit,
  dismissProductEdit,
} from '../controllers/productEditController.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB hard ceiling
});

function handleUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'image_too_large' });
  }
  next(err);
}

router.get('/:barcode', requireAuth, userLimiter, getProductByBarcode);

// The two synchronous Gemini paths. `requestDeadline` is the outer half of the
// budget in ADR 0003 § step 0 — the inner half is `withGeminiDeadline` around
// the model call itself. Both must stay comfortably below API Gateway's fixed
// 30 s integration timeout, which answers with an opaque 504 and loses the
// upload.
router.post(  '/upload-image',
  requireAuth,
  apiLimiter,
  requestDeadline(),
  upload.single('image'),
  uploadImage,
  handleUploadError,
);

router.post(
  '/extract-label',
  requireAuth,
  apiLimiter,
  requireRegistered,
  requestDeadline(),
  upload.single('image'),
  handleUploadError,
  extractLabel,
);

// submitProduct only works with registered users
router.post('/', requireAuth, apiLimiter, requireRegistered, submitProduct);

router.post('/:barcode/verify', requireAuth, apiLimiter, requireRegistered, approveProduct);
// DELETE carries a REJECT vote — it does not retract an existing approval
router.delete('/:barcode/verify', requireAuth, apiLimiter, requireRegistered, rejectProduct);

// --- Product editing & peer review (TICKET-P5-006) ---
// All write paths are registered-users-only. Static '/edits/...' segments never
// collide with '/:barcode' — barcodes are numeric and the paths differ in shape.

// In-place correction of a PENDING_REVIEW submission (restarts the review cycle)
router.patch('/:barcode', requireAuth, apiLimiter, requireRegistered, correctProduct);

// Proposal flow for VERIFIED products
router.post('/:barcode/edits', requireAuth, apiLimiter, requireRegistered, createProductEdit);
router.get('/:barcode/edits/pending', requireAuth, userLimiter, getPendingProductEdit);

// Peer review of a proposal
router.post('/edits/:editId/votes', requireAuth, apiLimiter, requireRegistered, voteOnProductEdit);
router.delete('/edits/:editId/votes', requireAuth, apiLimiter, requireRegistered, retractVoteOnProductEdit);
router.post('/edits/:editId/dismissals', requireAuth, apiLimiter, requireRegistered, dismissProductEdit);

export default router;
