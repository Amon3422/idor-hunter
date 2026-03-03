'use strict';

import crypto from 'node:crypto'
import 'dotenv/config'

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Fail fast at startup — never silently fall back to a broken state
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    throw new Error('Missing required env var: CREDENTIALS_ENCRYPTION_KEY');
}

const KEY = Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, 'hex');

if (KEY.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
}

/**
 * Encrypt a string or object using AES-256-GCM.
 * Returns a single base64 string encoding: iv + authTag + ciphertext.
 * Storing all three together makes decrypt() self-contained.
 *
 * @param {string | object} data
 * @returns {string} base64-encoded encrypted bundle
 */
export const encrypt = (data) => {
    const plaintext = typeof data === 'object' ? JSON.stringify(data) : String(data);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Layout: [ iv (16) | authTag (16) | ciphertext (n) ]
    const bundle = Buffer.concat([iv, authTag, encrypted]);
    return bundle.toString('base64');
}

/**
 * Decrypt a bundle produced by encrypt().
 * Returns the original string, or a parsed object if the plaintext was JSON.
 *
 * @param {string} bundle - base64-encoded encrypted bundle
 * @returns {string | object}
 */
export const decrypt = (bundle) => {
    const buf = Buffer.from(bundle, 'base64');

    const iv        = buf.subarray(0, IV_LENGTH);
    const authTag   = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]).toString('utf8');

    try {
        return JSON.parse(decrypted);
    } catch {
        return decrypted;
    }
}

