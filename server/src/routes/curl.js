import express from 'express'
import { parseCurl, createScanFromCurl } from '../controllers/curlController.js'
const router = express.Router()

// POST /curl/parse  — Parse only, returns normalized request preview
router.post('/parse', parseCurl);

// POST /curl/scan   — Parse cURL (Account A) + accountB → create scan
router.post('/scan', createScanFromCurl);

export default router
