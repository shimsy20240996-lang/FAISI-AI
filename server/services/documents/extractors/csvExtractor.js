import { ENV } from '../../../config/env.js';

/**
 * Pure JavaScript RFC 4180 compliant CSV Parser with strict resource bounding.
 * Correctly parses quoted fields, escaped quotes, multiline cells, and delimiter variations.
 * @param {string} text Raw CSV text
 * @returns {{ rows: string[][], totalRows: number, totalCols: number, isTruncated: boolean }}
 */
export function parseCsvContent(text) {
  const maxRows = ENV.MAX_CSV_ROWS;
  const maxCols = ENV.MAX_CSV_COLUMNS;
  const maxFieldLen = ENV.MAX_CSV_FIELD_LENGTH;
  const maxTotalCells = ENV.MAX_CSV_TOTAL_CELLS;

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let totalCells = 0;
  let isTruncated = false;

  const len = text.length;

  for (let i = 0; i < len; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          if (currentField.length < maxFieldLen) {
            currentField += '"';
          }
          i++; // Skip next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        if (currentField.length < maxFieldLen) {
          currentField += char;
        }
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        // Field delimiter
        if (currentRow.length < maxCols) {
          currentRow.push(currentField.trim());
        }
        currentField = '';
        totalCells++;
      } else if (char === '\r') {
        // Skip CR in CRLF or handle CR alone
        if (nextChar === '\n') {
          // handled by LF next iteration
          continue;
        } else {
          // Record delimiter (CR alone)
          if (currentRow.length < maxCols) {
            currentRow.push(currentField.trim());
          }
          currentField = '';
          totalCells++;

          if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
        }
      } else if (char === '\n') {
        // Record delimiter
        if (currentRow.length < maxCols) {
          currentRow.push(currentField.trim());
        }
        currentField = '';
        totalCells++;

        if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        if (currentField.length < maxFieldLen) {
          currentField += char;
        }
      }
    }

    // Check bounds
    if (rows.length >= maxRows || totalCells >= maxTotalCells) {
      isTruncated = true;
      break;
    }
  }

  // Handle final field and row if any
  if (currentField.length > 0 || (currentRow.length > 0 && rows.length < maxRows)) {
    if (currentRow.length < maxCols) {
      currentRow.push(currentField.trim());
    }
    if (currentRow.length > 0 && currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  const totalRows = rows.length;
  const totalCols = rows.reduce((max, r) => Math.max(max, r.length), 0);

  return { rows, totalRows, totalCols, isTruncated };
}

/**
 * Generates bounded CSV preview metadata and markdown text representation
 * @param {Buffer} buffer
 * @returns {Promise<{ extractedText: string, length: number, csvMetadata: Object, isTruncated: boolean }>}
 */
export async function extractCsvData(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid buffer provided to CSV extractor');
  }

  const rawText = buffer.toString('utf-8');
  const { rows, totalRows, totalCols, isTruncated } = parseCsvContent(rawText);

  if (rows.length === 0) {
    return {
      extractedText: 'Empty CSV file.',
      length: 15,
      csvMetadata: {
        headers: [],
        rowCount: 0,
        columnCount: 0,
        previewRows: [],
        isTruncated: false,
      },
      isTruncated: false,
    };
  }

  // First row as headers (bounded to 20 columns)
  const rawHeaders = rows[0] || [];
  const previewColCount = Math.min(rawHeaders.length, 20);
  const headers = rawHeaders.slice(0, previewColCount).map((h, idx) => h || `Column_${idx + 1}`);

  // Preview rows (up to 10 rows, up to 20 columns, max 100 chars per cell)
  const previewRows = rows.slice(1, 11).map((row) =>
    headers.map((_, colIdx) => {
      const val = row[colIdx] || '';
      return val.length > 100 ? val.slice(0, 97) + '...' : val;
    })
  );

  // Build Markdown summary table for extractedText (analysis-ready)
  let mdTable = `### CSV Data Summary (${totalRows} rows, ${totalCols} columns)\n\n`;
  mdTable += `| ${headers.join(' | ')} |\n`;
  mdTable += `| ${headers.map(() => '---').join(' | ')} |\n`;

  // Include up to 50 rows in the Markdown analysis text
  const analysisRows = rows.slice(1, 51);
  analysisRows.forEach((row) => {
    const cells = headers.map((_, idx) => (row[idx] || '').replace(/\|/g, '\\|'));
    mdTable += `| ${cells.join(' | ')} |\n`;
  });

  if (totalRows > 51) {
    mdTable += `\n*... and ${totalRows - 51} more rows.*\n`;
  }

  const maxChars = ENV.MAX_EXTRACTED_TEXT_CHARS;
  const isTextTruncated = isTruncated || mdTable.length > maxChars;
  const finalText = isTextTruncated
    ? mdTable.slice(0, maxChars) + '\n\n[... CSV preview truncated at maximum extraction limit ...]'
    : mdTable;

  const csvMetadata = {
    headers,
    rowCount: totalRows,
    columnCount: totalCols,
    previewRows,
    isTruncated: isTextTruncated,
  };

  return {
    extractedText: finalText,
    length: finalText.length,
    csvMetadata,
    isTruncated: isTextTruncated,
  };
}
