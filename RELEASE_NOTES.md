# SABU AI — Release Notes

## Version: v0.8.1 (Production Release Candidate)
**Release Stage:** Production Release Candidate  
**Date:** September 11, 2026  
**Status:** Approved with Warnings (Release Preparation Complete)  

---

## 🌟 Highlights & Capabilities

SABU AI is a multi-tenant, full-stack AI workspace and assistant platform powered by Google Gemini. The v0.8.1 Production Release Candidate aggregates all capabilities across Phases 0 through 10.8:

### 1. Intelligent Chat & Streaming Engine
- Progressive Server-Sent Events (SSE) streaming with non-buffering (`X-Accel-Buffering: no`).
- User-owned turn persistence with optimistic UI updates and auto-scrolling management.
- Instant stream interruption via client `AbortController` and backend cancellation handling.
- In-place response regeneration and client-side conversational search.

### 2. Authentication & Multi-Tenant Isolation
- Secure user registration, credential authentication, and session termination.
- Password hashing with salted `bcryptjs` and constant-time dummy comparisons against timing attacks.
- JWT session management delivered exclusively via HTTP-only, `SameSite=lax`, secure cookies.
- Atomic `tokenVersion` counter for instant stateless session revocation across all active devices on logout.
- Strict multi-tenant IDOR defense across all user data queries.

### 3. Document Processing & Analysis Hub
- Multi-format ingestion supporting `PDF`, `DOCX`, `TXT`, and `CSV`.
- Multi-layer structural validation: magic bytes (`%PDF-`, `PK\x03\x04`), OpenXML structure verification via `adm-zip`, and UTF-8 / binary control byte ratio analysis.
- Pure JS RFC 4180 CSV parser with structured table preview and bounded dimensions.
- Bounded text extraction engines with execution timeouts (`Promise.race`).
- Gemini AI document analysis with prompt-injection isolation armor (`<DOCUMENT_CONTENT>`).

### 4. Retrieval-Augmented Generation (RAG) & Knowledge Base
- Semantic chunking engine with configurable token/character boundaries.
- Vector embeddings generated via `gemini-embedding-2` (768 dimensions).
- Multi-tenant vector retrieval querying MongoDB Atlas Vector Search (`$vectorSearch`) with strict `userId` pre-filtering.
- Production guard rejecting silent local-memory vector store fallbacks (`ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD=false`).

### 5. Multimodal & Audio Intelligence
- Image understanding supporting JPEG, PNG, WebP, and GIF.
- Defensive image rasterization and metadata sanitization using `sharp` to strip malicious EXIF/XMP payloads.
- Server-side speech-to-text audio transcription via `gemini-3.5-transcribe` with container duration validation.
- Text-to-speech audio synthesis via `gemini-3.1-flash-tts-preview` with bounded in-memory LRU caching (`TTSCache`).

### 6. Production Reliability & Operational Observability
- Strict environment schema validator (`validateEnv`) failing fast on invalid/missing configs.
- Liveness probe (`GET /api/health`) and MongoDB readiness probe (`GET /api/ready`).
- Centralized deterministic graceful shutdown engine (`SIGTERM`/`SIGINT`) with connection draining.
- Request correlation tracing powered by `AsyncLocalStorage` (`reqId`).
- High-performance, bounded, structured JSON logging with automatic credential redaction.
- Process-local in-memory telemetry engine with read-only, authenticated `/api/metrics` endpoint bounded by `MAX_METRIC_SERIES = 500`.

---

## 🔒 Security Summary

SABU AI enforces defense-in-depth across all application layers:
- **Zero Client Secrets**: All API keys, database credentials, and signing secrets reside exclusively server-side.
- **Content Security Policy (CSP)**: Strict deny-by-default CSP configured via `helmet`.
- **CORS & CSRF Origin Enforcement**: Strict allowlist validation against `CLIENT_URL` for all state-changing endpoints (`POST`, `PATCH`, `DELETE`).
- **RAM Concurrency Guards**: Global and per-user semaphore limits before allocating multipart memory buffers (`MAX_CONCURRENT_UPLOADS=10`).
- **Input & Extraction Limits**: Hard caps on file size (10 MB), audio duration (60s), CSV cells (50,000), extracted characters (100,000), and analysis instructions (1,000).

---

## ⚙️ Production Deployment & Infrastructure

SABU AI supports two deployment patterns:
- **Option A (Unified Same-Origin, Recommended)**: Express serves both the backend API and the static `/dist` frontend assets from a single origin. Simplifies cookies and CORS.
- **Option B (Split-Origin)**: Frontend hosted on CDN/static host and API hosted on separate backend service. Requires exact `CLIENT_URL` configuration.

### Containerization
- Production multi-stage `Dockerfile` based on `node:22-alpine`.
- Non-root runtime (`USER node`).
- Automated liveness container healthcheck.
- `.dockerignore` strictly excludes `.env`, `node_modules`, `storage/`, and test fixtures.

---

## ⚠️ Known Verification Limitations

During automated verification in the build environment, the following checks were evaluated as **UNVERIFIED** due to environment isolation:

1. **MongoDB Live E2E (UNVERIFIED)**: The automated regression test suite validates Mongoose schemas, connection managers, mock operations, and query logic. Live connection to an external MongoDB Atlas cluster requires live network credentials.
2. **Google Gemini Live E2E (UNVERIFIED)**: Upstream Gemini API inference, streaming, embeddings, and transcription use mock adapters during automated tests to avoid billable external dependencies and rate limits.
3. **Docker Build / Container Runtime (UNVERIFIED)**: Docker CLI was not available in the Windows audit runner. Dockerfile and `.dockerignore` were verified via static analysis.

### Operational Notice
- **Storage Persistence**: Local filesystem storage (`storage/documents/`, `storage/media/`) requires persistent volume mounts on container platforms with ephemeral storage.
- **Metrics Scope**: Telemetry collected at `/api/metrics` is process-local and resets upon server restart.
- **Horizontal Scaling**: Multi-instance deployments require external shared infrastructure (e.g., Redis for rate limits / concurrency locks, cloud object storage for files).

---

## 📋 Pre-Release Checklist

```text
[ ] Production environment created
[ ] AUTH_SECRET generated securely (>= 32 characters, crypto-random)
[ ] GEMINI_API_KEY configured server-side
[ ] MongoDB Atlas cluster provisioned and credentials protected
[ ] MongoDB vector index ('vector_index') created on 'documentchunks' collection
[ ] Persistent storage volume mounted to storage/ directory
[ ] CLIENT_URL configured to exact production frontend origin
[ ] TLS / HTTPS enabled at ingress / reverse proxy
[ ] TRUST_PROXY configured according to reverse proxy hop count
[ ] NODE_ENV set to 'production'
[ ] VECTOR_STORE_TYPE set to 'mongodb_atlas'
[ ] ALLOW_IN_MEMORY_VECTOR_STORE_IN_PROD set to 'false'
[ ] LOG_LEVEL configured ('INFO' or 'WARN')
[ ] Health endpoint (/api/health) verified
[ ] Readiness endpoint (/api/ready) verified
[ ] Automated regression tests passed (411/411)
[ ] Production build verified (npm run build)
[ ] Secret scan passed (0 real secrets found)
[ ] npm audit reviewed (adm-zip advisory noted and evaluated)
```
