'use strict';
import { decrypt } from '../../utils/crypto.js';

/**
 * Decrypt Account A and Account B credentials from a scan record.
 *
 * Credentials are stored encrypted in the DB. This function decrypts
 * them into short-lived local constants for request replay.
 *
 * @param {Object} scan — Prisma scan record with account_a_auth / account_b_auth
 * @returns {{ authA: { headers: Object, cookies: string|null }, authB: { headers: Object, cookies: string|null } }}
 */
export const decryptCredentials = (scan) => {
    const authA = decrypt(
        typeof scan.account_a_auth === 'string'
            ? scan.account_a_auth
            : JSON.stringify(scan.account_a_auth)
    );

    const authB = decrypt(
        typeof scan.account_b_auth === 'string'
            ? scan.account_b_auth
            : JSON.stringify(scan.account_b_auth)
    );

    return { authA, authB };
}

