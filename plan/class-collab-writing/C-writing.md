# Phần C — Phiên viết bài trực tuyến + bộ thẻ tạm (gói WP4, mốc M3)

Đọc `README.md` trước. Phụ thuộc WP1 (A1: route `sync` dùng policy `write-fast`, không tính limit ghi chung) và WP3 (`shareToClass`; nếu chưa có, stub `publishToClass` qua `class_sets` rồi đổi). Tham chiếu dòng theo `main` tại `b743899`; đọc lại file trước khi sửa. Đọc `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (dynamic import chỉ `ssr:false` trong Client Component) và `01-getting-started/15-route-handlers.md`.

## Yêu cầu
Giáo viên tạo "phiên" viết bài cho lớp; giáo viên xem live học sinh đang viết gì; học sinh xem được bài của nhau khi giáo viên bấm "mở"; sửa bài có bold, đổi màu chữ, highlight; chữ của mỗi người trên mỗi bài khác màu theo vai trò (tác giả thường, giáo viên đỏ, bạn cùng lớp hổ phách); học sinh/giáo viên lưu từ vựng từ bài vào bộ thẻ tạm (reload không mất) để sau tạo bộ thẻ, giáo viên có thể chia sẻ bộ đó vào lớp.

## Sự thật đã kiểm chứng
- Router: `src/app/api/v1/[...path]/route.ts:41-44` gọi `learningApi` rồi `communityApi`; `classRoutes` ném 404 cho `classes/*` lạ (`community-api.ts:105`) và `adminApi` trả null cho `me/*` lạ rồi rơi xuống 405 cuối `route.ts` → **chain `writingApi` ở `route.ts:43`, trước `communityApi`**.
- `requireMembership`/`requireTeaching` (`classes.ts:44,56`) chưa export → export (WP3 cũng làm; merge trùng vô hại).
- `createSetInTransaction(tx, ownerId, input)` `sets.ts:80`; `cardInputSchema` bắt buộc `definition` không rỗng (`src/features/sets/schemas.ts:30-34`).
- Drizzle 0.45 không có `bytea` sẵn → `customType` (`node_modules/drizzle-orm/pg-core/columns/custom.d.ts`).
- Mẫu dynamic import: `src/app/(study)/study/[id]/games/[game]/page.tsx`. Layout `(study)` bọc `StudyShell` + `requirePageSession`; `src/proxy.ts` đã gate `/study/:path*` và `/classes/:path*`.
- Cron: `src/app/api/cron/cleanup/route.ts:28-33`.
- Integration test gọi service/router trực tiếp (`tests/integration/community-api.test.ts:33-43` helper `call()`, mock `@/server/rate-limit`).
- `quill`, `yjs`, `y-quill` chưa cài.

## C1. Dependencies & cấu hình
**Trạng thái:** done — y-quill 1.0.0 khai báo peer quill ^2.0.0 (dùng được, không cần binding tự viết; peer quill-cursors không cài vì không dùng awareness); Quill.import("parchment") có ClassAttributor/Scope.INLINE (parchment 3); yjs vào serverExternalPackages
- `pnpm add quill yjs y-quill` (Quill 2 kéo theo `parchment`, `quill-delta`). **Xác minh** `y-quill` hỗ trợ Quill 2; nếu không, viết binding ~80 dòng trên `Y.Text.toDelta()`/`applyDelta` và `quill.updateContents(delta, "api")` với guard origin.
- `next.config.ts`: `serverExternalPackages: ["yjs"]` (tránh 2 bản Yjs ESM/CJS trong server bundle). Xác minh `Quill.import("parchment")` trả `ClassAttributor`/`Scope`, và `formats` whitelist trong constructor nhận attributor tuỳ biến.

## C2. Schema (migration M3) — thêm cuối `src/server/db/schema.ts`
**Trạng thái:** done — migration 0019 (WP4, đánh số lại sau khi rebase lên WP1+WP3); hằng số ở src/features/writing/lib/limits.ts
```ts
import { customType } from "drizzle-orm/pg-core";
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({ dataType: () => "bytea", toDriver: (v) => Buffer.from(v), fromDriver: (v) => new Uint8Array(v) });
export const writingSessionStatus = pgEnum("writing_session_status", ["draft", "open", "closed"]);
export const writingPeerVisibility = pgEnum("writing_peer_visibility", ["hidden", "open"]);
export const writingSessions = pgTable("writing_sessions", {
  id: uuid("id").primaryKey(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  title: varchar("title", { length: 120 }).notNull(),
  prompt: text("prompt").notNull().default(""),            // ≤ 5000 qua zod
  status: writingSessionStatus("status").notNull().default("draft"),
  peerVisibility: writingPeerVisibility("peer_visibility").notNull().default("hidden"),
  peerEditing: boolean("peer_editing").notNull().default(false),
  openedAt: time("opened_at"), closedAt: time("closed_at"), ...timestamps,
}, (t) => [index("writing_sessions_class_idx").on(t.classId, t.createdAt), index("writing_sessions_closed_idx").on(t.status, t.closedAt)]);
export const writingDocs = pgTable("writing_docs", {
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => writingSessions.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  state: bytea("state"),                                     // null tới sync đầu; Y.encodeStateAsUpdate
  version: integer("version").notNull().default(0),
  textPreview: varchar("text_preview", { length: 300 }).notNull().default(""),
  charCount: integer("char_count").notNull().default(0),
  lastEditorId: text("last_editor_id").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [uniqueIndex("writing_docs_author_idx").on(t.sessionId, t.authorId), index("writing_docs_session_updated_idx").on(t.sessionId, t.updatedAt)]);
export const scratchCards = pgTable("scratch_cards", {
  id: uuid("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  term: varchar("term", { length: 1000 }).notNull(),
  definition: varchar("definition", { length: 1000 }).notNull().default(""),
  phonetic: varchar("phonetic", { length: 200 }), example: varchar("example", { length: 1000 }),
  sourceDocId: uuid("source_doc_id").references(() => writingDocs.id, { onDelete: "set null" }),
  ...timestamps,
}, (t) => [index("scratch_cards_user_idx").on(t.userId, t.createdAt)]);
```
Hằng: `MAX_STATE_BYTES = 512*1024`, `MAX_UPDATE_BYTES = 64*1024` (trần body `keepalive`), `MAX_SCRATCH = 300`, `MAX_SESSIONS_PER_CLASS = 100`, `PREVIEW_CHARS = 300`.

## C3. Quy tắc quyền
**Trạng thái:** todo
Thuần, dùng chung client/server — `src/features/writing/lib/permissions.ts` (unit test ma trận):
```ts
export interface SessionGate { status: "draft"|"open"|"closed"; peerVisibility: "hidden"|"open"; peerEditing: boolean }
export const teaches = (role: ClassRole) => role !== "student";
export function canReadDoc(role, userId, authorId, s): boolean   // teacher → true; author → status !== "draft"; peer → status !== "draft" && peerVisibility === "open"
export function canWriteDoc(role, userId, authorId, s): boolean  // status === "open" && (teacher || author || (peerVisibility === "open" && peerEditing))
export function canListDocs(role, s): boolean                     // teacher || peerVisibility === "open"
```
Server — `src/server/services/writing-access.ts`:
```ts
export async function requireSessionAccess(db, userId, sessionId): Promise<{ session; role: ClassRole }>   // 404 non-member/không có; học sinh 404 với draft
export async function requireDocAccess(db, userId, docId, mode: "read"|"write"): Promise<{ doc; session; role }> // read từ chối → 404; write từ chối → 403 SESSION_CLOSED khi closed, else FORBIDDEN
export const requireSessionTeacher = (db, userId, sessionId) => …  // 403 nếu !teaches(role)
```

## C4. Service
**Trạng thái:** todo
`src/server/services/writing.ts`: `listSessions(db,userId,classId)` (học sinh không thấy draft; `myDocId` left join; `docCount`), `createSession(db,userId,classId,input)` (teacher; 100/lớp → 409), `getSession(db,userId,sessionId)` → session + `members` toàn lớp (để map màu, kể cả học sinh) + `docs` khi `canListDocs`, `updateSession` (title/prompt/status/peerVisibility/peerEditing; đặt `openedAt`/`closedAt`), `deleteSession`, `sessionOverview(db,userId,sessionId,query)` (`since` ISO → chỉ docs `updatedAt > since`; `[]` nếu không `canListDocs`; trả `serverTime`), `purgeClosedSessions(db, now)` (closed & `closedAt < now-180d`; gọi trong cron).
`src/server/services/writing-docs.ts`: `openOwnDoc(db,userId,sessionId)` (học sinh cần status open; `insert … onConflictDoNothing` rồi select), `getDocState(db,userId,docId)` → `{ id, authorId, version, state: base64|null, readOnly }`, `syncDoc(db,userId,docId,input)` (C6).
`src/server/services/scratch-cards.ts`: `listScratch`, `createScratch` (≥300 → 409 `SCRATCH_LIMIT`; giữ `sourceDocId` nếu đọc được doc), `updateScratch`, `deleteScratch`, `clearScratch`, `materializeScratch(db,userId,{ ids (2..500), title, termLang, definitionLang, classId?, audience? })` → tx: thiếu id → 404; `definition` rỗng → 400 `SCRATCH_INCOMPLETE`; `createSetInTransaction(tx, userId, { title, description:"", termLang, definitionLang, source:"manual", cards })`; xoá hàng; `classId` → `publishToClass(tx, userId, classId, setId, audience)` = `shareToClass` (WP3) hoặc stub `class_sets`.
`src/server/lib/ydoc.ts` (không `server-only`, unit test node): `TEXT_NAME = "quill"`, `docFromState(state|null): Y.Doc`, `applyClientUpdate(doc, update)` (lỗi → `ApiError(400)`), `encodeState(doc)` (= compaction), `diffSince(doc, sv): Uint8Array|null` (null khi update rỗng), `plainText(doc)`, `preview(text, 300)` (grapheme-safe qua `src/lib/graphemes.ts`), `toBase64/fromBase64`.

## C5. Routes — `src/server/writing-api.ts` (`writingApi(db,userId,request,path)` trả `null` khi không khớp), chain ở `route.ts:43`
**Trạng thái:** todo

| Method | Path | Service | Limit |
|---|---|---|---|
| GET / POST | `/classes/:id/writing` | `listSessions` / `createSession` | ghi chung |
| GET / PATCH / DELETE | `/writing/sessions/:id` | `getSession` / `updateSession` / `deleteSession` | ghi chung |
| GET | `/writing/sessions/:id/overview?since=` | `sessionOverview` | `overview:<user>` 30/phút |
| POST | `/writing/sessions/:id/docs` | `openOwnDoc` | ghi chung |
| GET | `/writing/docs/:id` | `getDocState` | — |
| POST | `/writing/docs/:id/sync` | `syncDoc` | `sync:<user>` 60/phút; `readJson(request, 96*1024)`; policy A1 `write-fast` |
| GET / POST / DELETE | `/me/scratch-cards` | list / create / clear | create `scratch:<user>` 120/phút |
| PATCH / DELETE | `/me/scratch-cards/:id` | update / delete | ghi chung |
| POST | `/me/scratch-cards/materialize` | `materializeScratch` | ghi chung |

Mã lỗi: `DOC_TOO_LARGE`, `SESSION_CLOSED`, `SCRATCH_LIMIT`, `SCRATCH_INCOMPLETE`.

## C6. Giao thức sync (hợp đồng giữa WP4a và WP4b)
**Trạng thái:** todo
Request `POST /api/v1/writing/docs/:id/sync` body `{ sv: base64(Y.encodeStateVector(local)), update?: base64(pending đã gộp), version?: number }`.
Server `syncDoc`:
1. `requireDocAccess(db, userId, docId, update ? "write" : "read")`.
2. **Fast path**: không `update` và `version === row.version` → `{ version, readOnly, session }` (1 select, không Yjs).
3. Có `update`: tx `select state, version … for update` → `docFromState` → `bytes > MAX_UPDATE_BYTES` → 413 `DOC_TOO_LARGE` → `applyClientUpdate` (hỏng → 400) → `encodeState` → `> MAX_STATE_BYTES` → 413, không ghi → update `state, version = version+1, textPreview, charCount, lastEditorId, updatedAt`.
4. `diffSince(doc, fromBase64(sv))` → `{ version, update?: base64, readOnly: !canWriteDoc(...), session: { status, peerVisibility, peerEditing } }`.
Không có 409: merge Yjs giao hoán, idempotent; `version` chỉ phục vụ fast path và roster.

Client `src/features/writing/lib/sync-loop.ts`:
```ts
interface SyncState { pending: Uint8Array|null; inFlight: Uint8Array|null; version: number; lastActivityAt: number; failures: number; readOnly: boolean; hidden: boolean }
type SyncEvent = {type:"local"; update; at} | {type:"sent"; at} | {type:"ok"; version; hadRemote; readOnly; at} | {type:"fail"; code: RepositoryErrorCode; at} | {type:"visibility"; hidden}
export function reduce(state, event): SyncState
export function nextDelayMs(state, now): number|null  // FAST 2000 nếu now-lastActivityAt < 30_000, else SLOW 10_000; lỗi: min(SLOW·2^failures, 60_000); hidden & không pending → null (dừng)
export function createSyncLoop(opts: { doc: Y.Doc; docId; userId; fetcher; storage: AppStorage; onState }): { start(); stop(); flushNow() }
```
- `doc.on("update", (u, origin) => origin !== "remote" && dispatch({type:"local", update:u}))`; pending = `Y.mergeUpdates([pending, u])`. Tick: gửi `pending` làm `inFlight`; `ok` → bỏ `inFlight`, ghi mirror = pending còn lại; `fail` → `pending = merge(inFlight, pending)`. Remote: `Y.applyUpdate(doc, bytes, "remote")`; nhận remote cũng tính là hoạt động.
- Lỗi: `UNAUTHENTICATED` → đường đăng xuất chung (QueryCache onError); `FORBIDDEN`/`SESSION_CLOSED` → `readOnly`, bỏ pending, toast, `quill.enable(false)`; `NOT_FOUND` → về danh sách; `DOC_TOO_LARGE` → toast, bỏ pending, tải lại `GET /writing/docs/:id` và dựng lại doc; `RATE_LIMITED`/`NETWORK`/`UNKNOWN` → backoff, giữ pending.
- `visibilitychange` (hidden) / `pagehide`: nếu pending ≤ 64KB → `fetch(url, { method:"POST", keepalive:true, credentials:"same-origin", headers:{"Content-Type":"application/json"}, body })` (mẫu `api-generator.ts:89-98`).
- Mirror localStorage qua `src/lib/storage.ts` `writeValue("writing-pending:<docId>", { userId, update: base64, savedAt })` debounce 250ms, zod khi đọc, bỏ sau 7 ngày; mount: nếu `userId` khớp → `Y.applyUpdate(local, bytes, "replay")` (thành pending, gửi ở tick đầu).
- Thứ tự nạp: `GET /writing/docs/:id` → `docFromState` → replay mirror → bind Quill → start loop (tick đầu thường là fast path).
- Client soft cap: đếm ký tự, cảnh báo ở 20.000; server cap theo byte.

## C7. Quill
**Trạng thái:** todo
- `Editor.tsx` nạp bằng `dynamic(() => import("./Editor"), { ssr:false, loading })` trong `WritingWorkspace.tsx` ("use client"). Chỉ `Editor.tsx`, `quill-author.ts`, `lib/yjs-codec.ts`, `lib/sync-loop.ts` import `quill`/`yjs`; hooks/schemas chỉ `import type`.
- `import "quill/dist/quill.core.css"` (không theme Snow); toolbar tự làm bằng UI kit (`Button size="icon"`, lucide Bold/Italic/Underline/Highlighter/Palette/Eraser/BookmarkPlus) gọi `quill.format(name, value, "user")`, đọc `quill.getFormat()` trên `selection-change`; màu/highlight = palette 8 màu token + "mặc định" bằng `Menu`.
- `new Quill(el, { theme: undefined, modules: { toolbar:false, history:{ userOnly:true } }, formats:["bold","italic","underline","color","background","author","list"], placeholder })`.
- `quill-author.ts`: `const Parchment = Quill.import("parchment"); export const AuthorAttributor = new Parchment.ClassAttributor("author","ql-author",{ scope: Parchment.Scope.INLINE }); Quill.register(AuthorAttributor, true)` (1 lần trước `new Quill`). Sanitize id `/^[A-Za-z0-9_-]+$/`.
- Tự gán tác giả: `quill.on("text-change", (delta,_old,source) => { if (source !== "user") return; … })` duyệt `delta.ops` theo index; mọi `insert` chuỗi có `attributes?.author !== userId` → `quill.formatText(index, len, "author", userId, "api")` (y-quill đẩy vào Y.Text). IME: chạy sau composition end nên Telex/pinyin được gán 1 lần. Paste tương tự. Xoá/định dạng chữ người khác không đổi tác giả.
- `new QuillBinding(doc.getText("quill"), quill)`; awareness/cursor ngoài phạm vi (có thể gắn `{cursor}` vào request sync sau, 0 request thêm).
- Read-only: `quill.enable(false)` khi `readOnly` từ sync hoặc permissions; toolbar disabled.
- Lưu từ: `quill.getSelection()` → `quill.getText(index, length).trim()` → `SaveWordPopover`.
- Màu theo vai trò `lib/author-colors.ts`: `toneFor(userId, authorId, members): "author"|"teacher"|"peer"|"unknown"`, `authorStyles(members)` → chuỗi CSS `.ql-author-<id>{color:var(--danger)}` (teacher) / `var(--accent-text)` (peer) / không (author, kế thừa `--text`) / `--text-muted` (đã rời); `Editor.tsx` render `<style>`. Quill `color` là StyleAttributor inline nên màu toolbar thắng class. Token tự đổi theo dark mode. Chú giải màu ở `SessionPanel`.

## C8. Ngân sách poll (30 HS × 45 phút)
**Trạng thái:** todo
Xấu nhất (gõ liên tục, FAST 2s): 30 × 1.350 = 40.500 + GV (overview + sync) 2.700 ≈ **43k** < 50k. Thực tế (active 50%, còn lại SLOW 10s, tab ẩn dừng) ≈ **26k**. Poll rảnh = 1 select có index (fast path, ~5–20ms Neon). Hằng `FAST_MS`, `SLOW_MS`, `ACTIVITY_WINDOW_MS` trong `sync-loop.ts`.

## C9. Hooks & keys — `src/features/writing/hooks.ts`
**Trạng thái:** todo
```ts
export const writingKeys = { sessions: (classId) => ["writing","class",classId], session: (id) => ["writing","session",id], overview: (id) => ["writing","session",id,"overview"], doc: (docId) => ["writing","doc",docId], scratch: ["scratch-cards"] };
```
`useWritingSessions(classId)`, `useWritingSession(id)`, `useSessionAction()` (PATCH/DELETE/POST; invalidate `["writing"]`), `useOverview(id, {enabled, fast})` (`refetchInterval: fast ? 2000 : 10000`, `refetchIntervalInBackground:false`, `staleTime:0`, gửi `since` từ data trước, merge Map theo doc id), `useOpenOwnDoc(sessionId)`, `useScratchCards()`, `useCreateScratch/useUpdateScratch/useDeleteScratch` (optimistic + rollback), `useMaterializeScratch()` (invalidate scratch, `setKeys.all`, `["classes"]`). Sync không phải react-query: `useSyncLoop(doc, docId, userId)` → `{ status: "idle"|"saving"|"offline"|"readonly", lastSavedAt }`.
Schemas `src/features/writing/schemas.ts`: `sessionInputSchema`, `sessionPatchSchema`, `docSummarySchema`, `sessionSummarySchema`, `sessionDetailSchema`, `overviewSchema`, `syncRequestSchema`/`syncResponseSchema` (base64 regex), `scratchCardSchema`, `scratchInputSchema`, `materializeSchema`.

## C10. UI
**Trạng thái:** todo
- `src/app/(app)/classes/[id]/writing/page.tsx` → `SessionList` (GV: form title + prompt `Textarea`, danh sách + Badge trạng thái, link `/study/writing/[id]`; HS: phiên open/closed). Nút "Viết bài" ở header `ClassView.tsx` (cạnh `ExitClass`, L296-300).
- `src/app/(study)/study/writing/[sessionId]/page.tsx` dưới `StudyShell` → `WritingTopBar` (về danh sách, tiêu đề + Badge, chỉ báo sync, nút "Bộ thẻ tạm (n)" mở `ScratchDrawer`) + `WritingWorkspace` `grid lg:grid-cols-[1fr_22rem]`: cột editor `min-h-0 flex-1`, panel thu gọn được; mobile panel/drawer là `Dialog` với prop mới `side?: "right"|"bottom"` thêm vào `Dialog.tsx`.
- `TeacherRoster`: lưới thẻ (Avatar, tên, preview, `charCount`, "x giây trước" từ `serverTime` với ticker 1s `useClientValue`), click → mở doc trong editor; nút Mở/Đóng phiên (`ConfirmDialog` khi đóng), `Switch` "Cho phép xem bài nhau", `Switch` "Cho phép viết lên bài nhau" (disabled khi chưa cho xem).
- `SessionPanel` (HS): đề bài `whitespace-pre-wrap`, trạng thái, chú giải màu, danh sách bài bạn khi `peerVisibility === "open"` (refresh 15s khi đang hiện).
- `SaveWordPopover`: term điền sẵn, definition, phonetic tuỳ chọn → `useCreateScratch` với `sourceDocId`; mobile dùng `Dialog size="sm"`.
- `ScratchDrawer`: list, sửa inline (term/definition/phonetic), xoá, chọn tất cả, "Tạo bộ thẻ" → `MaterializeDialog` (title, `Select` termLang/definitionLang từ `CONTENT_LANGUAGES`, `Checkbox` "Chia sẻ vào lớp" + chọn lớp từ `useClasses()` và audience). Hàng thiếu định nghĩa đánh dấu và chặn submit.
- `ScratchLibraryCard` "Bộ thẻ tạm (n)" ở `LibraryView.tsx` header (sau `NewFolderButton`, L75).
- Cron: `purgeClosedSessions` trong `src/app/api/cron/cleanup/route.ts:28-33`.

## C11. i18n
**Trạng thái:** todo
Namespace `writing.{sessions,status,editor,panel,roster,scratch,materialize,sync}.*`; `errors.{DOC_TOO_LARGE,SESSION_CLOSED,SCRATCH_LIMIT,SCRATCH_INCOMPLETE}`; `classes.writing`. Vi là chuẩn; e2e dùng nhãn vi.

## C12. Test
**Trạng thái:** todo
- Unit: `ydoc.test.ts` (`// @vitest-environment node`: state rỗng → doc; apply + re-encode nhỏ lại sau xoá; `diffSince` null khi sv phủ; `plainText`/`preview` với grapheme tiếng Việt và cắt 300; update hỏng ném), `permissions.test.ts` (ma trận role × status × visibility × editing cho read/write/list), `author-colors.test.ts`, `sync-loop.test.ts` (reducer: local→pending merge, fail re-merge inFlight, ok xoá, lịch backoff, hidden pause, FAST/SLOW ở 30s, replay mirror với `AppStorage` giả, flush ≤ 64KB), `schemas.test.ts` (base64 regex, materialize bounds).
- Integration `tests/integration/writing.test.ts`, `scratch-cards.test.ts`, `writing-api.test.ts`: ma trận quyền (teacher/author/peer/non-member × draft/open/closed × hidden/open × peerEditing; 404 vs 403 vs `SESSION_CLOSED`); sync: 2 client Y.Doc độc lập chèn cùng vị trí → cả hai merge, version 1→2, hội tụ sau poll 2 với sv riêng; fast path không chạm Yjs; `textPreview`/`charCount` cập nhật; 413 với > 512KB state và > 64KB update; update hỏng 400; scratch 300 → 409; materialize tạo bộ + xoá hàng + `SCRATCH_INCOMPLETE` + `classId` chia sẻ (thấy ở thư viện lớp / `getClass().sets` nếu stub), non-teacher classId → theo quyền `shareToClass`; `purgeClosedSessions` chỉ xoá closed > 180 ngày.
- E2E `tests/e2e/writing.spec.ts` (`person()` 3 context): GV tạo lớp + phiên, mở → A, B join bằng mã, mở `/study/writing/:id`, gõ (`keyboard.type("vieetj")` → "việt") → roster GV thấy preview ≤ 5s → GV bật "Cho phép xem bài nhau" + "Cho phép viết lên bài nhau" → B mở bài A, gõ; A thấy chữ B có class `ql-author-<B>` và màu tính toán ≠ chữ A → A chọn từ, "Lưu từ vựng", điền nghĩa → reload giữ count → "Tạo bộ thẻ" 2 thẻ → thấy ở Thư viện. Thêm: `context.setOffline(true)`, gõ, reload → vẫn còn (mirror).
- Build: `next build` xác nhận `quill`/`yjs` chỉ trong chunk route `/study/writing/[sessionId]`; first-load JS các trang khác không tăng.

## C13. Rủi ro & giảm thiểu
**Trạng thái:** todo
- Yjs cold start / 2 bản: `serverExternalPackages`; decode tuyến tính theo state ≤ 512KB.
- Bundle: Quill 2 (~110KB gz) + yjs (~25KB gz) + y-quill sau dynamic import trên 1 route.
- IME: gán tác giả sau `text-change`, không trong composition; e2e Telex.
- Neon lock: chỉ quanh apply+save; poll rảnh không lock; `prepare:false` + 1 kết nối đã chứng minh ở `joinClass` (`classes.ts:187`).
- Invocation Hobby: cadence ≥ 2s, rate limit sync 60/phút, dừng khi ẩn, overview dùng `since`.
- Limit ghi chung 60/phút: sync phải nằm ngoài (A1); nếu WP1 chưa merge, tạm bỏ qua `write:` cho `path[0]==="writing" && path[2]==="sync"` trong `api.ts` với TODO.
- Keepalive không có response: mirror được xoá ở sync thành công kế tiếp (idempotent).
- Gõ trong run đỏ của giáo viên kế thừa `author` tới khi handler format lại trong cùng tick — unit test với delta giả.
- `y-quill` vs Quill 2: fallback binding tự viết.
