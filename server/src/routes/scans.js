import express from 'express'
import { createScan, runScan, getHistory } from '../controllers/scanController.js'

const router = express.Router();

// GET  /scans         — Scan history list
router.get('/', getHistory);
// POST /scans         — Create a scan from manual input
router.post('/', createScan);

// GET  /scans/:id/run — Execute a scan
router.get('/:id/run', runScan);

export default router
