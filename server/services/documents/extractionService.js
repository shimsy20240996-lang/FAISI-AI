import { extractPdfText } from './extractors/pdfExtractor.js';
import { extractDocxText } from './extractors/docxExtractor.js';
import { extractPlainText } from './extractors/textExtractor.js';
import { extractCsvData } from './extractors/csvExtractor.js';
import { ENV } from '../../config/env.js';

/**
 * Unified Extraction Service
 * Routes document buffer to appropriate parser with strict timeout bounds
 */
export class ExtractionService {
  /**
   * Extracts text and structured metadata from document buffer
   * @param {Buffer} buffer
   * @param {string} extension ('pdf' | 'docx' | 'txt' | 'csv')
   * @returns {Promise<{ extractedText: string, length: number, csvMetadata?: Object, isTruncated?: boolean, pageCount?: number }>}
   */
  async extract(buffer, extension) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Invalid buffer provided to extraction service');
    }

    const timeoutMs = ENV.DOCUMENT_EXTRACTION_TIMEOUT_MS;

    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Document extraction timed out after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    const extractionPromise = (async () => {
      switch (extension.toLowerCase()) {
        case 'pdf':
          return await extractPdfText(buffer);
        case 'docx':
          return await extractDocxText(buffer);
        case 'txt':
          return await extractPlainText(buffer);
        case 'csv':
          return await extractCsvData(buffer);
        default:
          throw new Error(`Unsupported document extension: ${extension}`);
      }
    })();

    return await Promise.race([extractionPromise, timeoutPromise]);
  }
}

export const extractionService = new ExtractionService();
