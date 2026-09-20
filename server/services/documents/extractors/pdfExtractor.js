import { PDFParse } from 'pdf-parse';
import { ENV } from '../../../config/env.js';

/**
 * Normalizes plain text whitespace, line endings, and paragraph breaks.
 * @param {string} str
 * @returns {string}
 */
function normalizeText(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts page-aware plain text from a PDF buffer using pdf-parse v2 API
 * with defensive error handling, 1-indexed page preservation, and strict character limits.
 * @param {Buffer} buffer
 * @returns {Promise<{
 *   extractedText: string,
 *   length: number,
 *   isTruncated: boolean,
 *   pageCount: number,
 *   pages: Array<{ pageNumber: number, text: string }>
 * }>}
 */
export async function extractPdfText(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided to PDF extractor');
  }

  let parser = null;
  let rawText = '';
  let pageCount = 0;
  let rawPages = [];

  try {
    // pdf-parse v2 modern class API
    if (typeof PDFParse === 'function') {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();

      if (typeof result === 'string') {
        rawText = result;
        pageCount = 1;
        rawPages = [{ pageNumber: 1, text: result }];
      } else if (result && typeof result.text === 'string') {
        rawText = result.text;
        pageCount = result.total || result.pages?.length || 0;

        if (Array.isArray(result.pages) && result.pages.length > 0) {
          rawPages = result.pages.map((p, idx) => ({
            pageNumber: typeof p.num === 'number' && p.num >= 1 ? p.num : idx + 1,
            text: typeof p.text === 'string' ? p.text : '',
          }));
        } else {
          rawPages = [{ pageNumber: 1, text: result.text }];
        }
      }
    } else {
      throw new Error('PDFParse constructor is unavailable in current pdf-parse module');
    }
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${err.message || 'Malformed PDF structure'}`);
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Normalize each page's extracted text
  const normalizedPages = rawPages.map((p) => ({
    pageNumber: p.pageNumber,
    text: normalizeText(p.text),
  }));

  // Construct formatted extractedText
  let formattedExtractedText = '';
  if (normalizedPages.length > 1) {
    formattedExtractedText = normalizedPages
      .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
      .join('\n\n')
      .trim();
  } else if (normalizedPages.length === 1) {
    formattedExtractedText = normalizedPages[0].text;
  } else {
    formattedExtractedText = normalizeText(rawText);
  }

  const maxChars = ENV.MAX_EXTRACTED_TEXT_CHARS;
  const isTruncated = formattedExtractedText.length > maxChars;
  const finalText = isTruncated
    ? formattedExtractedText.slice(0, maxChars) + '\n\n[... Document truncated at maximum extraction limit ...]'
    : formattedExtractedText;

  const finalPageCount = pageCount || normalizedPages.length || (finalText ? 1 : 0);

  return {
    extractedText: finalText,
    length: finalText.length,
    isTruncated,
    pageCount: finalPageCount,
    pages: normalizedPages,
  };
}

