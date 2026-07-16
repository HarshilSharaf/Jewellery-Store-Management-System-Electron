# Data flow

Every read and write flows through the same four hops: Angular component ->
Backend service (renderer) -> preload/IPC -> main-process pool -> MySQL stored
procedure. The reverse path merges multi-resultset output into a single flat
array.

## Read path

```mermaid
flowchart LR
  C[Angular component] --> S[Backend service<br/>Backend/**/*.service.ts]
  S --> DB[DatabaseService.execute]
  DB --> API[window.electronAPI.db.execute]
  API -.contextBridge.-> PL[preload.js]
  PL -.ipcRenderer.invoke.-> M[main.js<br/>ipcMain.handle 'db:execute']
  M --> P[mysql2 pool]
  P --> MYSQL[(MySQL)]
  MYSQL --> P
  P --> M
  M -.serialize rows.-> PL
  PL -.-> API
  API --> DB
  DB --> S
  S --> C
```

## The stored-procedure convention

Almost every call is of the form:

```ts
this.dbService.execute('call <procName>(?, ?, ?);', [param1, param2, param3]);
```

MySQL stored procedures can emit **multiple result sets** in a single call, so
mysql2 returns an array-of-arrays plus a trailing `ResultSetHeader`:

```
[
  [ ...totalRecords row(s)... ],
  [ ...page-of-data row(s)... ],
  ResultSetHeader { ... }   // stripped
]
```

`DatabaseService.prepareResponseData` (in
[`Backend/Shared/database.service.ts`](../../Backend/Shared/database.service.ts))
slices off the header, then concatenates the remaining arrays into a single flat
array. Callers therefore see a single flat list even when the procedure emits
two select statements (e.g. paginated queries return `{ totalRecords }` followed
by the actual page).

**Contract callers rely on:** paginated procs typically emit `totalRecords`
first, then the page rows. The concatenated result puts `totalRecords` at index
`0` with the page rows at index `1..N`. Do not change this contract without
auditing every caller.

## Write path (customer create example)

```mermaid
sequenceDiagram
  autonumber
  participant UI as add-customer-form
  participant SVC as db-customers.service
  participant FS as file-system.service
  participant DB as DatabaseService
  participant API as window.electronAPI
  participant M as Main process
  participant SP as MySQL: add_customer
  participant FSD as Pictures/customerImages

  UI->>SVC: addCustomer(payload)
  UI->>FS: saveCustomerImage(file, name)
  FS->>API: fs.writeImage(path, dataUri)
  API->>M: ipc db image write
  M->>FSD: fs.writeFileSync
  SVC->>DB: execute('call add_customer(?...);', values)
  DB->>API: db.execute(sql, values)
  API->>M: ipc db execute
  M->>SP: pool.execute
  SP-->>M: [rows, header]
  M-->>API: rows
  API-->>DB: rows
  DB-->>SVC: flattened rows
  SVC-->>UI: resolved
```

## Failure modes

- **Pool unreachable.** `db:initialize` rejects; renderer shows a SweetAlert and
  routes to `/settings` so the user can update credentials. See
  [`runbooks/change-db-connection.md`](../runbooks/change-db-connection.md).
- **Procedure raises `SQLEXCEPTION`.** Some procedures (e.g. `record_payment`,
  `save_order`) declare `EXIT HANDLER FOR SQLEXCEPTION` that `ROLLBACK`s and
  either `RESIGNAL`s or selects an error message. The renderer surfaces both
  cases as a rejected promise; the calling component displays a SweetAlert.
- **Image save fails.** `FileSystemService.compressAndSaveImage` rejects; the
  caller wraps the DB call in a try/catch and shows a toast. The DB insert /
  update may already have run; treat image write failures as orphaned files.
- **Renderer crash.** The main process keeps running (the window can be
  re-created on `activate`). No data is at risk because the pool sits in the
  main process.

## Why not HTTP?

The renderer imports `HttpClient` and there is a `JwtInterceptor` under
`client/app/helpers/Http-Interceptor/`, but no server accepts these requests.
This is dead code inherited from an earlier design. It is a Phase 6 removal
candidate; the docs describe the intended state (no HTTP layer), not the code
still on disk.
