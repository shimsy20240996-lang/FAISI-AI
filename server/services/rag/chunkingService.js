import { ENV } from '../../config/env.js';

/**
 * Intelligent Semantic Boundary Document Chunking Service
 * Respects section headings, paragraphs, sentence punctuation, and CSV tables.
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
   * Main entry point: chunks a Document into structured chunk objects ready for embedding
   * @param {Object} doc Mongoose Document or plain object
   * @param {string} generationId Unique generation UUID
   * @returns {Array<{ chunkId: string, chunkIndex: number, text: string, textLength: number, title: string, metadata: Object }>}
   */
  chunkDocument(doc, generationId) {
    if (!doc || !doc.extractedText) {
      return [];
    }

    const isCsv = doc.extension === 'csv';
    const rawChunks = isCsv
      ? this.chunkCsv(doc.extractedText, doc.csvMetadata)
      : this.splitText(doc.extractedText);

    const docId = doc._id.toString();
    const sourceName = doc.originalName || 'Document';

    return rawChunks.map((chunkText, index) => {
      // Truthful Provenance Invariant:
      // pageNumber and sectionTitle are strictly null unless reliably available
      const pageNumber = null; // Phase 6 text extractors do not embed per-chunk page tokens
      const sectionTitle = null;

      return {
        chunkId: `${docId}_${generationId}_c${index}`,
        chunkIndex: index,
        text: chunkText,
        textLength: chunkText.length,
        title: sourceName,
        metadata: {
          sourceName,
          mimeType: doc.mimeType || 'text/plain',
          pageNumber,
          sectionTitle,
          isCsv,
        },
      };
    });
  }
}

export const chunkingService = new ChunkingService();
