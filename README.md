# FAISI AI

**Your AI. Your Way.**

FAISI AI is a modern, accessible AI assistant designed to help you learn, create, explore, and get things done. Powered by Google Gemini, FAISI AI is built with a secure full-stack architecture, persistent MongoDB database storage, robust user authentication with HTTP-only cookie sessions, and a secure multi-format document analysis pipeline.

> **FAISI AI**<br />
> Inspired by Failul Rahman & Sithy Siyama.<br />
> *Your AI. Your Way.*

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────┐
│             FAISI AI Frontend (React 19 + Vite)        │
│   - React AuthContext (Session & State Management)     │
│   - Document Workspace & AI Analysis Hub Modal         │
│   - Accessible FileUploadZone (Drag-and-Drop)          │
│   - Document Preview (Markdown & Structured CSV Table) │
│   - Gemini AI Analysis Panel with Quick Presets        │
│   - Streaming Conversation Engine & Status Lifecycle   │
│   - Stop Generation (AbortController) & Regenerate     │
│   - Content-Aware Sidebar Search & Date Grouping       │
└───────────────────────────┬────────────────────────────┘
                            │  HTTP / Server-Sent Events (SSE) / Multipart
                            │  Credentials: 'include' (HTTP-only Cookie)
                            │  (/api/auth/*, /api/conversations/*, /api/documents/*, /api/chat/stream)
                            ▼
┌────────────────────────────────────────────────────────┐
│             FAISI AI Backend (Node.js + Express)       │
│   - Multer In-Memory Single-File Stream Handler (10MB) │
│   - Multi-Layer File Validator (Magic Bytes / OpenXML) │
│   - Storage Service Abstraction (localStorageProvider) │
│   - Document Extractors (pdf-parse v2, mammoth, CSV)   │
│   - Cookie Parser (reads nova_auth_token)              │
│   - Authenticate Middleware (validates JWT, req.user)  │
│   - CSRF Origin / Referer Validation (Safe Methods)    │
│   - Differentiated Rate Limiting (Upload & Analysis)   │
│   - Security Headers (helmet)                          │
│   - CORS Origin Enforcement (CLIENT_URL, credentials)  │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  Document & Chat Service │  │  AI Service Abstraction   │
│  - User-Scoped Quotas    │  │  - @google/genai SDK      │
│  - Concurrency Throttling│  │  - gemini-3.6-flash       │
│  - User Duplicate Check  │  │  - Prompt Injection Armor │
│  - IDOR Protection       │  │  - <DOCUMENT_CONTENT>     │
│  - Atomic Rollback Guard │  │  - Streaming Generation   │
└─────────────┬────────────┘  └───────────┬──────────────┘
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│      MongoDB Database    │  │     Google Gemini API    │
│  - Users Schema (bcrypt) │  └──────────────────────────┘
│  - Conversations Schema  │
│  - Documents Schema      │
│  - Compound Indexes      │
│  - { userId: 1, sha256 } │
└──────────────────────────┘
```

## 🚀 Release Stage: FAISI AI v0.8.1 (Production Release Candidate)

FAISI AI has completed all core capabilities across Phases 0 through 10.7 and is in **Phase 10.8 — Release Preparation**. The system provides an end-to-end, multi-tenant AI workspace and production runtime:

- **Supported Document Formats**: Native support for `PDF`, `DOCX`, `CSV`, and `TXT` files.
- **Multi-Layer Structural File Validation**:
  - **PDF**: Magic bytes `%PDF-` verification followed by defensive AST text extraction.
  - **DOCX**: ZIP local header check (`PK\x03\x04`) + OpenXML package descriptor inspection (`[Content_Types].xml` and `word/document.xml` via `adm-zip`) before calling Mammoth. Rejects renamed ZIP files.
  - **TXT & CSV**: UTF-8 character validity check and binary/control byte ratio detection (rejects null bytes and binary files).
  - **CSV Resource Bounds**: Strict bounding on rows (`MAX_CSV_ROWS=10000`), columns (`MAX_CSV_COLUMNS=100`), field length (`MAX_CSV_FIELD_LENGTH=1000`), and cells (`MAX_CSV_TOTAL_CELLS=50000`).
- **Defensive In-Memory Multipart Uploads**:
  - Multer single-file parsing with strict `10 MB` byte limit at the stream level.
  - Single buffer processing to eliminate redundant in-memory duplicates.
  - Unpredictable UUID storage keys (`storage/documents/{userId}/{uuid}.{ext}`) stored strictly outside public web roots.
- **Extraction Engines & Timeouts**:
  - `pdf-parse` v2 (`PDFParse` class API with fallback handling).
  - `mammoth` for DOCX plain text extraction.
  - Pure JS RFC 4180 CSV parser with preview metadata (10 rows $\times$ 20 cols) and Markdown summary table.
  - UTF-8 text decoder with line break normalization.
  - Bounded execution with `Promise.race` extraction timeout (`DOCUMENT_EXTRACTION_TIMEOUT_MS=30000`).
- **Storage Limits & User Quotas**:
  - MongoDB `extractedText` capped at `MAX_EXTRACTED_TEXT_CHARS=100000` (100k chars).
  - Max 50 documents per user (`MAX_DOCUMENTS_PER_USER=50`).
  - Max 100 MB storage quota per user (`MAX_USER_STORAGE_MB=100`).
  - Concurrency limiter (`MAX_CONCURRENT_DOCUMENT_PROCESSING=2`) per user.
- **User-Scoped Duplicate Detection**:
  - Deduplication is scoped to `userId + sha256`. Uploading an identical file returns the existing document with `{ isDuplicate: true }` without storing duplicate files. Cross-user deduplication is strictly prohibited.
- **Strict Multi-Tenant IDOR Protection**:
  - All document queries, reads, analyses, and deletions enforce `userId: req.user._id`. Unauthorized access returns `404 Not Found`. `toJSON` strips internal `storageKey`.
- **Prompt-Injection Defense**:
  - Document text is sent to Gemini inside `<DOCUMENT_CONTENT>` tags with explicit system instructions stating document text is untrusted passive data that cannot execute commands or alter system rules.
  - Analysis instructions capped at `MAX_INSTRUCTION_CHARS=1000`.
- **Differentiated Rate Limiting**:
  - Document Uploads: 30 req / 15 min.
  - Document AI Analyses: 20 req / 15 min.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/) |
| **Frontend Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Icons & Motion** | [Lucide React](https://lucide.dev/) + [Framer Motion](https://www.framer.com/motion/) |
| **Backend Runtime** | [Node.js](https://nodejs.org/) (v24.15.0 compatible) + [Express](https://expressjs.com/) |
| **Database & ODM** | [MongoDB](https://www.mongodb.com/) + [Mongoose 8](https://mongoosejs.com/) |
| **File Upload & Storage** | `multer` (v2.0.2) + Local Storage Provider Abstraction |
| **Document Parsers** | `pdf-parse` (v2.4.5) + `mammoth` (v1.12.2) + `adm-zip` (v0.6.0) + Pure JS RFC 4180 CSV |
| **Image Sanitization** | `sharp` (v0.35.4) Rasterization & Metadata Stripping |
| **Authentication & Crypto** | `bcryptjs` (Password Hashing) + `jsonwebtoken` + `cookie-parser` + `crypto` (SHA-256) |
| **Security & Hardening** | `helmet` + `express-rate-limit` + CSRF Origin Validation |
| **Streaming Protocol** | Server-Sent Events (`text/event-stream`) |
| **AI SDK** | [Google GenAI SDK (`@google/genai`)](https://www.npmjs.com/package/@google/genai) |
| **Default AI Model** | `gemini-3.6-flash` |
| **Environment Management** | `dotenv` + `cors` |

---

## 📁 Directory Structure

```text
nova-ai/
├── server/
│   ├── config/
│   │   ├── database.js              # MongoDB connection manager with resilience
│   │   └── env.js                   # Validates PORT, GEMINI_API_KEY, MONGODB_URI, AUTH_SECRET, document limits
│   ├── controllers/
│   │   ├── authController.js        # Handlers for register, login, logout, getMe
│   │   ├── chatController.js        # SSE streaming with user-owned turn persistence
│   │   ├── conversationController.js# User-scoped REST handlers (CRUD, search, claim)
│   │   └── documentController.js    # Document upload, list, content, analyze, delete, stats
│   ├── middleware/
│   │   ├── authenticate.js          # Validates HTTP-only cookie and attaches req.user
│   │   ├── csrfProtection.js        # Origin / Referer validation for state-changing requests
│   │   ├── rateLimiter.js           # Auth, upload, and analysis rate limiters
│   │   ├── errorHandler.js          # Normalized JSON error handler
│   │   └── requestValidation.js     # Validates message schemas and limits
│   ├── models/
│   │   ├── User.js                  # Mongoose User schema with normalized email and bcrypt
│   │   ├── Conversation.js          # Mongoose schema with userId compound index
│   │   └── Document.js              # Mongoose Document schema with storageKey stripping & indexes
│   ├── routes/
│   │   ├── authRoutes.js            # Express router (/api/auth/*)
│   │   ├── chatRoutes.js            # Express router (/api/health, /api/chat/stream)
│   │   ├── conversationRoutes.js    # Express router (/api/conversations/*)
│   │   └── documentRoutes.js        # Express router (/api/documents/*) with Multer & rate limiting
│   ├── services/
│   │   ├── authService.js           # JWT signing, verification, cookie management
│   │   ├── conversationService.js   # User-scoped operations, IDOR protection, claiming
│   │   ├── storage/
│   │   │   ├── localStorageProvider.js# Filesystem storage provider with path containment checks
│   │   │   └── storageService.js    # Pluggable storage facade
│   │   ├── documents/
│   │   │   ├── fileValidationService.js# Magic bytes, OpenXML structure, UTF-8/binary checks, SHA-256
│   │   │   ├── extractionService.js # Unified extractor dispatcher with timeout race
│   │   │   ├── extractors/
│   │   │   │   ├── pdfExtractor.js  # pdf-parse v2 modern extractor with character truncation
│   │   │   │   ├── docxExtractor.js # mammoth plain text extractor
│   │   │   │   ├── textExtractor.js # UTF-8 text decoder with line normalization
│   │   │   │   └── csvExtractor.js  # RFC 4180 parser with bounded preview & Markdown table
│   │   │   └── documentService.js   # Quotas, concurrency limits, duplicate check, lifecycle rollback
│   │   └── ai/
│   │       ├── aiService.js         # Provider abstraction interface (chat & analyzeDocument)
│   │       ├── geminiService.js     # Concrete @google/genai implementation with timeout protection
│   │       └── systemPrompt.js      # Central FAISI AI instruction + Document Analysis prompt armor
│   ├── test/
│   │   ├── phase4.test.js           # Phase 4 schema test suite
│   │   ├── phase5.test.js           # Phase 5 authentication & IDOR test suite
│   │   └── phase6.test.js           # Phase 6 validation, extractors, storage & IDOR test suite
│   ├── utils/
│   │   └── errors.js                # Custom error taxonomy (AuthenticationError, ForbiddenError, etc.)
│   ├── .env.example                 # Backend environment template
│   └── server.js                    # Express app entry point & security middlewares
├── src/
│   ├── components/
│   │   ├── auth/                    # AuthModal, ClaimConversationsModal
│   │   ├── chat/                    # ChatContainer, Message, MessageList, Composer, Suggestions
│   │   ├── common/                  # Reusable Badge, Button, IconButton, Card, Modal, Tooltip
│   │   ├── documents/               # FileUploadZone, DocumentCard, PreviewModal, AnalysisModal, DeleteModal, DocumentHubModal
│   │   ├── layout/                  # MainLayout, Sidebar, MobileSidebar, TopBar, UserProfileMenu
│   │   └── modals/                  # RenameModal, DeleteConfirmModal, SettingsModal, HelpModal
│   ├── context/
│   │   └── AuthContext.jsx          # React Context providing user, login, register, logout
│   ├── hooks/                       # useTheme, useSidebar, useAutoResize, useAutoScroll
│   ├── services/
│   │   └── api.js                   # Frontend API client (auth, conversations, documents)
│   ├── App.jsx                      # App root managing auth state, document hub, cloud sync, streaming & modals
│   ├── index.css                    # Tailwind v4 theme variables & base styles
│   └── main.jsx                     # React entry point wrapped with AuthProvider
├── storage/                         # Stored user documents outside public web roots
├── .env.example                     # Root environment template
├── package.json                     # Scripts & full-stack dependencies (version 0.8.1)
└── README.md                        # Project documentation
```

---

## 💻 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v24.15.0 or v20+ recommended)
- `npm` (version 10+)
- [MongoDB](https://www.mongodb.com/) (local instance or MongoDB Atlas cluster)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

---

### 1. Install Dependencies

```bash
npm install
```

---

### 2. Environment Configuration

Copy the `.env.example` template to create your local `.env`:

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Authentication & Session (Required for Phase 5+)
AUTH_SECRET=your_secure_random_jwt_secret_of_at_least_32_characters_here
AUTH_EXPIRES_IN=7d

# MongoDB Database Connection
MONGODB_URI=mongodb://127.0.0.1:27017/nova_ai
MONGODB_DB_NAME=nova_ai

# Google Gemini API Key (Required for live AI inference)
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash

# Upstream Request & Streaming Timeouts (milliseconds)
REQUEST_TIMEOUT_MS=30000
AI_STREAM_TIMEOUT_MS=60000

# Document Processing & Safety Limits (Phase 6)
MAX_FILE_SIZE_MB=10
MAX_USER_STORAGE_MB=100
MAX_DOCUMENTS_PER_USER=50
MAX_EXTRACTED_TEXT_CHARS=100000
MAX_ANALYSIS_CONTEXT_CHARS=50000
MAX_INSTRUCTION_CHARS=1000
MAX_CSV_ROWS=10000
MAX_CSV_COLUMNS=100
MAX_CSV_FIELD_LENGTH=1000
MAX_CSV_TOTAL_CELLS=50000
DOCUMENT_EXTRACTION_TIMEOUT_MS=30000
DOCUMENT_ANALYSIS_TIMEOUT_MS=30000
MAX_CONCURRENT_DOCUMENT_PROCESSING=2
STORAGE_DIR=storage/documents
```

> [!CAUTION]
> NEVER commit `.env` or real credentials to version control. `.gitignore` ignores all `.env` files.

---

### 3. Run the Development Server

Start both the Node.js backend server and Vite frontend simultaneously:

```bash
npm run dev
```

- **Frontend**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`

---

### 4. Build for Production

```bash
npm run build
```

---

### 5. Run Automated Test Suites

```bash
node --test "server/test/*.test.js"
```

---

## 🔌 API Endpoints

### Authentication Endpoints (`/api/auth`)

* `POST /api/auth/register` — Registers new user and sets HTTP-only cookie.
* `POST /api/auth/login` — Authenticates credentials and sets HTTP-only cookie.
* `POST /api/auth/logout` — Clears HTTP-only cookie.
* `GET /api/auth/me` — Returns current authenticated user profile.

### Document Management & Analysis Endpoints (`/api/documents`)

* `POST /api/documents` — Multipart single-file upload (PDF, DOCX, TXT, CSV) with magic byte validation, hash, duplicate check, and bounded text extraction.
* `GET /api/documents` — Lists authenticated user's documents with pagination.
* `GET /api/documents/stats` — Returns storage usage and document count quotas.
* `GET /api/documents/:id` — Retrieves single document metadata (IDOR protected).
* `GET /api/documents/:id/content` — Retrieves bounded extracted text or structured CSV preview (IDOR protected).
* `POST /api/documents/:id/analyze` — Analyzes document text with Gemini 3.6 Flash using prompt-injection defenses.
* `DELETE /api/documents/:id` — Physically deletes file from storage and removes MongoDB record.

### Conversation Endpoints (`/api/conversations`)

* `GET /api/conversations` — Lists user-owned conversations.
* `POST /api/conversations` — Creates new user-owned conversation.
* `GET /api/conversations/:id` — Retrieves single conversation (enforces ownership).
* `PATCH /api/conversations/:id` — Renames conversation title (enforces ownership).
* `DELETE /api/conversations/:id` — Permanently deletes conversation (enforces ownership).
* `GET /api/conversations/search?q=<query>` — Scoped search under authenticated user.
* `POST /api/conversations/claim` — Claims browser conversations matching client ID.
* `GET /api/conversations/unclaimed-count` — Checks unclaimed count for browser.

### AI & Health Endpoints

* `POST /api/chat/stream` — SSE progressive streaming with user-owned turn persistence.
* `GET /api/health` — Safe health check endpoint reporting status, version, uptime, and database connection state (zero secret disclosure).

---

## ⚙️ Production Environment & Configuration (Phase 10.1)

FAISI AI utilizes a strict, environment-aware configuration engine with built-in validation to prevent insecure defaults from reaching production.

### Environment Matrix

| Configuration Variable | Development | Test | Production | Description |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development` | `test` | `production` | Runtime mode. Production enforces strict secret & provider rules. |
| `PORT` | `5000` | `5000` | `5000` (or host assigned) | HTTP listening port (1–65535). |
| `CLIENT_URL` | `http://localhost:3000` | `http://localhost:3000` | `https://app.nova.ai` | Allowed CORS frontend origin (wildcard `*` rejected). |
| `TRUST_PROXY` | `1` (or `false`) | `1` | `1` (behind reverse proxy) | Number of reverse proxy hops or boolean. |
| `AUTH_SECRET` | Min 32 chars | Min 32 chars | Min 32 chars (crypto-random) | JWT cookie signing key (placeholders rejected). |
| `AUTH_EXPIRES_IN` | `7d` | `7d` | `7d` | Expiration duration for signed JWT session tokens. |
| `MONGODB_URI` | `mongodb://localhost:27017` | `mongodb://localhost:27017` | `mongodb+srv://...` | MongoDB connection URI (`mongodb://` or `mongodb+srv://`). |
| `GEMINI_API_KEY` | Optional / Warns | Optional / Mock | Required | Google Gemini API key (server-side only, never leaked). |
| `GEMINI_MODEL` | `gemini-3.6-flash` | `gemini-3.6-flash` | `gemini-3.6-flash` | Primary reasoning and conversation model. |
| `VECTOR_STORE_TYPE` | `local_memory` or `mongodb_atlas`| `local_memory` | `mongodb_atlas` | RAG vector store (production prevents silent local fallback). |
| `MAX_CONCURRENT_UPLOADS` | `10` | `10` | `10` | Global in-memory multipart upload concurrency cap. |
| `MAX_CONCURRENT_UPLOADS_PER_USER` | `2` | `2` | `2` | Per-user concurrent upload limiter. |
| `SHUTDOWN_TIMEOUT_MS` | `15000` | `15000` | `15000` | Maximum grace period for active connection draining on shutdown. |

---

## 🔒 Security Measures

- **Zero Client Secrets**: `GEMINI_API_KEY`, `MONGODB_URI`, and `AUTH_SECRET` exist strictly on the server in `.env`.
- **HTTP-Only Cookie Only**: Authentication tokens cannot be read or stolen via frontend JavaScript.
- **Content Security Policy (CSP)**: Strict deny-by-default CSP prohibiting inline scripts, object tags, and unauthorized connections.
- **Stateless JWT Revocation**: Atomic `tokenVersion` counter ensures immediate invalidation of old sessions upon logout.
- **Global RAM Concurrency Guard**: Multipart uploads are throttled *before* Multer allocates in-memory file buffers.
- **Image Raster Sanitization**: Sharp decodes and re-encodes all uploaded raster images (JPEG, PNG, WebP, GIF) while stripping EXIF, XMP, and comments.
- **Untrusted Document Stance**: All third-party parsers operate under defense-in-depth with timeouts and concurrency limits.
- **Magic Bytes & OpenXML Inspection**: Files are validated before parsing to reject spoofed extensions and arbitrary ZIP files.
- **Safe Path Containment**: Stored files are written only to `storage/documents/{userId}/` with absolute path traversal rejection.
- **Prompt-Injection Delimiters**: Analysis prompts isolate untrusted document text in `<DOCUMENT_CONTENT>` and `<RETRIEVED_KNOWLEDGE_BASE>`.
- **Multi-Tenant IDOR Protection**: All document, conversation, and media queries enforce `userId: req.user.id`.
- **Differentiated Rate Limiting**: Dedicated rate limiters on auth, uploads, AI analysis, audio transcription, and TTS synthesis.

---

## 🚀 Production Deployment & Infrastructure (Phase 10.2 & 10.3)

### 1. Conceptual Production Architecture

FAISI AI supports two production deployment topologies:

#### Option A: Unified Same-Origin Architecture (Recommended)
```text
User Browser ──── HTTPS ────► Reverse Proxy / Node.js Express Server (:5000)
                                ├── /api/*          ──► Express API Endpoints
                                │                         ├── MongoDB Atlas ($vectorSearch)
                                │                         ├── Google Gemini API
                                │                         └── Local File Storage
                                └── /* (Non-API)    ──► Static Frontend Assets (dist/) + SPA Fallback
```
* **Advantages**: Eliminates cross-origin cookie complexity, zero CORS preflight overhead, strict `SameSite=lax` cookie sessions function seamlessly, and simplifies Content Security Policy.

#### Option B: Split-Origin Architecture
```text
User Browser ──── HTTPS ────► Frontend Host / CDN (e.g. https://nova.example.com)
             ──── HTTPS ────► Backend API Host (e.g. https://api.nova.example.com)
```
* **Requirements**: Must configure `CLIENT_URL=https://nova.example.com` on the backend, CORS credentials enabled, and CSP `connect-src` allowing API host origin.

---

### 2. Frontend Deployment Requirements
* **Static Build**: Generate the production build using `npm run build` (outputs to `/dist`).
* **SPA Routing Fallback**: Non-file routes (e.g. `/`, `/conversations/*`) must serve `/dist/index.html`.
* **Zero Secrets in Bundle**: Frontend code contains zero API keys, secrets, or database URLs. All backend communications use `/api/*` with `credentials: 'include'`.
* **HTTPS**: All production traffic must be served over TLS/HTTPS.

---

### 3. Backend Deployment Requirements
* **Runtime**: Persistent Node.js process (v20+ or v22+ LTS).
* **Listening Port**: Express listens on `process.env.PORT` (defaults to `5000`) and binds to `0.0.0.0` for container compatibility.
* **Long-Lived HTTP Responses (SSE)**: Platform proxy must support streaming responses without buffering (`X-Accel-Buffering: no` header is transmitted).
* **Request Timeout**: Platform proxy/ingress timeout must be configured to at least 60 seconds (`AI_STREAM_TIMEOUT_MS=60000`).
* **Multipart Request Body**: Proxy must permit requests up to 10 MB for document uploads (`MAX_FILE_SIZE_MB=10`) and audio transcriptions (`MAX_AUDIO_SIZE_MB=10`).

---

### 4. MongoDB Atlas Setup & Vector Search Configuration

1. **Cluster Creation**: Deploy a MongoDB Atlas M0+ cluster on AWS, GCP, or Azure.
2. **Database User**: Create a dedicated database user with `readWrite` permissions on the `nova_ai` database.
3. **Network Access**: Add the backend server's static outbound IP(s) or configure IP Access List (`0.0.0.0/0` allowed when secured with strong user credentials).
4. **Vector Search Index**:
   In MongoDB Atlas UI -> **Atlas Search / Vector Search** -> **Create Vector Index** on collection `documentchunks`:
   * **Index Name**: `vector_index`
   * **JSON Configuration**:
   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 768,
         "similarity": "cosine"
       },
       {
         "type": "filter",
         "path": "userId"
       },
       {
         "type": "filter",
         "path": "documentId"
       },
       {
         "type": "filter",
         "path": "generationId"
       }
     ]
   }
   ```
5. **Connection String**: Set `MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/nova_ai?retryWrites=true&w=majority`.

---

### 5. Production Environment Variables Reference

| Variable | Description | Production Example |
|---|---|---|
| `NODE_ENV` | Runtime environment mode | `production` |
| `PORT` | Listening port assigned by provider | `5000` |
| `CLIENT_URL` | Production frontend origin | `https://nova.example.com` |
| `TRUST_PROXY` | Reverse proxy trust hops | `1` |
| `AUTH_SECRET` | Cryptographic JWT signing secret (min 32 chars) | `openssl rand -base64 32` |
| `AUTH_EXPIRES_IN` | JWT session lifetime | `7d` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://user:pass@cluster.mongodb.net/nova_ai` |
| `MONGODB_DB_NAME` | Database name | `nova_ai` |
| `GEMINI_API_KEY` | Google Gemini API key from AI Studio | `AIzaSy...` |
| `GEMINI_MODEL` | Primary conversation model | `gemini-3.6-flash` |
| `VECTOR_STORE_TYPE` | RAG vector search engine | `mongodb_atlas` |
| `EMBEDDING_MODEL` | Gemini embedding model | `gemini-embedding-2` |
| `EMBEDDING_DIMENSIONS` | Vector embedding dimensions | `768` |
| `MAX_FILE_SIZE_MB` | Max upload size per document | `10` |
| `MAX_CONCURRENT_UPLOADS` | Global active RAM upload limit | `10` |
| `MAX_CONCURRENT_UPLOADS_PER_USER` | Per-user concurrent upload limit | `2` |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown timeout (ms) | `15000` |

---

### 6. CORS & CSRF / Origin Validation
* In production, CORS strictly allows requests originating from `CLIENT_URL` with `credentials: true`. Wildcards (`*`) are explicitly rejected.
* State-changing endpoints (`POST`, `PATCH`, `DELETE`) enforce origin/referer validation via `validateRequestOrigin` middleware against `CLIENT_URL`.

---

### 7. Cookie & Session Policy
* Authentication session cookie `nova_auth_token` is transmitted with:
  * `httpOnly: true` (inaccessible to JavaScript)
  * `secure: true` (HTTPS only in production)
  * `sameSite: 'lax'` (CSRF defense)
  * `path: '/'`
* Stateless token revocation is enforced on logout via atomic `tokenVersion` increments in MongoDB.

---

### 8. Liveness & Readiness Probes (Phase 10.3)
* **Liveness Probe**: `GET /api/health`
  * Reports if Node process is alive.
  * Returns `200 OK` with `{ status: 'ok', version: '0.8.1', environment, database, uptime, timestamp }`.
* **Readiness Probe**: `GET /api/ready`
  * Reports if server is ready to accept user traffic.
  * Returns `200 OK` when MongoDB is connected and server is not shutting down.
  * Returns `503 Service Unavailable` if MongoDB is disconnected or if server is undergoing graceful shutdown.
* **Zero Secret Disclosure**: Neither probe ever exposes keys, passwords, connection strings, or internal paths.

---

### 9. Deterministic Graceful Shutdown (Phase 10.3)
* Centralized shutdown engine handles `SIGTERM`, `SIGINT`, and process exceptions.
* **Sequence**:
  1. Sets `isShuttingDown = true` (causing `/api/ready` to immediately return 503 so upstream load balancers stop routing new traffic).
  2. Stops accepting new HTTP connections via `server.close()`.
  3. Grants active in-flight requests and streams a bounded grace period (`SHUTDOWN_TIMEOUT_MS=15000`).
  4. Closes MongoDB database connection cleanly (`mongoose.disconnect()`).
  5. Exits process with code 0 (or 1 on uncaught fatal errors).
* Shutdown is strictly idempotent and safe against repeated signals.

---

### 10. SSE Streaming Configuration
* Endpoint: `POST /api/chat/stream`
* Sends HTTP headers:
  * `Content-Type: text/event-stream; charset=utf-8`
  * `Cache-Control: no-cache, no-transform`
  * `Connection: keep-alive`
  * `X-Accel-Buffering: no`
* Bounded stream concurrency: Max 2 concurrent active SSE streams per user/IP.

---

### 11. File & Media Upload Quotas
* Documents: Max 10 MB per file (`PDF`, `DOCX`, `TXT`, `CSV`).
* Images: Max 5 MB each, up to 3 images per message (sanitized via Sharp).
* Audio: Max 10 MB, up to 60 seconds server-side container duration validation.
* Concurrency Guard: Enforced before Multer memory allocation to protect RAM.

---

### 12. Storage Persistence Limitation (Ephemeral vs Persistent Volumes)
> [!WARNING]
> FAISI AI stores processed documents on the local filesystem (`storage/documents/`). On cloud platforms with ephemeral containers (e.g. basic dynos, serverless), filesystem writes are wiped on restart/redeploy. For production durability, deploy with a **Persistent Volume / Mounted Disk** or host on a persistent VM instance until cloud object storage (S3/GCS) is implemented in a future phase.

---

### 13. Single-Instance Architecture & Scaling Requirements
> [!NOTE]
> FAISI AI currently uses process-local in-memory state for:
> 1. `UploadConcurrencyManager` (RAM concurrency guard)
> 2. `StreamConcurrencyManager` (SSE stream bounds)
> 3. `TTSCache` (In-memory audio synthesis cache)
> 4. `LocalStorageProvider` (Local disk filesystem)
> 5. `MetricEngine` (In-memory operational telemetry)
>
> **Recommended Topology**: Single backend instance.
>
> **Future Horizontal Scaling Roadmap**:
> * Replace process-local memory counters with distributed Redis locks.
> * Replace `LocalStorageProvider` with AWS S3 or Google Cloud Storage.
> * Utilize Redis Pub/Sub for cross-instance token revocation cache invalidation.

---

### 14. Docker Container Deployment

Build and run using the production multi-stage Dockerfile:

```bash
# Build the production image
docker build -t nova-ai:latest .

# Run container with environment variables
docker run -d \
  --name nova-ai \
  -p 5000:5000 \
  -v nova_storage:/app/storage \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e CLIENT_URL=https://nova.example.com \
  -e MONGODB_URI=mongodb+srv://... \
  -e MONGODB_DB_NAME=nova_ai \
  -e AUTH_SECRET=... \
  -e GEMINI_API_KEY=... \
  nova-ai:latest
```

---

### 15. Operational Observability & Telemetry (Phase 10.6)

FAISI AI includes a bounded, deterministic, in-memory operational telemetry engine providing real-time visibility into HTTP traffic, AI operations, SSE streams, database status, document pipelines, RAG searches, media processing, and rate limiting.

#### Metrics Endpoint
```http
GET /api/metrics
```

#### Authentication
Requires an authenticated session (`nova_auth_token` HTTP-only cookie). Anonymous, unauthenticated, API key, and query-string token requests are strictly rejected with `401 Unauthorized`.

#### Purpose
Internal operational telemetry and observability snapshotting.

#### Storage
In-memory only. Telemetry is collected in process-local registry data structures with zero database overhead.

#### Persistence
Metrics reset whenever the server process restarts. Telemetry data is ephemeral and does not persist across deployments or container restarts.

#### Cardinality & Boundedness Protection
- Metric series cardinality is strictly bounded by `MAX_METRIC_SERIES = 500`. Once reached, no new series keys can be registered.
- Dynamic route IDs, query parameters, user IDs, and filenames are normalized or stripped to prevent label cardinality explosions.
- All metric snapshots are deep-cloned immutable objects to prevent client tampering.

#### Privacy & Security Controls
Metric labels are strictly restricted to bounded whitelists. The metrics endpoint never exposes sensitive data, including:
- Prompts, model completions, or retrieved text
- User IDs, email addresses, passwords, or JWTs
- Request IDs, conversation IDs, document IDs, or storage keys
- File names, file paths, MongoDB connection URIs, or environment secrets

#### Current Metric Families

* **HTTP Traffic**:
  * `nova_http_requests_total` (Counter: `method`, `route`, `statusClass`)
  * `nova_http_request_duration_ms` (Histogram: `method`, `route`, `statusClass`)
  * `nova_http_errors_total` (Counter: `method`, `route`, `statusClass`)
* **AI Operations**:
  * `nova_ai_requests_total` (Counter: `operation`, `model`, `statusClass`)
  * `nova_ai_retries_total` (Counter: `operation`, `model`)
  * `nova_ai_errors_total` (Counter: `operation`, `model`, `statusClass`)
  * `nova_ai_request_duration_ms` (Histogram: `operation`, `model`, `statusClass`)
* **SSE Streams**:
  * `nova_sse_active_streams` (Gauge: current active streaming connections)
  * `nova_sse_streams_total` (Counter: `outcome`)
  * `nova_sse_stream_duration_ms` (Histogram: `outcome`)
* **Database**:
  * `nova_db_connected` (Gauge: `database`, `1` when connected, `0` when disconnected)
  * `nova_db_errors_total` (Counter: `phase`)
* **Document Pipeline**:
  * `nova_document_uploads_total` (Counter: `status`)
  * `nova_document_processing_total` (Counter: `operation`, `outcome`)
  * `nova_document_processing_duration_ms` (Histogram: `operation`, `outcome`)
* **RAG & Knowledge Base**:
  * `nova_rag_searches_total` (Counter: `outcome`)
  * `nova_rag_search_duration_ms` (Histogram: `outcome`)
  * `nova_rag_indexing_total` (Counter: `outcome`)
  * `nova_rag_indexing_duration_ms` (Histogram: `outcome`)
* **Media & Voice**:
  * `nova_media_operations_total` (Counter: `operation`, `outcome`)
  * `nova_media_operation_duration_ms` (Histogram: `operation`, `outcome`)
* **Rate Limiting**:
  * `nova_rate_limit_rejections_total` (Counter: `limiter`)

#### Illustrative JSON Response Shape
```json
{
  "status": "ok",
  "timestamp": "2026-09-11T04:45:00.000Z",
  "metrics": {
    "timestamp": "2026-09-11T04:45:00.000Z",
    "seriesCount": 14,
    "counters": [
      {
        "name": "nova_http_requests_total",
        "labels": { "method": "GET", "route": "/api/metrics", "statusClass": "2xx" },
        "value": 1
      },
      {
        "name": "nova_ai_requests_total",
        "labels": { "operation": "chat", "model": "gemini-3.6-flash", "statusClass": "2xx" },
        "value": 12
      }
    ],
    "gauges": [
      {
        "name": "nova_sse_active_streams",
        "labels": {},
        "value": 0
      },
      {
        "name": "nova_db_connected",
        "labels": { "database": "nova_ai" },
        "value": 1
      }
    ],
    "histograms": [
      {
        "name": "nova_http_request_duration_ms",
        "labels": { "method": "GET", "route": "/api/metrics", "statusClass": "2xx" },
        "count": 1,
        "sum": 3.8,
        "min": 3.8,
        "max": 3.8,
        "buckets": { "10": 1, "50": 1, "+Inf": 1 }
      }
    ]
  }
}
```

---

## 🗺️ Project Roadmap

- **Phase 0: Project Foundation** — Clean architecture, Tailwind v4, build pipeline. *(Completed)*
- **Phase 1: Premium Frontend Interface** — Responsive UI, accessible chat components, dark/light themes. *(Completed)*
- **Phase 2: Real AI Integration** — Node.js backend, `@google/genai` SDK, `gemini-3.6-flash`, multi-turn context. *(Completed)*
- **Phase 3: Streaming + Conversation Engine** — Progressive SSE streaming, Stop generation, In-place regenerate, Auto-scroll, Content search. *(Completed)*
- **Phase 4: MongoDB + Persistent Conversations** — MongoDB persistence, Mongoose models, anonymous isolation, idempotent migration, rename/delete modals. *(Completed)*
- **Phase 5: User Authentication & Cloud Sync** — User accounts, bcrypt hashing, HTTP-only cookie sessions, IDOR protection, cloud synchronization. *(Completed)*
- **Phase 6: Secure Files + Document Analysis Foundation** — PDF/DOCX/CSV/TXT upload, magic-byte checks, structured extractors, prompt-safe Gemini analysis, IDOR security. *(Completed)*
- **Phase 7: Knowledge Base, Embeddings & RAG** — Chunking, embeddings (`gemini-embedding-2`), vector database (`mongodb_atlas`), semantic retrieval. *(Completed)*
- **Phase 8: Voice + Multimodal Intelligence** — Image understanding, speech-to-text (`gemini-3.5-transcribe`), text-to-speech (`gemini-3.1-flash-tts-preview`). *(Completed)*
- **Phase 9.1–9.3: Security Audit & Hardening** — Full vulnerability remediation, raster sanitization, CSP, JWT revocation, RAM concurrency cap. *(Completed)*
- **Phase 10.1: Production Environment & Configuration** — Environment validation, secret isolation, health endpoint, production guards. *(Completed)*
- **Phase 10.2: Production Deployment & Infrastructure** — Containerization, MongoDB Atlas vector configuration, origin topologies, and deployment readiness verification. *(Completed)*
- **Phase 10.3: Production Reliability** — Deterministic graceful shutdown, readiness probe (`/api/ready`), AI retry/timeout handling, stream & document lifecycle safety. *(Completed)*
- **Phase 10.4: Performance Optimization** — Frontend memoization, bundle splitting, database indexes, streaming buffer efficiency. *(Completed)*
- **Phase 10.5: Production UX Polish** — Accessible modal focus trapping, keyboard navigation, smooth scroll, zero CLS layouts. *(Completed)*
- **Phase 10.6: Observability & Monitoring** — Request correlation (AsyncLocalStorage), structured JSON logging, in-memory telemetry, read-only `/api/metrics` endpoint. *(Completed)*
- **Phase 10.7: Final Production QA** — End-to-end regression validation, security audit, browser smoke testing, production readiness scorecard. *(Completed)*
- **Phase 10.8: Release Preparation** — Lockfile synchronization, release documentation, zero-secret validation, release checklist, and release candidate finalization. *(Completed)*

