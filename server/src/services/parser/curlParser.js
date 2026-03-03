import { parseCurlToJson } from 'curl-to-json-parser'
/**
 * @typedef {Object} ParsedRequest
 * @property {string} url
 * @property {string} method
 * @property {Object.<string, string>} headers
 * @property {string} [body]
 * @property {string} [cookies]
 */

class CurlParser {
  /**
   * Parse a cURL command into a normalized request object
   * @param {string} curlCommand - The cURL command to parse
   * @returns {ParsedRequest}
   */
  static parse(curlCommand) {
    if (!this.isCurlCommand(curlCommand)) {
      throw new Error('Failed to parse cURL command: Invalid syntax');
    }

    try {
      const parsed = parseCurlToJson(curlCommand);

      if (!parsed || !parsed.url) {
        throw new Error('Invalid cURL: No URL found');
      }

      const cookies = this.extractCookies(parsed.headers || {});

      return {
        url: parsed.url,
        method: parsed.method,
        headers: parsed.headers,
        body: parsed.body,
        cookies,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse cURL command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { cause: error }
      );
    }
  }

  /**
   * Extract cookies from Cookie header and remove it from headers
   * @param {Object.<string, string>} headers
   * @returns {string|undefined}
   */
  static extractCookies(headers) {
    // Check for Cookie header (case-insensitive)
    const cookieKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'cookie'
    );

    if (cookieKey) {
      const cookies = headers[cookieKey];
      delete headers[cookieKey]; // Remove from headers to avoid duplication
      return cookies;
    }

    return undefined;
  }

  /**
   * Validate that a string looks like a cURL command
   * @param {string} input
   * @returns {boolean}
   */
  static isCurlCommand(input) {
    return /^\s*curl\s+/i.test(input.trim());
  }
}

export default CurlParser
