# DB Performance Tester — Implementation Plan

## Overview

A diagnostics utility in the **Settings → Performance** tab. It creates a completely
isolated sandbox SQLite database (temp file, auto-deleted on completion or error), seeds
it with realistic jewellery-store data at a chosen size, runs a fixed benchmark suite,
and reports timing + throughput per test. Nothing touches the production database.

---

## Architecture

### Communication pattern

```
Angular → ipcRenderer.invoke('perfTest:run', config)  → main process
                                                         ↓ returns { started: true } immediately
Angular ← ipcRenderer.on('perfTest:progress', …)      ← setImmediate chain between phases
Angular ← ipcRenderer.on('perfTest:result',   …)      ← one per completed test
Angular ← ipcRenderer.on('perfTest:done',     …)      ← final report
Angular ← ipcRenderer.on('perfTest:error',    …)      ← on failure
```

`perfTest:run` returns immediately. The runner uses `setImmediate` between phases so the
Electron event loop can flush IPC messages and keep the renderer responsive.

### Sandbox DB lifecycle

1. Create temp file: `os.tmpdir()/jsms-perf-{timestamp}.db`
2. Apply same PRAGMAs as production (WAL, foreign\_keys ON, 64 MB cache, mmap)
3. Apply all schema migrations (same SQL files — same schema as production)
4. Seed minimal reference data (purities, categories, shopsettings)
5. Drop requested indexes (if index-management mode is active)
6. Seed test dataset (customers, products, invoices + line items)
7. Run benchmark suite
8. Close DB and delete temp file — **always**, even on error

---

## Dataset Presets

| Preset | Customers | Products | Invoices | Line items | Est. time (SSD / HDD) |
|--------|-----------|----------|----------|------------|------------------------|
| Small  | 200       | 500      | 200      | ~600       | ~2s / ~30s             |
| Medium | 1 000     | 3 000    | 1 000    | ~3 000     | ~8s / ~2 min           |
| Large  | 3 000     | 10 000   | 3 000    | ~9 000     | ~25s / ~6 min          |

---

## Benchmark Suite (9 tests)

| ID  | Category | What it tests | Why it matters |
|-----|----------|---------------|----------------|
| W1  | Write    | 200 individual INSERTs, **no transaction** | Shows per-write fsync cost; worst case |
| W2  | Write    | Same 200 INSERTs **in one transaction** | Headline comparison vs W1; shows transaction ROI |
| W3  | Write    | Full dataset seed throughput | Realistic bulk-import baseline |
| R1  | Read     | Inventory list scan — `WHERE deletedAt IS NULL AND isSold = 0 ORDER BY createdAt DESC` | Validates the covering index added in migration 007 |
| R2  | Read     | Paginated products — 10 pages × 20 rows | Avg per-page latency under load |
| R3  | Read     | Customer LIKE search (phone + name) | POS lookup responsiveness |
| R4a | Read     | Orders list — **naive N+1** (50 invoices × 3 child queries = 151 total) | Demonstrates the old code path |
| R4b | Read     | Orders list — **batch** (same 50 invoices, 3 IN-clause queries) | Validates our N+1 fix; compare vs R4a |
| R5  | Read     | Dashboard aggregates (COUNT, SUM, GROUP BY) | Common on app open |

**Headline comparisons:** W2 vs W1 (transaction speedup), R4b vs R4a (N+1 fix speedup).

---

## Index Management

Users can selectively drop non-unique performance indexes from the sandbox before running
tests, then compare results to see each index's contribution to query speed.

### Which indexes are exposed

Only `idx_*` indexes (non-unique, non-PK) are shown. Unique indexes are excluded because
dropping them would cause seeding failures (duplicate SKUs, phone numbers, etc.).

Fetched via `perfTest:listIndexes` — queries `sqlite_master` on the **production** DB
(the sandbox uses the same schema, so the list is identical).

### Workflow

1. User opens Performance tab → index list loads automatically
2. User unchecks one or more indexes
3. User clicks **Run Benchmark** — sandbox DB is created, unchecked indexes are dropped
   before any data is inserted, so the query planner never sees them
4. Results table shows a **Dropped indexes** note column per test
5. User re-checks all indexes, runs again — side-by-side comparison is shown in the UI
   (last two runs are retained in component state)

---

## Rating Thresholds

Ratings are computed relative to rows operated on, not absolute time.

| Rating | Write (rows/sec) | Read (rows/sec) |
|--------|-----------------|-----------------|
| Fast   | > 5 000         | > 50 000        |
| OK     | 500 – 5 000     | 5 000 – 50 000  |
| Slow   | < 500           | < 5 000         |

Special case: R4a (naive N+1) is rated against the number of **queries** fired, not rows,
to make the comparison with R4b fair.

---

## Data Shapes

### Progress event (`perfTest:progress`)
```typescript
interface PerfProgress {
  phase:   'init' | 'seed' | 'write' | 'read' | 'cleanup';
  step:    number;   // 1-indexed
  total:   number;
  message: string;
}
```

### Per-test result (`perfTest:result`)
```typescript
interface BenchmarkResult {
  id:           string;              // 'W1', 'R4b', etc.
  name:         string;
  category:     'write' | 'read';
  rowCount:     number;
  durationMs:   number;
  throughput:   number;              // rows/sec (or queries/sec for R4a)
  rating:       'fast' | 'ok' | 'slow';
  droppedIndexes: string[];          // empty when all indexes present
}
```

### Final report (`perfTest:done`)
```typescript
interface BenchmarkReport {
  completedAt:    string;
  preset:         'small' | 'medium' | 'large';
  droppedIndexes: string[];
  results:        BenchmarkResult[];
  totalDurationMs: number;
}
```

---

## File Map

### Phase 1 — Backend (current)

| File | Purpose |
|------|---------|
| `src-electron/perf/data-factory.js` | Generates realistic fake jewellery data (customers, products, invoices) |
| `src-electron/perf/benchmark-suite.js` | Individual test functions — each takes `(db, ctx)` and returns `{ rowCount, durationMs }` |
| `src-electron/perf/benchmark-runner.js` | Orchestrates sandbox lifecycle + suite execution; emits progress events |
| `src-electron/main.js` *(edit)* | `perfTest:run`, `perfTest:cancel`, `perfTest:listIndexes` IPC handlers |
| `src-electron/preload.js` *(edit)* | `perfTest` namespace on `window.electronAPI` |

### Phase 2 — Frontend

| File | Purpose |
|------|---------|
| `client/app/modules/settings/components/perf-tester/perf-tester.component.ts` | Main UI component — preset picker, index checklist, progress bar, results table |
| `client/app/modules/settings/components/perf-tester/perf-tester.component.html` | Template |
| `client/app/modules/settings/services/perf-tester.service.ts` | IPC bridge; holds signal state for progress + results |
| `settings-page.component.ts` *(edit)* | Add `'perf'` to `TabId` union + `tabs[]` array |
| `settings-page.component.html` *(edit)* | Add `@if (activeTab() === 'perf')` panel |

---

## Non-Goals

- No persistent result history (ephemeral — one run shown at a time; last two for comparison)
- No export / share
- No "drop index on production DB" — sandbox only
- No real data sampling from the production DB
- No worker\_threads (async + setImmediate chain keeps UI responsive without threading complexity)
