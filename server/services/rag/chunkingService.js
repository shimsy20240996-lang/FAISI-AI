import { ENV } from '../../config/env.js';

/**
 * Intelligent Semantic Boundary Document Chunking Service
 * Respects section headings, paragraphs, sentence punctuation, CSV tables,
 * and authentic PDF page boundaries.
 * Enforces truthful provenance (never fabricates page numbers or section titles).
 */
export class ChunkingService {
  constructor() {
    this.targetChunkSize = 1200; // characters (~300 tokens)
    this.overlapSize = 200; // characters (~50 tokens)
    this.maxChunksPerDoc = ENV.MAX_CHUNKS_PER_DOCUMENT || 250;
  }

  /**
   * Splits plain text hierarchically along semantic boundaries (paragraphs -> sentences -> words)
   * @param {string} text Raw extracted text
   * @returns {string[]} Array of chunk text strings
   */
  splitText(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return [];
    }

    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const paragraphs = cleanText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    const rawChunks = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length <= this.targetChunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      } else {
        if (currentChunk) {
          rawChunks.push(currentChunk);
          // Apply overlap from end of current chunk
          const overlap = currentChunk.slice(-this.overlapSize);
          currentChunk = overlap + '\n\n' + para;
        } else {
          // Paragraph itself is larger than target size; split by sentences
          const sentences = para.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [para];
          let sentenceChunk = '';

          for (const sentence of sentences) {
            const trimmedSentence = sentence.trim();
            if (!trimmedSentence) continue;

            if ((sentenceChunk + ' ' + trimmedSentence).length <= this.targetChunkSize) {
              sentenceChunk = sentenceChunk ? sentenceChunk + ' ' + trimmedSentence : trimmedSentence;
            } else {
              if (sentenceChunk) {
                rawChunks.push(sentenceChunk);
                const overlap = sentenceChunk.slice(-this.overlapSize);
                sentenceChunk = overlap + ' ' + trimmedSentence;
              } else {
                // Sentence itself is larger than target; hard slice by words
                for (let i = 0; i < trimmedSentence.length; i += this.targetChunkSize - this.overlapSize) {
                  rawChunks.push(trimmedSentence.slice(i, i + this.targetChunkSize));
                }
              }
            }
          }

          if (sentenceChunk) {
            currentChunk = sentenceChunk;
          }
        }
      }

      if (rawChunks.length >= this.maxChunksPerDoc) {
        break;
      }
    }

    if (currentChunk && rawChunks.length < this.maxChunksPerDoc) {
      rawChunks.push(currentChunk);
    }

    // Sanitize: filter out empty, whitespace-only, or punctuation-only artifacts
    return rawChunks
      .map((c) => c.trim())
      .filter((c) => c.length > 20 && /[a-zA-Z0-9]/.test(c))
      .slice(0, this.maxChunksPerDoc);
  }

  /**
   * Chunks CSV text preserving column headers across all chunk groups
   * @param {string} text CSV markdown or raw text
   * @param {Object} csvMetadata CSV metadata from Phase 6
   * @returns {string[]}
   */
  chunkCsv(text, csvMetadata) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const header = lines[0];
    const dataLines = lines.slice(1);
    const chunks = [];
    const rowsPerChunk = 10;

    for (let i = 0; i < dataLines.length; i += rowsPerChunk) {
      const rowSlice = dataLines.slice(i, i + rowsPerChunk);
      const chunkText = `CSV Table (${csvMetadata?.rowCount || dataLines.length} rows)\n${header}\n${rowSlice.join('\n')}`;
      chunks.push(chunkText);

      if (chunks.length >= this.maxChunksPerDoc) {
        break;
      }
    }

    return chunks.length > 0 ? chunks : [text.slice(0, this.targetChunkSize)];
  }

  /**
   * Parses page-delimited PDF extractedText into structured page segments.
   * Matches deterministic headers formatted by pdfExtractor: "--- Page N ---"
   * @param {string} text
   * @returns {Array<{ pageNumber: number, text: string }>}
   */
  parsePdfPages(text) {
    if (!text || typeof text !== 'string') return [];

    const pageMarkerRegex = /(?:^|\n)--- Page (\d+) ---\n/g;
    const matches = [...text.matchAll(pageMarkerRegex)];

    if (matches.length === 0) {
      return [];
    }

    const pages = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pageNum = parseInt(match[1], 10);
      const contentStartIndex = match.index + match[0].length;
      const nextMatch = matches[i + 1];
      const contentEndIndex = nextMatch ? nextMatch.index : text.length;
      const pageText = text.slice(contentStartIndex, contentEndIndex).trim();

      if (pageNum >= 1 && pageText.length > 0) {
        pages.push({
          pageNumber: pageNum,
          text: pageText,
        });
      }
    }

    return pages;
  }

  /**
   * Dedicated page-aware PDF chunker.
   * Assigns authentic 1-indexed page numbers to each chunk adhering to the primary/start-page rule.
   * @param {Object} doc Document record
   * @param {string} generationId Generation UUID
   * @returns {Array<{ chunkId: string, chunkIndex: number, text: string, textLength: number, title: string, metadata: Object }>}
   */
  chunkPdf(doc, generationId) {
    const docId = doc._id.toString();
    const sourceName = doc.originalName || 'Document';
    const mimeType = doc.mimeType || 'application/pdf';
    const extractedText = doc.extractedText || '';

    const parsedPages = this.parsePdfPages(extractedText);
    const chunks = [];
    let globalChunkIndex = 0;

    if (parsedPages.length > 0) {
      // Multi-page PDF with authentic page boundaries
      for (const page of parsedPages) {
        if (chunks.length >= this.maxChunksPerDoc) {
          break;
        }

        const pageChunks = this.splitText(page.text);
        for (const chunkText of pageChunks) {
          if (chunks.length >= this.maxChunksPerDoc) {
            break;
          }

          chunks.push({
            chunkId: `${docId}_${generationId}_c${globalChunkIndex}`,
            chunkIndex: globalChunkIndex,
            text: chunkText,
            textLength: chunkText.length,
            title: sourceName,
            metadata: {
              sourceName,
              mimeType,
              pageNumber: page.pageNumber, // Authentic 1-indexed source page
              sectionTitle: null,
              isCsv: false,
            },
          });
          globalChunkIndex++;
        }
      }
    } else {
      // Single-page PDF or text without explicit multi-page delimiters
      const rawChunks = this.splitText(extractedText);
      const pageNumber = doc.pageCount === 1 || doc.pageCount === null || doc.pageCount === undefined ? 1 : null;

      for (const chunkText of rawChunks) {
        if (chunks.length >= this.maxChunksPerDoc) {
          break;
        }

        chunks.push({
          chunkId: `${docId}_${generationId}_c${globalChunkIndex}`,
          chunkIndex: globalChunkIndex,
          text: chunkText,
          textLength: chunkText.length,
          title: sourceName,
          metadata: {
            sourceName,
            mimeType,
            pageNumber, // Page 1 for single-page PDF, or null if unresolvable
            sectionTitle: null,
            isCsv: false,
          },
        });
        globalChunkIndex++;
      }
    }

    return chunks;
  }

  /**
   * Main entry point: chunks a Document into structured chunk objects ready for embedding.
   * Strictly enforces truthful provenance (PDF receives authentic pageNumber; non-PDF receives null).
   * @param {Object} doc Mongoose Document or plain object
   * @param {string} generationId Unique generation UUID
   * @returns {Array<{ chunkId: string, chunkIndex: number, text: string, textLength: number, title: string, metadata: Object }>}
   */
  chunkDocument(doc, generationId) {
    if (!doc || !doc.extractedText) {
      return [];
    }

    const isCsv = doc.extension === 'csv';
    const isPdf = doc.extension === 'pdf';
    const docId = doc._id.toString();
    const sourceName = doc.originalName || 'Document';

    if (isCsv) {
      const rawChunks = this.chunkCsv(doc.extractedText, doc.csvMetadata);
      return rawChunks.map((chunkText, index) => ({
        chunkId: `${docId}_${generationId}_c${index}`,
        chunkIndex: index,
        text: chunkText,
        textLength: chunkText.length,
        title: sourceName,
        metadata: {
          sourceName,
          mimeType: doc.mimeType || 'text/csv',
          pageNumber: null, // Truthful provenance: CSV has no PDF page numbers
          sectionTitle: null,
          isCsv: true,
        },
      }));
    }

    if (isPdf) {
      return this.chunkPdf(doc, generationId);
    }

    // Non-PDF documents (TXT, DOCX, MD, etc.)
    const rawChunks = this.splitText(doc.extractedText);
    return rawChunks.map((chunkText, index) => ({
      chunkId: `${docId}_${generationId}_c${index}`,
      chunkIndex: index,
      text: chunkText,
      textLength: chunkText.length,
      title: sourceName,
      metadata: {
        sourceName,
        mimeType: doc.mimeType || 'text/plain',
        pageNumber: null, // Truthful provenance: strictly null for non-PDF documents
        sectionTitle: null,
        isCsv: false,
      },
    }));
  }
}

export const chunkingService = new ChunkingService();

