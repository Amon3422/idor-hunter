'use strict';

import express from 'express'
import { getFindings, exportFinding, exportFindings, updateFindingStatus, getFindingById } from '../controllers/findingController.js';

const router = express.Router();

// GET   /findings            — List all findings (with filters + pagination)
router.get('/', getFindings);

// GET   /findings/export     — Export all findings as JSON or Markdown
router.get('/export', exportFindings);

// GET   /findings/:id        — Single finding detail
router.get('/:id', getFindingById);

// GET   /findings/:id/export — Export a single finding as JSON or Markdown
router.get('/:id/export', exportFinding);

// PATCH /findings/:id/status — Update finding status (OPEN → FALSE_POSITIVE / FIXED)
router.patch('/:id/status', updateFindingStatus);

export default router
