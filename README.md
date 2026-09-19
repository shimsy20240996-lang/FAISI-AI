# FAISI AI

<div align="center">

**Your AI. Your Way.**

An enterprise-grade, multi-tenant AI assistant and workspace platform powered by Google Gemini, featuring progressive streaming, multimodal vision, vector RAG, voice intelligence, and a prompt-isolated document analysis engine.

[![Version](https://img.shields.io/badge/version-0.8.1--RC-indigo.svg?style=flat-square)](RELEASE_NOTES.md)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF.svg?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4.svg?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x_LTS-339933.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-8.0-47A248.svg?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Google GenAI](https://img.shields.io/badge/Google_GenAI-Gemini_3.6_Flash-4285F4.svg?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Tests](https://img.shields.io/badge/Tests-445%20Passing-brightgreen.svg?style=flat-square)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)]()

</div>

> **FAISI AI**<br />
> Inspired by Failul Rahman & Sithy Siyama.<br />
> *Your AI. Your Way.*

---

## 🌟 Modern Core Capabilities & Features

### ⚡ Resilient AI Streaming & Automatic Model Failover
- **Dual-Model Strategy**: High-speed reasoning powered by primary `gemini-3.6-flash` with automatic zero-downtime failover to `gemini-3.5-flash-lite` on transient upstream `503 UNAVAILABLE`, `429 RATE_LIMIT`, or network timeouts.
- **Progressive SSE Streaming**: Real-time token streaming with `text/event-stream` and non-buffering (`X-Accel-Buffering: no`).
- **Stream Integrity Guard**: Guaranteed stream atomicity — fails over only before partial output is emitted to prevent duplicate or corrupt conversational chunks.
- **Client Control**: Instant stream interruption via client-side `AbortController` and seamless in-place message regeneration.

### 🧠 Semantic Vector Knowledge Base & RAG Engine
- **Retrieval-Augmented Generation (RAG)**: Ingest documents into user-scoped vector knowledge bases for factual, context-grounded AI responses.
- **Semantic Chunking & Embeddings**: High-dimensional vector generation via `gemini-embedding-2` (768 dimensions) with sentence-boundary preservation.
- **MongoDB Atlas Vector Search**: Scalable `$vectorSearch` with strict `userId` pre-filtering to ensure multi-tenant isolation.
- **Strict Anti-Hallucination Armor**: Displays structured bracketed citations (e.g. `[1]`, `[2]`) with strict fallback when insufficient evidence is found.

### 👁️ Multimodal Visual Intelligence
- **Vision Understanding**: High-fidelity image reasoning supporting `PNG`, `JPEG`, `WebP`, and `GIF`.
- **Sanitized Raster Pipeline**: Server-side image decoding, rasterization, and EXIF/XMP metadata stripping powered by `sharp` to eliminate hidden adversarial payloads.
- **Multimodal Message Persistence**: Turn-by-turn image metadata persistence and synchronized UI previews without storing raw uncompressed binaries in database collections.

### 🎙️ Voice & Audio Intelligence
- **Speech-to-Text Transcription**: Audio prompt processing via `gemini-3.5-transcribe` with server-side duration container bounds ($\le 60\text{s}$).
- **Text-to-Speech (TTS) Synthesis**: High-fidelity speech synthesis via `gemini-3.1-flash-tts-preview` with bounded in-memory LRU audio caching (`TTSCache`).

### 📄 Secure Multi-Format Document Workspace
- **Multi-Format Support**: Native parsing for `PDF`, `DOCX`, `CSV`, and `TXT` files.
- **Multi-Layer Defensive Validation**: Magic byte verification (`%PDF-`, `PK\x03\x04`), OpenXML archive descriptor verification (`adm-zip`), UTF-8 validation, and null byte / binary control ratio detection.
- **Structured CSV Engine**: Pure RFC 4180 CSV parser with interactive table preview (10 rows $\times$ 20 cols) and Markdown table generation.
- **Prompt-Injection Defense**: User document content is bounded and isolated within strict `<DOCUMENT_CONTENT>` boundaries with immutable system boundaries.

### 🔒 Enterprise Zero-Trust Security & Authentication
- **Secure Sessions**: Authentication via salted `bcryptjs` password hashing and signed JWT session tokens delivered exclusively through HTTP-only, `SameSite=lax`, secure cookies (`nova_auth_token`).
- **Instant Stateless Token Revocation**: Atomic `tokenVersion` counter in MongoDB revokes old session tokens immediately on logout across all active devices.
- **Timing-Attack Defense**: Constant-time dummy bcrypt hashing on non-existent usernames/emails to eliminate credential enumeration attacks.
- **RAM Concurrency Guard**: Global (`MAX_CONCURRENT_UPLOADS=10`) and per-user semaphore limiter throttles multipart requests *before* in-memory buffer allocation.
- **Content Security Policy (CSP)**: Strict deny-by-default CSP configured via `helmet` protecting against XSS and clickjacking.
- **Strict Multi-Tenant IDOR Defense**: All document, conversation, and media queries enforce `userId: req.user._id`.

### 📊 Real-Time Observability & Telemetry
- **In-Memory Telemetry Engine**: Bounded operational metric registry (`MAX_METRIC_SERIES = 500`) tracking HTTP traffic, AI calls, SSE streams, DB health, RAG queries, and rate limiter rejections.
- **Read-Only Metrics Endpoint**: Authenticated `GET /api/metrics` for operational snapshots with zero secret exposure.
- **Request Tracing**: End-to-end request correlation powered by `AsyncLocalStorage` (`reqId`) and structured JSON logging with credential redaction.

### 🎨 Modern Adaptive UI & Accessibility
- **React 19 & Tailwind CSS v4**: Fluid, responsive glassmorphic aesthetic optimized for desktop, tablet, and mobile.
- **Accessible Interactions**: WCAG 2.2 compliant keyboard shortcuts (`Ctrl+N` for new chat, `Shift+Enter` for newline, `Esc` for dialogs) and `aria-live` screen-reader status regions.
- **Persistent Preferences**: Seamless dark/light theme switching with multi-key fallback (`faisi_theme` $\rightarrow$ `sabu_theme` $\rightarrow$ `nova_theme`).

---

## 🏛️ System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                     FAISI AI Client (React 19 + Vite 6)                  │
│  - React AuthContext (JWT Cookie Sessions & Cloud Sync)                  │
│  - Document Workspace & AI Analysis Hub Modal (PDF, DOCX, CSV, TXT)      │
│  - Multimodal Visual Composer & Voice Audio Transcription                │
│  - Streaming Conversation Engine (SSE, AbortController, Regenerate)      │
│  - Knowledge Base RAG Toggle & Inline Citation Grounding                 │
│  - Accessible Keyboard Navigation, Theme Persistence & Search            │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │  HTTPS / Server-Sent Events (SSE) / Multipart
                                     │  Credentials: 'include' (HTTP-only Cookie)
                                     │  (/api/auth/*, /api/conversations/*, /api/documents/*, /api/chat/*)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   FAISI AI Backend Server (Node.js + Express)            │
│  - Request Correlation Tracing (AsyncLocalStorage reqId) & Logger        │
│  - Helmet Security Headers & Strict Deny-By-Default CSP Directives       │
│  - CORS / CSRF Origin Validation (CLIENT_URL Allowlist)                  │
│  - Pre-Multer RAM Concurrency Limiter (10 Global / 2 Per-User)           │
│  - Multi-Layer File Validator (Magic Bytes, OpenXML, UTF-8 Ratios)       │
│  - Cookie Parser (nova_auth_token) & Authenticate JWT Middleware         │
│  - Document Extractors (pdf-parse v2, mammoth, RFC 4180 CSV)             │
│  - Sharp Image Rasterization & EXIF/XMP Metadata Stripping               │
│  - Bounded In-Memory Operational Metric Engine (/api/metrics)            │
└──────────────┬─────────────────────────────┬─────────────────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐   ┌───────────────────────────────────────────┐
│ Document & Chat Service  │   │       AI Provider Abstraction Layer       │
│ - User-Scoped Quotas     │   │ - @google/genai SDK (v1 API)              │
│ - Concurrency Throttling │   │ - Primary Model: gemini-3.6-flash         │
│ - User SHA-256 Dupe Check│   │ - Fallback Model: gemini-3.5-flash-lite   │
│ - Strict IDOR Protection │   │ - Embeddings: gemini-embedding-2 (768-d)  │
│ - Atomic Rollback Guard  │   │ - Audio STT: gemini-3.5-transcribe        │
└──────────────┬───────────┘   │ - Audio TTS: gemini-3.1-flash-tts-preview │
               │               │ - Prompt Injection Defense Isolation Armor│
               │               └─────────────────────┬─────────────────────┘
               ▼                                     ▼
┌──────────────────────────┐             ┌───────────────────────┐
│     MongoDB Atlas        │             │   Google Gemini API   │
│ - Users (bcrypt, version)│             │ - generateContent     │
│ - Conversations & Turns  │             │ - generateContentStream│
│ - Documents & Metadata   │             │ - embedContent        │
│ - DocumentChunks (Vector)│             └───────────────────────┘
│ - Atlas $vectorSearch    │
└──────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/) | Code-split bundle with lazy-loaded modal architecture |
| **Frontend Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Modern CSS variable tokens, glassmorphism, responsive grid |
| **Motion & Icons** | [Framer Motion](https://www.framer.com/motion/) + [Lucide React](https://lucide.dev/) | Smooth layout animations, micro-interactions, accessible SVGs |
| **Backend Runtime** | [Node.js](https://nodejs.org/) (v22+ / v24.x) + [Express](https://expressjs.com/) | High-performance asynchronous REST and SSE backend |
| **Database & ODM** | [MongoDB Atlas](https://www.mongodb.com/) + [Mongoose 8](https://mongoosejs.com/) | Compound indexing, transaction safety, vector store |
| **Vector Search** | [MongoDB Atlas Vector Search](https://www.mongodb.com/products/platform/atlas-vector-search) | Cosine similarity indexing, 768 dimensions, `userId` pre-filter |
| **AI Intelligence** | [Google GenAI SDK (`@google/genai`)](https://www.npmjs.com/package/@google/genai) | Gemini 3.6 Flash, Gemini 3.5 Flash Lite, Gemini Embedding 2 |
| **Image Processing** | [Sharp](https://sharp.pixelplumbing.com/) (v0.35.4) | Secure rasterization, resizing, metadata stripping |
| **Document Parsers** | `pdf-parse` (v2.4.5) + `mammoth` (v1.12.2) + `adm-zip` | AST extraction, OpenXML inspection, pure RFC 4180 CSV |
| **Authentication & Crypto** | `bcryptjs` + `jsonwebtoken` + `cookie-parser` + `crypto` | HTTP-only session cookies, SHA-256 deduplication, timing defense |
| **Security & Headers** | `helmet` + `express-rate-limit` + CSRF Origin Validation | Deny-by-default CSP, RAM concurrency guards, CORS controls |
| **Streaming Protocol** | Server-Sent Events (`text/event-stream`) | Low-latency non-buffered token streaming with cancellation |
| **Telemetry & Tracing** | `AsyncLocalStorage` + Structured JSON Logger | In-memory operational metrics registry (`/api/metrics`) |

---

## 📁 Directory Structure

```text
faisi-ai/
├── server/
│   ├── config/
│   │   ├── database.js              # MongoDB connection manager with auto-retry
│   │   └── env.js                   # Strict environment variable schema validation
│   ├── controllers/
│   │   ├── authController.js        # Register, login, logout, getMe handlers
│   │   ├── chatController.js        # SSE streaming & health endpoint handlers
│   │   ├── conversationController.js# User-scoped conversation CRUD & search
│   │   ├── documentController.js    # Document upload, extraction, preview, analysis
│   │   ├── mediaController.js       # Multimodal image & voice audio handlers
│   │   ├── metricsController.js     # Authenticated operational telemetry endpoint
│   │   └── ragController.js         # Knowledge base semantic search & indexing
│   ├── middleware/
│   │   ├── authenticate.js          # HTTP-only cookie JWT validator & req.user
│   │   ├── csrfProtection.js        # Origin / Referer validation for mutation requests
│   │   ├── csp.js                   # Helmet Content Security Policy directives
│   │   ├── errorHandler.js          # Normalized JSON error response handler
│   │   ├── rateLimiter.js           # Auth, upload, chat, and analysis rate limiters
│   │   ├── requestId.js             # AsyncLocalStorage request correlation tracing
│   │   └── requestValidation.js     # Request body schema validator
│   ├── models/
│   │   ├── User.js                  # User schema with bcrypt & tokenVersion revocation
│   │   ├── Conversation.js          # Conversation & message turns schema
│   │   ├── Document.js              # Document metadata & bounded extraction text schema
│   │   └── DocumentChunk.js         # Vector embedding chunks with Atlas indexes
│   ├── routes/
│   │   ├── authRoutes.js            # Express router (/api/auth/*)
│   │   ├── chatRoutes.js            # Express router (/api/health, /api/chat/stream)
│   │   ├── conversationRoutes.js    # Express router (/api/conversations/*)
│   │   ├── documentRoutes.js        # Express router (/api/documents/*)
│   │   ├── mediaRoutes.js           # Express router (/api/media/*)
│   │   ├── metricsRoutes.js         # Express router (/api/metrics)
│   │   └── ragRoutes.js             # Express router (/api/rag/*)
│   ├── services/
│   │   ├── authService.js           # JWT signing, verification, cookie management
│   │   ├── conversationService.js   # Scoped conversation operations & claiming
│   │   ├── storage/                 # Pluggable storage facade & filesystem provider
│   │   ├── documents/               # Validation, extractors (PDF, DOCX, CSV, TXT)
│   │   ├── rag/                     # Chunking, embeddings, and Atlas retrieval
│   │   ├── media/                   # Image sanitization (Sharp) & audio processing
│   │   └── ai/                      # Gemini service with retry/fallback & system prompts
│   ├── test/                        # Automated test suites (445 tests)
│   ├── utils/                       # Structured logger, metrics registry, error classes
│   ├── .env.example                 # Backend environment configuration template
│   └── server.js                    # Express application entry point
├── src/
│   ├── components/
│   │   ├── auth/                    # AuthModal, ClaimConversationsModal
│   │   ├── chat/                    # ChatContainer, Message, Composer, Suggestions
│   │   ├── common/                  # Badge, Button, IconButton, Card, Modal, Tooltip
│   │   ├── documents/               # FileUploadZone, DocumentCard, Modals
│   │   ├── layout/                  # MainLayout, Sidebar, MobileSidebar, TopBar
│   │   └── modals/                  # Rename, Delete, Settings, Help, ModelSelector
│   ├── context/
│   │   └── AuthContext.jsx          # React session state & authentication provider
│   ├── hooks/                       # useTheme, useSidebar, useAutoResize, useAutoScroll
│   ├── services/
│   │   └── api.js                   # Frontend API client (credentials: 'include')
│   ├── utils/                       # Constants, client IDs, formatting helpers
│   ├── App.jsx                      # Application root & modal orchestration
│   ├── index.css                    # Tailwind CSS v4 design tokens & base rules
│   └── main.jsx                     # Entry point mounting React root
├── test_fixtures/                   # Test assets for document extraction QA
├── Dockerfile                       # Multi-stage production container definition
├── render.yaml                      # Render Blueprint infrastructure specification
├── package.json                     # Scripts & full-stack dependencies
└── README.md                        # Project documentation
```

---

## 💻 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v22.x LTS or v20+ recommended)
- `npm` (version 10+)
- [MongoDB](https://www.mongodb.com/) (local instance or MongoDB Atlas cluster)
- Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

---

### 1. Installation

Clone the repository and install all dependencies:

```bash
git clone https://github.com/shimsy20240996-lang/FAISI-AI.git
cd FAISI-AI
npm install
```

---

### 2. Environment Configuration

Copy the `.env.example` template to `.env`:

```bash
cp .env.example .env
```

Configure your environment settings:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# Authentication & Session Security (Min 32 random characters)
AUTH_SECRET=your_secure_random_jwt_secret_of_at_least_32_characters_here
AUTH_EXPIRES_IN=7d

# MongoDB Database Connection
MONGODB_URI=mongodb://localhost:27017/nova_ai
MONGODB_DB_NAME=nova_ai

# Google Gemini AI Configuration
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite

# Timeouts & Bounds (milliseconds)
REQUEST_TIMEOUT_MS=30000
AI_STREAM_TIMEOUT_MS=60000

# Document & Storage Quotas
MAX_FILE_SIZE_MB=10
MAX_USER_STORAGE_MB=100
MAX_DOCUMENTS_PER_USER=50
MAX_EXTRACTED_TEXT_CHARS=100000
MAX_ANALYSIS_CONTEXT_CHARS=50000
STORAGE_DIR=storage/documents

# Vector Knowledge Base & RAG
VECTOR_STORE_TYPE=mongodb_atlas
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSIONS=768
RAG_TOP_K=5

# Multimodal & Media Processing
MULTIMODAL_ENABLED=true
MAX_IMAGE_SIZE_MB=5
MAX_IMAGES_PER_MESSAGE=3
VOICE_INPUT_ENABLED=true
TTS_ENABLED=true
```

> [!CAUTION]
> Never commit real secrets or `.env` files to source control. `.gitignore` is configured to exclude all `.env` files.

---

### 3. Run Local Development Server

Start both the Node.js backend server and Vite frontend concurrently:

```bash
npm run dev
```

- **Frontend Client**: `http://localhost:3000`
- **Backend API**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/api/health`

---

### 4. Run Automated Test Suite

Execute the full automated regression and security test suite:

```bash
node --test server/test/*.test.js
```

---

### 5. Build for Production

Generate the optimized production build into `/dist`:

```bash
npm run build
```

---

## 🔌 API Reference & Endpoints

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register new user, set HTTP-only cookie | No |
| `POST` | `/api/auth/login` | Authenticate credentials, set session cookie | No |
| `POST` | `/api/auth/logout` | Revoke tokenVersion, clear session cookie | Yes |
| `GET` | `/api/auth/me` | Return active authenticated user profile | Yes |

### 💬 Chat & AI Streaming (`/api`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/chat/stream` | Progressive SSE streaming with fallback | Optional |
| `POST` | `/api/chat` | Synchronous non-streaming chat generation | Optional |
| `GET` | `/api/health` | Safe liveness & database status probe | No |
| `GET` | `/api/ready` | Readiness probe for reverse proxies | No |

### 📁 Document Hub & Analysis (`/api/documents`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/documents` | Multipart file upload (PDF/DOCX/CSV/TXT) | Yes |
| `GET` | `/api/documents` | List user's documents with pagination | Yes |
| `GET` | `/api/documents/stats` | Return storage and document count usage | Yes |
| `GET` | `/api/documents/:id` | Get document metadata (IDOR protected) | Yes |
| `GET` | `/api/documents/:id/content` | Get extracted text or CSV table preview | Yes |
| `POST` | `/api/documents/:id/analyze` | Run prompt-armored AI document analysis | Yes |
| `DELETE` | `/api/documents/:id` | Delete file from storage and remove record | Yes |

### 📚 Knowledge Base & RAG (`/api/rag`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/rag/index` | Chunk & embed document into vector index | Yes |
| `POST` | `/api/rag/search` | Query semantic vector knowledge base | Yes |
| `GET` | `/api/rag/status/:id` | Check vector embedding indexing status | Yes |

### 🎙️ Media & Voice Intelligence (`/api/media`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/media/upload-image` | Upload & sanitize image via Sharp | Yes |
| `POST` | `/api/media/transcribe` | Transcribe voice audio (speech-to-text) | Yes |
| `POST` | `/api/media/tts` | Synthesize speech from text with cache | Yes |

### 📊 Observability & Metrics (`/api/metrics`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/metrics` | In-memory operational metrics snapshot | Yes (Cookie) |

---

## 🔒 Security Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                       FAISI AI Security Defenses                        │
├────────────────────────────────┬────────────────────────────────────────┤
│ Zero Client Secrets            │ All API keys, DB URIs, and JWT secrets │
│                                │ reside strictly server-side in .env    │
├────────────────────────────────┼────────────────────────────────────────┤
│ HTTP-Only Cookie Sessions      │ Tokens cannot be accessed by JS        │
│                                │ (SameSite=lax, Secure in production)   │
├────────────────────────────────┼────────────────────────────────────────┤
│ Stateless Token Revocation     │ Atomic tokenVersion increment revokes  │
│                                │ all device sessions on logout          │
├────────────────────────────────┼────────────────────────────────────────┤
│ Prompt Injection Isolation     │ Source data is strictly isolated in    │
│                                │ <DOCUMENT_CONTENT> & <RETRIEVED_KB>    │
├────────────────────────────────┼────────────────────────────────────────┤
│ RAM Concurrency Guard          │ Pre-Multer semaphore limits active RAM │
│                                │ file allocations (10 Global / 2 User)  │
├────────────────────────────────┼────────────────────────────────────────┤
│ Image Raster Sanitization      │ Sharp strips EXIF, XMP, comments, and  │
│                                │ re-encodes all image uploads           │
├────────────────────────────────┼────────────────────────────────────────┤
│ Strict IDOR Multi-Tenancy      │ Every query strictly scopes to userId  │
├────────────────────────────────┼────────────────────────────────────────┤
│ Content Security Policy (CSP)  │ Helmet deny-by-default CSP rules       │
└────────────────────────────────┴────────────────────────────────────────┘
```

---

## 🚀 Production Deployment & Containerization

### Option A: Unified Same-Origin Architecture (Recommended)

In this architecture, the Node.js Express server hosts both the backend `/api/*` endpoints and serves the static production `/dist` frontend assets with single-origin routing.

```bash
# 1. Build production image
docker build -t faisi-ai:latest .

# 2. Run container
docker run -d \
  --name faisi-ai \
  -p 5000:5000 \
  -v faisi_storage:/app/storage \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e CLIENT_URL=https://faisi-ai.onrender.com \
  -e MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/nova_ai \
  -e MONGODB_DB_NAME=nova_ai \
  -e AUTH_SECRET=your_crypto_random_secret_here \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  faisi-ai:latest
```

### MongoDB Atlas Vector Search Index Configuration

To enable semantic RAG retrieval in production, create a vector index on the `documentchunks` collection in MongoDB Atlas:

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

---

## 🗺️ Project Roadmap & Status

- [x] **Phase 0: Architecture & Foundation** — Clean folder structure, Tailwind v4 design system.
- [x] **Phase 1: Modern Frontend Interface** — Glassmorphic chat interface, dark/light themes.
- [x] **Phase 2: Gemini AI Integration** — Real-time Node.js backend with `@google/genai`.
- [x] **Phase 3: Streaming Engine** — Progressive SSE, abort controller, regenerate, search.
- [x] **Phase 4: MongoDB & Persistence** — Mongoose persistence, conversation models, migration.
- [x] **Phase 5: User Authentication** — Salted bcrypt, HTTP-only JWT cookies, IDOR defense.
- [x] **Phase 6: Multi-Format Document Analysis** — PDF/DOCX/CSV/TXT upload, extractors, prompt armor.
- [x] **Phase 7: Knowledge Base & Vector RAG** — Embeddings (`gemini-embedding-2`), Atlas Vector Search.
- [x] **Phase 8: Multimodal & Voice** — Sharp raster sanitization, STT audio transcription, TTS synthesis.
- [x] **Phase 9: Security Audit & Hardening** — Full vulnerability remediation, CSP, RAM concurrency limits.
- [x] **Phase 10.1–10.6: Production Reliability & Telemetry** — Graceful shutdown, in-memory metric engine.
- [x] **Phase 10.7: Gemini Streaming Resilience** — Dual-model fallback (`gemini-3.6-flash` $\rightarrow$ `gemini-3.5-flash-lite`).
- [x] **Phase 10.8: FAISI AI Rebrand & Release** — Full production rebrand, 100% test pass (445/445), live release candidate.

---

## 📄 License

This project is licensed under the **MIT License**.
