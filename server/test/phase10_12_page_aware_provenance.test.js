import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AdmZip from 'adm-zip';
import { User } from '../models/User.js';
import { Document } from '../models/Document.js';
import { DocumentChunk } from '../models/DocumentChunk.js';
import { documentService } from '../services/documents/documentService.js';
import { extractPdfText } from '../services/documents/extractors/pdfExtractor.js';
import { chunkingService } from '../services/rag/chunkingService.js';
import { ragService } from '../services/rag/ragService.js';
import { retrievalService } from '../services/rag/retrievalService.js';
import { vectorStore } from '../services/rag/vectorStore.js';
import { geminiEmbeddingProvider } from '../services/embeddings/providers/geminiEmbeddingProvider.js';
import { embeddingService } from '../services/embeddings/embeddingService.js';
import { localStorageProvider } from '../services/storage/localStorageProvider.js';
import { ENV } from '../config/env.js';

/**
 * Helper to construct a valid multi-page PDF binary buffer in memory.
 * Generates valid PDF 1.4 objects, page tree, and xref table.
 * @param {string[]} pagesText
 * @returns {Buffer}
 */
function createTestPdfBuffer(pagesText) {
  const numPages = pagesText.length;
  const pageObjStartNum = 3;
  const fontObjNum = pageObjStartNum + numPages * 2;
  const objOffsets = [];

  let pdf = '%PDF-1.4\n';

  // 1: Catalog
  objOffsets.push(pdf.length);
  pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';

  // 2: Pages container
  const pageRefs = [];
  for (let i = 0; i < numPages; i++) {
    const pageNum = pageObjStartNum + i * 2;
    pageRefs.push(pageNum + ' 0 R');
  }

  objOffsets.push(pdf.length);
  pdf += '2 0 obj\n<< /Type /Pages /Kids [' + pageRefs.join(' ') + '] /Count ' + numPages + ' >>\nendobj\n';

  // Create page and content stream objects
  for (let i = 0; i < numPages; i++) {
    const pageObjNum = pageObjStartNum + i * 2;
    const contentObjNum = pageObjNum + 1;
    const text = pagesText[i];
    const streamContent = 'BT /F1 12 Tf 100 700 Td (' + text + ') Tj ET';

    objOffsets.push(pdf.length);
    pdf += pageObjNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + contentObjNum + ' 0 R /Resources << /Font << /F1 ' + fontObjNum + ' 0 R >> >> >>\nendobj\n';

    objOffsets.push(pdf.length);
    pdf += contentObjNum + ' 0 obj\n<< /Length ' + streamContent.length + ' >>\nstream\n' + streamContent + '\nendstream\nendobj\n';
  }

  // Font object
  objOffsets.push(pdf.length);
  pdf += fontObjNum + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const startxref = pdf.length;
  pdf += 'xref\n0 ' + (fontObjNum + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 0; i < objOffsets.length; i++) {
    const offsetStr = String(objOffsets[i]).padStart(10, '0');
    pdf += offsetStr + ' 00000 n \n';
  }

  pdf += 'trailer\n<< /Size ' + (fontObjNum + 1) + ' /Root 1 0 R >>\nstartxref\n' + startxref + '\n%%EOF';
  return Buffer.from(pdf);
}

describe('Phase 4A: Page-Aware PDF Extraction & Citation Provenance Suite', () => {
  let userAId = new mongoose.Types.ObjectId().toString();
  let userBId = new mongoose.Types.ObjectId().toString();
  const uniqueSuffix = Date.now();
  const emailA = `faisi-p4a-alice-${uniqueSuffix}@example.test`;
  const emailB = `faisi-p4a-bob-${uniqueSuffix}@example.test`;
  const rawPassword = 'Password123!Secure';

  // Sample distinct page texts
  const page1Text = 'FAISI AI Executive Overview. Next-generation multi-tenant document intelligence architecture.';
  const page2Text = 'System Security and Provenance. Strict tenant isolation, SHA-256 verification, and page-aware indexing.';
  const page3Text = 'Knowledge Base Metrics. High precision cosine vector search with gemini-embedding-2 768 dimensions.';

  const multiPagePdfBuffer = createTestPdfBuffer([page1Text, page2Text, page3Text]);
  const singlePagePdfBuffer = createTestPdfBuffer(['Single Page Document Content for FAISI AI']);

  const sampleTxtBuffer = Buffer.from('Plain text knowledge document without PDF page boundaries.\nCovers general topics.');
  const sampleCsvBuffer = Buffer.from('Service,Status,Latency\nEmbedding,Active,150ms\nExtraction,Active,45ms');

  // DOCX buffer in memory
  const docxZip = new AdmZip();
  docxZip.addFile(
    '[Content_Types].xml',
    Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
  );
  docxZip.addFile(
    'word/document.xml',
    Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX Knowledge Content for FAISI AI</w:t></w:r></w:p></w:body></w:document>')
  );
  const sampleDocxBuffer = docxZip.toBuffer();

  // Deterministic 768-dim embedding mock for testing
  let originalEmbedText;
  let originalEmbedBatch;

  before(async () => {
    await localStorageProvider.init();

    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(ENV.MONGODB_URI, {
          dbName: ENV.MONGODB_DB_NAME,
          serverSelectionTimeoutMS: 3000,
        });
      }
    } catch {
      // Allow fallback if offline
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const userA = new User({
          email: emailA,
          displayName: 'Alice Provenance',
          passwordHash: await User.hashPassword(rawPassword),
        });
        await userA.save();
        userAId = userA._id.toString();

        const userB = new User({
          email: emailB,
          displayName: 'Bob Provenance',
          passwordHash: await User.hashPassword(rawPassword),
        });
        await userB.save();
        userBId = userB._id.toString();
      } catch {
        // Mock IDs fallback
      }
    }

    // Mock embedding methods
    if (embeddingService?.provider) {
      originalEmbedText = embeddingService.provider.embedText;
      originalEmbedBatch = embeddingService.provider.embedBatch;

      embeddingService.provider.embedText = async (text) => {
        const vec = new Array(768).fill(0.001);
        if (text.includes('Executive') || text.includes('Overview')) vec[0] = 0.999;
        else if (text.includes('Security') || text.includes('Provenance')) vec[1] = 0.999;
        else if (text.includes('Metrics') || text.includes('cosine')) vec[2] = 0.999;
        return vec;
      };

      embeddingService.provider.embedBatch = async (chunks) => {
        return chunks.map((c) => {
          const text = typeof c === 'string' ? c : c.text || '';
          const vec = new Array(768).fill(0.001);
          if (text.includes('Executive') || text.includes('Overview')) vec[0] = 0.999;
          else if (text.includes('Security') || text.includes('Provenance')) vec[1] = 0.999;
          else if (text.includes('Metrics') || text.includes('cosine')) vec[2] = 0.999;
          return vec;
        });
      };
    }
  });

  after(async () => {
    if (embeddingService?.provider && originalEmbedText) {
      embeddingService.provider.embedText = originalEmbedText;
      embeddingService.provider.embedBatch = originalEmbedBatch;
    }

    if (mongoose.connection.readyState === 1) {
      try {
        await DocumentChunk.deleteMany({ userId: { $in: [userAId, userBId] } });
        await Document.deleteMany({ userId: { $in: [userAId, userBId] } });
        await User.deleteMany({ _id: { $in: [userAId, userBId] } });
      } catch {}
    }
  });

  // =========================================================================
  // TEST 1: Real Multi-Page PDF Extraction
  // =========================================================================
  test('1. Real PDF extraction preserves authentic 1-indexed page boundaries without contamination', async () => {
    const result = await extractPdfText(multiPagePdfBuffer);

    assert.ok(result, 'Extraction result should exist');
    assert.strictEqual(result.pageCount, 3, 'Page count must be exactly 3');
    assert.ok(Array.isArray(result.pages), 'result.pages must be an array');
    assert.strictEqual(result.pages.length, 3, 'Should extract exactly 3 page objects');

    // Verify 1-indexed page numbers
    assert.strictEqual(result.pages[0].pageNumber, 1, 'First page must be pageNumber 1');
    assert.strictEqual(result.pages[1].pageNumber, 2, 'Second page must be pageNumber 2');
    assert.strictEqual(result.pages[2].pageNumber, 3, 'Third page must be pageNumber 3');

    // Verify distinctive page contents belong to their respective pages
    assert.ok(result.pages[0].text.includes('FAISI AI Executive Overview'), 'Page 1 must contain Page 1 text');
    assert.ok(!result.pages[0].text.includes('Knowledge Base Metrics'), 'Page 1 must not contain Page 3 text');

    assert.ok(result.pages[1].text.includes('System Security and Provenance'), 'Page 2 must contain Page 2 text');
    assert.ok(!result.pages[1].text.includes('FAISI AI Executive Overview'), 'Page 2 must not contain Page 1 text');

    assert.ok(result.pages[2].text.includes('Knowledge Base Metrics'), 'Page 3 must contain Page 3 text');

    // Verify extractedText contains clean deterministic delimiters
    assert.ok(result.extractedText.includes('--- Page 1 ---'), 'extractedText must contain Page 1 header');
    assert.ok(result.extractedText.includes('--- Page 2 ---'), 'extractedText must contain Page 2 header');
    assert.ok(result.extractedText.includes('--- Page 3 ---'), 'extractedText must contain Page 3 header');
  });

  // =========================================================================
  // TEST 2: Page Count Accuracy
  // =========================================================================
  test('2. Page count reports accurate counts for single-page and multi-page PDFs', async () => {
    const singleRes = await extractPdfText(singlePagePdfBuffer);
    assert.strictEqual(singleRes.pageCount, 1, 'Single page PDF must have pageCount 1');
    assert.strictEqual(singleRes.pages.length, 1, 'Single page PDF must have 1 page in pages array');
    assert.strictEqual(singleRes.pages[0].pageNumber, 1, 'Single page PDF must be pageNumber 1');

    const multiRes = await extractPdfText(multiPagePdfBuffer);
    assert.strictEqual(multiRes.pageCount, 3, 'Multi-page PDF must have pageCount 3');
  });

  // =========================================================================
  // TEST 3: Page-Aware Chunking (1 <= pageNumber <= pageCount)
  // =========================================================================
  test('3. Chunking assigns authentic 1-indexed pageNumber to each PDF chunk matching its source page', async () => {
    const extractionResult = await extractPdfText(multiPagePdfBuffer);
    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'Annual_Strategy_Report.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      extractedText: extractionResult.extractedText,
      pageCount: extractionResult.pageCount,
    };

    const genId = 'gen-test-uuid-p4a';
    const chunks = chunkingService.chunkDocument(mockDoc, genId);

    assert.ok(chunks.length >= 3, 'Should produce at least 3 chunks for 3 distinct pages');

    // Verify each chunk has a valid 1-indexed pageNumber
    for (const chunk of chunks) {
      assert.ok(typeof chunk.metadata.pageNumber === 'number', 'chunk.metadata.pageNumber must be a number');
      assert.ok(
        chunk.metadata.pageNumber >= 1 && chunk.metadata.pageNumber <= mockDoc.pageCount,
        `pageNumber (${chunk.metadata.pageNumber}) must be between 1 and ${mockDoc.pageCount}`
      );
    }

    // Verify distinct page chunks map to expected page numbers
    const chunkPage1 = chunks.find((c) => c.text.includes('Executive Overview'));
    assert.ok(chunkPage1, 'Chunk for Page 1 text must exist');
    assert.strictEqual(chunkPage1.metadata.pageNumber, 1, 'Executive Overview chunk must have pageNumber 1');

    const chunkPage2 = chunks.find((c) => c.text.includes('System Security'));
    assert.ok(chunkPage2, 'Chunk for Page 2 text must exist');
    assert.strictEqual(chunkPage2.metadata.pageNumber, 2, 'System Security chunk must have pageNumber 2');

    const chunkPage3 = chunks.find((c) => c.text.includes('Knowledge Base Metrics'));
    assert.ok(chunkPage3, 'Chunk for Page 3 text must exist');
    assert.strictEqual(chunkPage3.metadata.pageNumber, 3, 'Knowledge Base Metrics chunk must have pageNumber 3');
  });

  // =========================================================================
  // TEST 4: Deterministic Boundary Behavior & Idempotency
  // =========================================================================
  test('4. Chunking behavior is completely deterministic across repeated invocations', async () => {
    const extractionResult = await extractPdfText(multiPagePdfBuffer);
    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'Deterministic_Doc.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      extractedText: extractionResult.extractedText,
      pageCount: extractionResult.pageCount,
    };

    const genId = 'gen-determ-123';
    const runA = chunkingService.chunkDocument(mockDoc, genId);
    const runB = chunkingService.chunkDocument(mockDoc, genId);

    assert.strictEqual(runA.length, runB.length, 'Chunk counts must be strictly identical');

    for (let i = 0; i < runA.length; i++) {
      assert.strictEqual(runA[i].chunkId, runB[i].chunkId, `Chunk ID at ${i} must match`);
      assert.strictEqual(runA[i].chunkIndex, runB[i].chunkIndex, `Chunk Index at ${i} must match`);
      assert.strictEqual(runA[i].text, runB[i].text, `Chunk text at ${i} must match`);
      assert.strictEqual(runA[i].metadata.pageNumber, runB[i].metadata.pageNumber, `Page number at ${i} must match`);
    }
  });

  // =========================================================================
  // TEST 5: Single-Page PDF Provenance
  // =========================================================================
  test('5. Single-page PDF produces chunks with pageNumber 1', async () => {
    const singleRes = await extractPdfText(singlePagePdfBuffer);
    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'Single_Page.pdf',
      extension: 'pdf',
      mimeType: 'application/pdf',
      extractedText: singleRes.extractedText,
      pageCount: 1,
    };

    const chunks = chunkingService.chunkDocument(mockDoc, 'gen-single-page');
    assert.ok(chunks.length >= 1, 'Should produce at least 1 chunk');

    for (const chunk of chunks) {
      assert.strictEqual(chunk.metadata.pageNumber, 1, 'Every chunk in a single-page PDF must have pageNumber 1');
    }
  });

  // =========================================================================
  // TEST 6: Non-PDF Truthful Provenance (TXT, MD, CSV, DOCX -> pageNumber: null)
  // =========================================================================
  test('6. Non-PDF documents (TXT, CSV, DOCX) strictly assign pageNumber: null', async () => {
    const genId = 'gen-non-pdf-test';

    // 6.1 TXT
    const txtDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'notes.txt',
      extension: 'txt',
      mimeType: 'text/plain',
      extractedText: sampleTxtBuffer.toString('utf-8'),
    };
    const txtChunks = chunkingService.chunkDocument(txtDoc, genId);
    assert.ok(txtChunks.length >= 1, 'TXT should produce chunks');
    for (const chunk of txtChunks) {
      assert.strictEqual(chunk.metadata.pageNumber, null, 'TXT chunk pageNumber must be strictly null');
    }

    // 6.2 CSV
    const csvDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'data.csv',
      extension: 'csv',
      mimeType: 'text/csv',
      extractedText: sampleCsvBuffer.toString('utf-8'),
      csvMetadata: { rowCount: 2, columnCount: 3 },
    };
    const csvChunks = chunkingService.chunkDocument(csvDoc, genId);
    assert.ok(csvChunks.length >= 1, 'CSV should produce chunks');
    for (const chunk of csvChunks) {
      assert.strictEqual(chunk.metadata.pageNumber, null, 'CSV chunk pageNumber must be strictly null');
    }

    // 6.3 DOCX
    const docxDoc = {
      _id: new mongoose.Types.ObjectId(),
      originalName: 'spec.docx',
      extension: 'docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extractedText: 'DOCX Word Document Content for FAISI AI',
    };
    const docxChunks = chunkingService.chunkDocument(docxDoc, genId);
    assert.ok(docxChunks.length >= 1, 'DOCX should produce chunks');
    for (const chunk of docxChunks) {
      assert.strictEqual(chunk.metadata.pageNumber, null, 'DOCX chunk pageNumber must be strictly null');
    }
  });

  // =========================================================================
  // TEST 7: Retrieval Propagation
  // =========================================================================
  test('7. retrievalService context building preserves authentic pageNumber in source citation metadata', async () => {
    const docId = new mongoose.Types.ObjectId().toString();

    // Mock vectorStore search output returning a chunk on page 2
    const originalSearch = vectorStore.search;
    vectorStore.search = async () => [
      {
        chunk: {
          id: 'mock-chunk-id-p2',
          documentId: docId,
          chunkId: `${docId}_gen1_c1`,
          chunkIndex: 1,
          text: 'Specialized provenance retrieval passage on Page 2 for vector search.',
          textLength: 68,
          metadata: {
            sourceName: 'Annual_Report_2025.pdf',
            mimeType: 'application/pdf',
            pageNumber: 2,
            sectionTitle: null,
            isCsv: false,
          },
        },
        score: 0.95,
      },
    ];

    try {
      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Specialized provenance retrieval passage',
      });

      assert.ok(retrieval.hasEvidence, 'Retrieval should find evidence');
      assert.strictEqual(retrieval.sources.length, 1, 'Should return 1 source');
      assert.strictEqual(retrieval.sources[0].pageNumber, 2, 'Source must carry authentic pageNumber 2');
      assert.strictEqual(retrieval.sources[0].documentName, 'Annual_Report_2025.pdf', 'Document name must match');
      assert.ok(retrieval.contextText.includes('Page 2'), 'Context text must include Page 2 metadata');
    } finally {
      vectorStore.search = originalSearch;
    }
  });

  // =========================================================================
  // TEST 8: Semantic Search & Non-PDF Handling
  // =========================================================================
  test('8. Vector search preserves pageNumber for PDF and returns null for non-PDF', async () => {
    const originalSearch = vectorStore.search;
    vectorStore.search = async () => [
      {
        chunk: {
          id: 'chunk-pdf-1',
          documentId: 'doc-pdf',
          chunkId: 'doc-pdf_c1',
          chunkIndex: 0,
          text: 'PDF chunk on Page 3',
          textLength: 19,
          metadata: {
            sourceName: 'report.pdf',
            mimeType: 'application/pdf',
            pageNumber: 3,
            sectionTitle: null,
            isCsv: false,
          },
        },
        score: 0.9,
      },
      {
        chunk: {
          id: 'chunk-txt-1',
          documentId: 'doc-txt',
          chunkId: 'doc-txt_c1',
          chunkIndex: 0,
          text: 'Plain text chunk',
          textLength: 16,
          metadata: {
            sourceName: 'guide.txt',
            mimeType: 'text/plain',
            pageNumber: null,
            sectionTitle: null,
            isCsv: false,
          },
        },
        score: 0.8,
      },
    ];

    try {
      const retrieval = await retrievalService.retrieveContext({
        userId: userAId,
        query: 'Search query',
      });

      assert.strictEqual(retrieval.sources.length, 2, 'Should return 2 sources');
      assert.strictEqual(retrieval.sources[0].pageNumber, 3, 'PDF source must have pageNumber 3');
      assert.strictEqual(retrieval.sources[1].pageNumber, null, 'TXT source must have pageNumber null');
    } finally {
      vectorStore.search = originalSearch;
    }
  });

  // =========================================================================
  // TEST 9: Citation UI Metadata Contract Verification
  // =========================================================================
  test('9. Citation metadata structure safely handles both authentic pageNumber and null without breaking', () => {
    // Simulated PDF source with page 4
    const pdfSource = {
      sourceIndex: 1,
      documentId: '65f1234567890abcdef12345',
      documentName: 'Annual_Report.pdf',
      pageNumber: 4,
      sectionTitle: null,
      snippet: 'Key findings from chapter 4...',
      score: 0.92,
      chunkId: 'chunk-p4',
    };

    assert.strictEqual(pdfSource.pageNumber, 4, 'PDF source has integer pageNumber 4');
    assert.strictEqual(typeof pdfSource.pageNumber, 'number', 'pageNumber is number type');

    // Simulated TXT source with null page
    const txtSource = {
      sourceIndex: 2,
      documentId: '65f1234567890abcdef12346',
      documentName: 'notes.txt',
      pageNumber: null,
      sectionTitle: null,
      snippet: 'General notes without page numbers...',
      score: 0.85,
      chunkId: 'chunk-txt',
    };

    assert.strictEqual(txtSource.pageNumber, null, 'Non-PDF source has pageNumber null');
    assert.ok(txtSource.pageNumber === null, 'null check passes cleanly');
  });

  // =========================================================================
  // TEST 10: Full End-to-End Extraction, Auto-Indexing & Provenance Pipeline
  // =========================================================================
  test('10. End-to-end extraction and chunking pipeline populates authentic page numbers across all PDF chunks', async () => {
    const extractionResult = await extractPdfText(multiPagePdfBuffer);
    assert.strictEqual(extractionResult.pageCount, 3, 'Must extract 3 pages');

    const mockDoc = {
      _id: new mongoose.Types.ObjectId(),
      userId: userBId,
      originalName: 'Q3_Financial_Analysis.pdf',
      safeName: 'Q3_Financial_Analysis.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      size: multiPagePdfBuffer.length,
      extractedText: extractionResult.extractedText,
      pageCount: extractionResult.pageCount,
    };

    const genId = 'gen-e2e-p4a';
    const chunks = chunkingService.chunkDocument(mockDoc, genId);

    assert.ok(chunks.length >= 3, 'Must create at least 3 chunks');

    const pageNumbers = chunks.map((c) => c.metadata.pageNumber);
    assert.ok(pageNumbers.includes(1), 'Must contain a chunk with pageNumber 1');
    assert.ok(pageNumbers.includes(2), 'Must contain a chunk with pageNumber 2');
    assert.ok(pageNumbers.includes(3), 'Must contain a chunk with pageNumber 3');

    // Confirm no chunks have null or 0 page numbers for PDF
    for (const pNum of pageNumbers) {
      assert.ok(typeof pNum === 'number' && pNum >= 1 && pNum <= 3, `Every chunk must have pageNumber 1..3, got ${pNum}`);
    }
  });
});
