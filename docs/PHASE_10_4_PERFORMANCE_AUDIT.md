# NOVA AI — Phase 10.4 Performance Audit

**Audit Date**: September 11, 2026  
**Environment**: Windows, Node.js v24.15.0, Vite v6.4.3, React 19, Tailwind CSS v4, Express, MongoDB/Mongoose  

---

## 1. Baseline Measurements

### Frontend
* **Vite Production Build Time**: 15.53s (cold) / 3.60s (warm)
* **Total JS Bundle Size**: 806.66 kB (gzip: 210.91 kB) — single monolithic chunk `dist/assets/index-DW3aE4h_.js`
* **Total CSS Bundle Size**: 87.89 kB (gzip: 12.73 kB) — `dist/assets/index-fLYqxrNT.css`
* **Vite Build Notice**: `(!) Some chunks are larger than 500 kB after minification.`
* **Chunk Composition**: Monolithic bundle containing core runtime, Framer Motion, Lucide icons, all modals (Auth, Document Hub, Rename, Delete, Claim), and document upload/analysis components.

### Backend & Database
* **Health Check (`GET /api/health`)**: Immediate in-memory response (< 1ms).
* **Readiness Check (`GET /api/ready`)**: Connection status check (< 1ms).
* **Conversation Queries**: User-scoped indexing on `{ userId: 1, updatedAt: -1 }` with Mongoose `.lean()`.
* **Document Queries**: User-scoped indexing on `{ userId: 1, createdAt: -1 }` and unique `{ userId: 1, sha256: 1 }`.
* **RAG Vector Search**: In-memory cosine similarity and Atlas `$vectorSearch` with compound index `{ userId: 1, documentId: 1, generationId: 1, chunkIndex: 1 }`.
* **MongoDB Atlas Live Profiling**: `UNVERIFIED — environment limitation` (Atlas requires live cloud deployment).

### Streaming & Concurrency
* **SSE Stream Lifecycle**: Bounded to 2 active streams per user/IP via `streamConcurrencyManager`.
* **Upload Concurrency**: Bounded to 10 global / 2 per user via pre-Multer `uploadConcurrencyGuard`.
* **TTS Caching**: Bounded in-memory LRU (50 MB limit, 1800s TTL, user + voice + text key isolation).

---

## 2. Identified Bottlenecks & Candidate Evaluations

### Candidate 1: Monolithic Frontend Bundle & Modal Code Splitting
* **A. Baseline**: Single JS chunk of 806.66 kB (gzip: 210.91 kB) exceeding the 500 kB recommended chunk threshold.
* **B. Bottleneck**: Modals (`DocumentHubModal`, `AuthModal`, `ClaimConversationsModal`, `RenameModal`, `DeleteConfirmModal`) and vendor libraries are synchronously loaded on initial application load, even when the user is simply chatting.
* **C. Evidence**: Vite build warning and static import analysis in `src/App.jsx`.
* **D. Impact**: Increased initial bundle download and script parsing time for the initial page load.
* **E. Proposed Optimization**:
  * Implement `React.lazy()` and `Suspense` for user-demand dialogs (`DocumentHubModal`, `AuthModal`, `ClaimConversationsModal`, `RenameModal`, `DeleteConfirmModal`).
  * Configure Vite `manualChunks` in `vite.config.js` to split vendor dependencies (`vendor-react`, `vendor-ui`).
* **F. Risk**: Minimal. Must ensure `Suspense` fallbacks preserve smooth UI transitions without layout flicker.
* **G. Expected Improvement**: Expected reduction of initial chunk size below the 500 kB threshold; modular async loading for modals.
* **H. Decision**: **OPTIMIZE**.

---

### Candidate 2: React Message Re-Rendering During SSE Streaming
* **A. Baseline**: In `src/components/chat/MessageList.jsx` and `src/components/chat/Message.jsx`, every incoming SSE token chunk triggers re-renders of all previous messages in the active conversation.
* **B. Bottleneck**: For conversations with 50–500 messages, rendering is $O(N \times \text{chunks})$ without `React.memo` and stable callback references.
* **C. Evidence**: `Message.jsx` is an unmemoized functional component; `MessageList.jsx` creates inline arrow functions `(messageId, text) => playSpeech(messageId, text)` for each message on every render.
* **D. Impact**: Unnecessary CPU utilization, DOM diffing, and potential frame drops on low-power devices during fast AI token streaming.
* **E. Proposed Optimization**:
  * Wrap `Message` in `React.memo` with a focused prop equality comparator (comparing `id`, `content`, `status`, `sources`, `attachments`, `isPlayingSpeech`, `isSpeechLoading`).
  * Stabilize `onPlaySpeech` and `onRegenerate` callbacks using `useCallback` / stable references.
  * Memoize Markdown parsing in `FormattedContent`.
* **F. Risk**: Minimal. Must verify that active streaming message updates reactively while completed messages remain static.
* **G. Expected Improvement**: Completed messages skip re-rendering during streaming; CPU and DOM diffing reduced to $O(1)$ per token chunk.
* **H. Decision**: **OPTIMIZE**.

---

### Candidate 3: Sidebar Conversation Filtering & Date Grouping
* **A. Baseline**: `Sidebar.jsx` filters and groups conversations into "Today", "Yesterday", "Previous 7 Days", "Older" on every render pass.
* **B. Bottleneck**: When typing in search or when chat messages update, the full conversation list is re-filtered and partitioned repeatedly.
* **C. Evidence**: Unmemoized `filteredConversations` and `groups` array operations in `Sidebar.jsx`.
* **D. Impact**: Redundant array iterations on every state change.
* **E. Proposed Optimization**:
  * Wrap `filteredConversations` and `groups` in `useMemo([conversations, searchQuery])`.
  * Wrap `Sidebar` in `React.memo`.
* **F. Risk**: None.
* **G. Expected Improvement**: Grouping executes only when conversations or search query change.
* **H. Decision**: **OPTIMIZE**.

---

### Candidate 4: MongoDB Indexes & Query Optimization
* **A. Baseline**:
  * `Conversation`: `{ userId: 1, updatedAt: -1 }` (compound), `{ clientId: 1, updatedAt: -1 }` (compound).
  * `Document`: `{ userId: 1, createdAt: -1 }` (compound), `{ userId: 1, sha256: 1 }` (compound, unique).
  * `DocumentChunk`: `{ userId: 1, documentId: 1, generationId: 1, chunkIndex: 1 }` (compound, unique), `{ userId: 1, generationId: 1, createdAt: -1 }` (compound).
  * Read queries use `.lean({ virtuals: true })` across services.
* **B. Bottleneck**: None identified. All query paths have matching compound indexes with tenant isolation.
* **C. Evidence**: Schema review and query pattern verification in `Conversation.js`, `Document.js`, and `DocumentChunk.js`.
* **D. Impact**: N/A.
* **E. Proposed Optimization**: Maintain existing indexes; avoid speculative index bloating.
* **F. Risk**: N/A.
* **G. Expected Improvement**: N/A.
* **H. Decision**: **NO CHANGE REQUIRED**.

---

### Candidate 5: RAG Embedding Batching & Retrieval Bounds
* **A. Baseline**: `embeddingService` batches chunk embeddings in groups of 20 with exponential retry backoff. `retrievalService` limits queries to 500 characters, context to 12,000 characters, and topK to 5 chunks.
* **B. Bottleneck**: None. Batch size 20 aligns with Gemini API limits and minimizes HTTP overhead while avoiding payload limits.
* **C. Evidence**: `server/services/rag/retrievalService.js` and `server/services/embeddings/embeddingService.js`.
* **D. Impact**: N/A.
* **E. Proposed Optimization**: Retain verified configuration.
* **F. Risk**: N/A.
* **G. Expected Improvement**: N/A.
* **H. Decision**: **NO CHANGE REQUIRED**.

---

### Candidate 6: Media Processing & In-Memory TTS Cache
* **A. Baseline**: `imageValidationService` parses image dimensions directly from binary headers without external process invocation. Sharp strips metadata and limits dimensions. `BoundedTTSCache` enforces a 50MB ceiling with LRU eviction and 1800s TTL.
* **B. Bottleneck**: None.
* **C. Evidence**: `server/services/media/imageValidationService.js` and `server/services/media/speechSynthesisService.js`.
* **D. Impact**: N/A.
* **E. Proposed Optimization**: Retain verified bounded LRU caching and header-based dimension parsing.
* **F. Risk**: N/A.
* **G. Expected Improvement**: N/A.
* **H. Decision**: **NO CHANGE REQUIRED**.

---

## 3. Summary of Decisions

| # | Optimization Area | Candidate | Decision |
|---|---|---|---|
| 1 | Frontend Bundle | Route/Modal Code-Splitting + Vendor Chunking | **OPTIMIZE** |
| 2 | Message Rendering | `React.memo` on `Message` + Stable Callbacks + Memoized Markdown | **OPTIMIZE** |
| 3 | Sidebar & Layout | `useMemo` on Sidebar Grouping + `React.memo` on `Sidebar` | **OPTIMIZE** |
| 4 | Database Queries | Query Projections & Indexing | **NO CHANGE REQUIRED** |
| 5 | RAG & Embeddings | Embedding Batching & Retrieval Bounds | **NO CHANGE REQUIRED** |
| 6 | Media & TTS | Image Header Parsing & Bounded LRU Cache | **NO CHANGE REQUIRED** |
| 7 | Infrastructure | Redis / S3 / CDN | **DEFER / OUT OF SCOPE** |
| 8 | Cloud Profiling | MongoDB Atlas Profiling | **ENVIRONMENT UNVERIFIED** |
