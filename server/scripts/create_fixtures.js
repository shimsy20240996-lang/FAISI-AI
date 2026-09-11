import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.resolve(__dirname, '../../test_fixtures');
fs.mkdirSync(targetDir, { recursive: true });

// 1. TXT Fixture
fs.writeFileSync(
  path.join(targetDir, 'sample_project.txt'),
  'NOVA AI Project Overview\n\nPhase 6: Secure Multi-Format Document Analysis Foundation.\nFeatures: PDF, DOCX, CSV, TXT support with prompt injection defenses.'
);

// 2. CSV Fixture
fs.writeFileSync(
  path.join(targetDir, 'financial_summary.csv'),
  'Quarter,Revenue,Expenses,NetProfit\nQ1 2026,120000,85000,35000\nQ2 2026,145000,92000,53000\nQ3 2026,168000,99000,69000\nQ4 2026,195000,105000,90000'
);

// 3. PDF Fixture
const pdfData = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 56 >>\nstream\nBT /F1 12 Tf 100 700 Td (NOVA AI Official PDF Specification Document) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000262 00000 n \n0000000368 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n447\n%%EOF'
);
fs.writeFileSync(path.join(targetDir, 'system_architecture.pdf'), pdfData);

// 4. DOCX Fixture
const zip = new AdmZip();
zip.addFile(
  '[Content_Types].xml',
  Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
);
zip.addFile(
  'word/document.xml',
  Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>NOVA AI Document Analysis DOCX Report: All systems operating normally.</w:t></w:r></w:p></w:body></w:document>')
);
fs.writeFileSync(path.join(targetDir, 'research_paper.docx'), zip.toBuffer());

console.log('Successfully created test fixtures in test_fixtures directory');
