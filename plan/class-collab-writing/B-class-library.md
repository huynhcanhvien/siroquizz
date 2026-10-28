# Phần B — Thư viện lớp + cộng tác bộ thẻ (gói WP3, mốc M1)

Đọc `README.md` trước. Phụ thuộc WP1 (A3 `cardCount`, A4 `lock` mới, A6 `replaceDeck`/`writeSetFields`/`toCardDto`). Tham chiếu dòng theo `main` tại `b743899`; đọc lại file trước khi sửa.

## Yêu cầu
Học sinh trong lớp chia sẻ bộ thẻ hoặc thư mục của mình vào lớp để giáo viên (luôn) và tuỳ chọn bạn cùng lớp xem. Giáo viên và bạn cùng lớp "đóng góp" bằng cách sửa rồi chờ chủ bộ duyệt; hoặc chủ bộ cấp quyền thêm/sửa/xoá trực tiếp cho giáo viên (mọi giáo viên hiện tại và tương lai của lớp) hoặc người cụ thể. Chủ bộ có công tắc "Nhận đóng góp".

## Sự thật đã kiểm chứng ảnh hưởng thiết kế
- `sets.ts:156` `updateSet` kết thúc `.where(owned(ownerId, id))` → phải thành `eq(studySets.id, id)` khi editor lưu (quyền đã kiểm ở đầu).
- `community-api.ts:69-106` `classRoutes` và `:109-139` `folderRoutes` ném 404 cho mọi path con lạ → route mới phải được dispatch **trước** (gọi `collabApi` ở đầu `communityApi`, L145). `route.ts:116` chặn `sets/*` dài hơn 3 đoạn nhưng `communityApi` chạy trước (L44) nên `collab-api.ts` sở hữu được `sets/:id/collaborators/:type/:id`.
- `tests/e2e/classes.spec.ts:78-79` khẳng định học sinh trên bộ được giao **không** thấy link "Chỉnh sửa" và nút /Chia sẻ/ → nút cho viewer đặt tên "Đề xuất chỉnh sửa", "Sao chép vào thư viện".
- Tránh vòng import: `change-requests.ts` → `sets.ts` một chiều; `sets.ts`/`folders.ts` không import `class-library.ts` (xoá hàng thư viện lớp bằng truy vấn trực tiếp trên bảng).
- `vitest.config.mts` tính coverage cho `src/features/**/lib/**` và `**/schemas.ts` → `card-diff.ts` và `collab/schemas.ts` cần unit test.
- `SetOverview.test.tsx` mock `useSession` = `{id:"viewer"}` với `ownerId:"owner"` và mong **không** có link sửa → giữ hành vi khi `set.access` vắng (local mode).

## B1. Schema (migration M1, chỉ thêm) — `src/server/db/schema.ts`, thêm sau `classSets` (L461-475)
**Trạng thái:** todo

```ts
// study_sets: thêm cột
acceptsContributions: boolean("accepts_contributions").notNull().default(true),

export const libraryItemType = pgEnum("library_item_type", ["set", "folder"]);
export const libraryAudience = pgEnum("library_audience", ["teachers", "class"]);
/** Bộ thẻ/thư mục thành viên chia sẻ vào lớp; item_id đa hình (service kiểm tra). */
export const classLibraryItems = pgTable("class_library_items", {
  id: uuid("id").primaryKey(),
  classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
  itemType: libraryItemType("item_type").notNull(),
  itemId: uuid("item_id").notNull(),
  sharedBy: text("shared_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  audience: libraryAudience("audience").notNull().default("class"),
  sharedAt: time("shared_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("class_library_once_idx").on(t.classId, t.itemType, t.itemId), index("class_library_item_idx").on(t.itemId)]);

export const collabPrincipal = pgEnum("collab_principal", ["user", "class_teachers"]);
/** Quyền sửa vĩnh viễn do chủ bộ cấp: một người, hoặc mọi giáo viên hiện tại/tương lai của một lớp. */
export const setCollaborators = pgTable("set_collaborators", {
  setId: uuid("set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  principalType: collabPrincipal("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  grantedBy: text("granted_by").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.setId, t.principalType, t.principalId] }), index("set_collab_principal_idx").on(t.principalType, t.principalId)]);

export const changeRequestStatus = pgEnum("change_request_status", ["pending", "approved", "rejected", "withdrawn"]);
export const setChangeRequests = pgTable("set_change_requests", {
  id: uuid("id").primaryKey(),
  setId: uuid("set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: changeRequestStatus("status").notNull().default("pending"),
  ops: jsonb("ops").notNull(),
  baseUpdatedAt: time("base_updated_at").notNull(),
  note: varchar("note", { length: 500 }).notNull().default(""),
  reviewNote: varchar("review_note", { length: 500 }).notNull().default(""),
  reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: time("reviewed_at"),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [index("change_requests_set_status_idx").on(t.setId, t.status, t.createdAt), index("change_requests_author_idx").on(t.authorId, t.createdAt)]);
```
Hằng số: `MAX_LIBRARY_ITEMS_PER_CLASS = 500`, `MAX_COLLABORATORS_PER_SET = 50`, `MAX_PENDING_REQUESTS_PER_SET = 20`, `MAX_OPS_PER_REQUEST = 200`.

## B2. Phân quyền — `src/server/services/access.ts` (TDD với `tests/integration/access.test.ts`)
**Trạng thái:** todo

Thêm sau `ownerInGoodStanding` (L78-79):
```ts
/** Chia sẻ vào lớp viewer đang học: chính bộ, hoặc thư mục chứa bộ. audience teachers cần vai trò dạy. */
export const sharedToClassOf = (userId: string) => sql`exists(select 1 from class_library_items li
  inner join class_members cm on cm.class_id = li.class_id and cm.user_id = ${userId}
  where (li.audience = 'class' or cm.role in ('owner','teacher'))
    and ((li.item_type = 'set' and li.item_id = ${studySets.id})
      or (li.item_type = 'folder' and exists(select 1 from folder_sets fs where fs.folder_id = li.item_id and fs.set_id = ${studySets.id}))))`;
/** Quyền sửa được cấp: đích danh, hoặc giáo viên của lớp được cấp. */
export const collaboratorOn = (userId: string) => sql`exists(select 1 from set_collaborators sc where sc.set_id = ${studySets.id} and (
  (sc.principal_type = 'user' and sc.principal_id = ${userId})
  or (sc.principal_type = 'class_teachers' and exists(select 1 from class_members cm where cm.class_id::text = sc.principal_id and cm.user_id = ${userId} and cm.role in ('owner','teacher')))))`;
```
- `requireStudySet` (L85-104): nhánh lớp → `and(isNull(studySets.hiddenAt), or(assignedTo(userId), sharedToClassOf(userId)), ownerInGoodStanding())`; tham số `lock` theo A4.
- Mới: `requireEditableSet(db, userId, setId, lock?)` = `requireStudySet` rồi `set.ownerId === userId || await isCollaborator(db, userId, setId)` nếu không → `ApiError(403, "FORBIDDEN")`. `isCollaborator(db, userId, setId): Promise<boolean>`. `sharedInContext(db, userId, setId): Promise<{classId, className, sharedByName, audience} | null>` (lớp đầu tiên theo `sharedAt`).
- `learning.ts:186-190` (`dueCards`): `or(assignedTo(userId), sharedToClassOf(userId))` để ôn tập theo thư mục chia sẻ chạy được.
- Ảnh: `card-images.ts:26,54` `requireOwnedSet` → `requireEditableSet`; `src/app/api/v1/images/[id]/route.ts:31` thêm nhánh: nếu `canViewSet` sai và viewer đăng nhập thì thử `requireStudySet` (sửa luôn lỗi ảnh bộ private được giao cho lớp).

## B3. `src/server/services/sets.ts`
**Trạng thái:** todo
- `setInputSchema` (`src/features/sets/schemas.ts:41-55`) thêm `baseUpdatedAt: z.iso.datetime().optional()`; `SetInput` (`src/lib/types.ts`) thêm `baseUpdatedAt?: string`; local repository bỏ qua.
- `updateSet(db, userId, id, input)`: `requireEditableSet(tx, userId, id, "update")`; nếu có `baseUpdatedAt` và `current.updatedAt > baseUpdatedAt` → `ApiError(409, "SET_CHANGED")`; `replaceDeck` + `writeSetFields` (từ A6); `markEdited` sau tx; `.where(owned(...))` → `eq(studySets.id, id)`.
- `applyCardOps(tx: Transaction, set: SetRow, ops: ChangeOps): Promise<void>`: load thẻ theo `position` → `applyOps(existing, ops.cards, v7)` (thuần, B7) → `setInputSchema.parse({ ...metadata(set), title: ops.title ?? set.title, description: ops.description ?? set.description, cards })` (2..500 → 400 trước khi ghi) → `replaceDeck` + `writeSetFields`. Caller gọi `markEdited` sau commit.
- `getSet` trả thêm `access: { isOwner, canEdit: isOwner || isCollaborator, acceptsContributions, pendingChangeRequests? (owner: count pending), sharedIn? (viewer: sharedInContext) }`. `pendingCount` là query 4 dòng nội bộ (không import `change-requests.ts`). Giữ `getSet` < 50 dòng nhờ `toCardDto`.
- `removeSet` (L163-178): trong tx thêm `delete from class_library_items where item_type='set' and item_id=id`.
- `sharing.ts`: `setAcceptsContributions(db, ownerId, setId, { accepts: boolean })` (owner, trả `access`).
- `studySetSchema` (L79-95) thêm `access: setAccessSchema.optional()`; `StudySet.access?`.

## B4. `classes.ts` / `folders.ts`
**Trạng thái:** todo
- `classes.ts`: export `requireMembership` (L44), `requireTeaching` (L56). `leaveClass` (L205-211) và `removeMember` (L213-230) bọc tx, thêm `delete from class_library_items where class_id=? and shared_by=?`. `deleteClass` (L176-179) thêm `delete from set_collaborators where principal_type='class_teachers' and principal_id=classId`. `assignSet` (L265) giữ `requireOwnedSet`.
- `folders.ts`: export `requireFolder` (L17). Mới `requireViewableFolder(db, userId, id): Promise<{ folder; isOwner: boolean }>`: owner, hoặc `exists class_library_items li join class_members cm … where li.item_type='folder' and li.item_id=id and (audience='class' or cm.role teaching)` và chủ thư mục không bị ban/xoá; 404 nếu không. `getFolder` (L139-154) dùng nó; viewer lọc `isNull(studySets.hiddenAt)`; trả `{ id, name, isOwner, sets }`; `FolderDetail.isOwner`, `folderDetailSchema` (`src/features/folders/schemas.ts:10-23`) thêm `isOwner: z.boolean()`. `folderStudySet` (L160) giữ, `ownerId` của bộ gộp = `folder.userId`. `deleteFolder` (L76-79) xoá item thư viện lớp của thư mục (tx). Rename/add/remove/`foldersOfSet` giữ owner-only. Route `/study/folder/[folderId]/*` tự nhận thư mục chia sẻ qua `getFolder`.

## B5. Service mới
**Trạng thái:** todo

`src/server/services/class-library.ts`
```ts
const shareInput = z.object({ itemType: z.enum(["set","folder"]), itemId: z.uuid(), audience: z.enum(["teachers","class"]).default("class") });
export interface ClassLibraryItem { id; itemType; itemId; title; cardCount: number|null; setCount: number|null; audience; sharedAt; sharedBy: {id,name,avatarColor}; canRemove: boolean }
export async function shareToClass(db, userId, classId, input): Promise<{ id }>        // member + owner của item (requireOwnedSet/requireFolder); upsert audience; 409 CONFLICT khi ≥ 500
export async function unshareFromClass(db, userId, classId, libraryItemId): Promise<void>  // sharer hoặc teacher; 404 non-member; 403 khác
export async function listClassLibrary(db, userId, classId): Promise<ClassLibraryItem[]>   // học sinh chỉ `class`; lọc deleted/hidden/owner ban
export async function myClassLibrary(db, userId): Promise<(ClassLibraryItem & { classId; className })[]>  // tab "Từ lớp", limit 200, mới nhất trước
export async function listItemShares(db, userId, itemType, itemId): Promise<{ classId; className; myRole; libraryItemId: string|null; audience: ...|null }[]>  // owner; cho dialog share
```
Helper riêng: `requireOwnedItem`, `itemRows` (1 query mỗi loại item join `study_sets`/`folders` + `user`, gộp sort trong TS), `canRemove = sharedBy === userId || canManageClass(role)`.

`src/server/services/collaborators.ts`
```ts
const principalInput = z.object({ principalType: z.enum(["user","class_teachers"]), principalId: z.string().min(1).max(64) });
export async function grantCollaborator(db, ownerId, setId, input): Promise<void>  // owner; user phải chung ≥1 lớp (403 NOT_CLASSMATE), không tự cấp (400); class_teachers: owner phải là member lớp; ≥50 → 409; idempotent
export async function revokeCollaborator(db, ownerId, setId, principalType, principalId): Promise<void>
export async function collaboratorCandidates(db, ownerId, setId): Promise<{ classes: { classId; className; myRole; teachersGranted; members: { userId; name; avatarColor; role; granted }[] }[] }>  // học sinh-owner chỉ thấy giáo viên (như getClass)
```

`src/server/services/change-requests.ts`
```ts
const proposeInput = z.object({ classId: z.uuid().nullable().default(null), note: z.string().trim().max(500).default(""), baseUpdatedAt: z.iso.datetime(), ops: changeOpsSchema });
const reviewInput = z.object({ reviewNote: z.string().trim().max(500).default("") });
export async function proposeChange(db, userId, setId, input): Promise<{ id }>   // viewer ≠ owner (owner → 403); set.acceptsContributions sai → 403 CONTRIBUTIONS_CLOSED; cardId lạ → 400; 21 pending → 409 CHANGE_REQUEST_LIMIT; classId phải là lớp của author (404)
export async function listChangeRequests(db, userId, setId, query): Promise<ChangeRequestSummary[]>  // owner: tất cả; khác: của mình; ?status=pending|all
export async function getChangeRequest(db, userId, id): Promise<ChangeRequestDetail>  // owner/author; ops kèm `before` (thẻ hiện tại) cho edit/delete; stale = set.updatedAt > baseUpdatedAt
export async function reviewChangeRequest(db, userId, id, action: "approve"|"reject", input): Promise<void>  // owner; 1 tx: lock request (pending → else 409) + requireOwnedSet(lock "update"); approve → applyCardOps; ghi audit_logs action "change_request.approve|reject" meta {requestId, authorId}; markEdited sau commit khi approve
export async function withdrawChangeRequest(db, userId, id): Promise<void>  // author, pending
export async function myChangeRequests(db, userId, query): Promise<PendingReviewItem[]>  // Home: pending trên bộ tôi sở hữu (limit 20); ?role=author → của tôi
```
Shapes: `ChangeRequestSummary { id; setId; classId; status; note; reviewNote; opCount; titleChanged; author{id,name,avatarColor}; createdAt; reviewedAt; stale }`; `ChangeRequestDetail = Summary & { title?; description?; cards: ({op:"add"; card} | {op:"edit"; cardId; before: Card|null; card} | {op:"delete"; cardId; before: Card|null})[] }`; `PendingReviewItem { id; setId; setTitle; author; opCount; createdAt; className: string|null }`. Approve: edit/delete thẻ không còn → bỏ qua; add → nối cuối; < 2 hoặc > 500 thẻ → 400 và rollback.

## B6. Routes — `src/server/collab-api.ts` mới; thêm ở `community-api.ts:145` (trước `folderRoutes`): `const collab = await collabApi(db, userId, request, path); if (collab) return collab;`
**Trạng thái:** todo

| Method | Path | Ai | Service |
|---|---|---|---|
| GET / PUT | `/classes/:id/library` (PUT body `{itemType,itemId,audience}`) | member / owner của item | `listClassLibrary` / `shareToClass` |
| DELETE | `/classes/:id/library/:libraryItemId` | sharer hoặc teacher | `unshareFromClass` |
| GET | `/me/class-library` | đăng nhập | `myClassLibrary` |
| GET | `/sets/:id/shares`, `/folders/:id/shares` | owner | `listItemShares` |
| GET / PUT | `/sets/:id/collaborators` (PUT body `{principalType,principalId}`) | owner | `collaboratorCandidates` / `grantCollaborator` |
| DELETE | `/sets/:id/collaborators/:principalType/:principalId` | owner | `revokeCollaborator` |
| PATCH | `/sets/:id/contributions` `{accepts}` | owner | `setAcceptsContributions` |
| POST / GET | `/sets/:id/change-requests` (`?status=pending\|all`) | viewer ≠ owner, `enforceLimit("change-request:<user>", 30, 3600)` / owner, author | `proposeChange` / `listChangeRequests` |
| GET | `/change-requests/:id` | owner hoặc author | `getChangeRequest` |
| POST | `/change-requests/:id/approve` · `/reject` (body `{reviewNote?}`) · `/withdraw` | owner / owner / author | `reviewChangeRequest`, `withdrawChangeRequest` |
| GET | `/me/change-requests?status=pending[&role=author]` | đăng nhập | `myChangeRequests` |

Route đổi hành vi: `PUT /sets/:id` (editor + `baseUpdatedAt` → 409 `SET_CHANGED`), `POST /cards/:id/image` (editor), `GET /folders/:id`, `/folders/:id/study` (viewer lớp), `GET /images/:id` (viewer lớp).
Mã lỗi: `SET_CHANGED`, `CHANGE_REQUEST_LIMIT`, `NOT_CLASSMATE`, `CONTRIBUTIONS_CLOSED` → `src/lib/repository-error.ts` + `errors.*` (vi: "Bộ thẻ vừa được người khác sửa. Hãy tải lại rồi áp dụng lại thay đổi của bạn." / "Bộ thẻ này đã có 20 đề xuất chờ duyệt." / "Người này không học chung lớp nào với bạn." / "Chủ bộ thẻ đang tắt nhận đóng góp.").

## B7. Client
**Trạng thái:** todo

`src/features/sets/collab/schemas.ts` (dùng chung client+server):
```ts
export const cardOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), card: cardInputSchema.omit({ id: true }) }),
  z.object({ op: z.literal("edit"), cardId: z.string().min(1).max(64), card: cardInputSchema.omit({ id: true }) }),
  z.object({ op: z.literal("delete"), cardId: z.string().min(1).max(64) }),
]);
export const changeOpsSchema = z.object({ title: ….optional(), description: ….optional(), cards: z.array(cardOpSchema).max(200) })
  .refine((o) => o.cards.length > 0 || o.title !== undefined || o.description !== undefined, { error: "noChanges" });
export const setAccessSchema = z.object({ isOwner, canEdit, acceptsContributions, pendingChangeRequests: z.number().int().optional(), sharedIn: z.object({classId, className, sharedByName, audience}).nullable().optional() });
// + changeRequestSummarySchema, changeRequestDetailSchema, pendingReviewItemSchema, collaboratorCandidatesSchema
```
`src/features/sets/lib/card-diff.ts` (thuần, mỗi hàm < 50 dòng): `diffCards(before: Card[], after: DraftCard[]): ChangeOps["cards"]` (theo id: không đổi → bỏ, đổi trường → edit, thiếu → delete, không id/id lạ → add; bỏ qua thứ tự; chuẩn hoá `""`/`undefined` cho phonetic/example), `diffSet(before: StudySet, after)`, `applyOps(cards, ops, newId)` (edit/delete id lạ bỏ qua; add nối cuối).

`src/features/class-library/{schemas,hooks}.ts`: `classLibraryKeys = { ofClass: (id) => ["classes", id, "library"], mine: ["classes","library","mine"], shares: (type,id) => ["classes","library","shares",type,id] }` (nằm dưới `["classes"]` nên `useClassAction` đã invalidate); `useClassLibrary`, `useMyClassLibrary`, `useItemShares`, `useShareToClass`, `useUnshare`.

`src/features/sets/collab/hooks.ts`: `collabKeys = { requests(setId), request(id), mine, collaborators(setId) }`; `useChangeRequests`, `useChangeRequest`, `usePendingReviews`, `useProposeChange(setId)`, `useReviewChangeRequest` (invalidate `setKeys.detail(setId)`, `["sets"]` exact, requests, request, mine), `useWithdrawChangeRequest`, `useCollaborators`, `useCollaboratorAction`, `useAcceptsContributions`.

`SetEditor` gửi `baseUpdatedAt: set.updatedAt`; lỗi `SET_CHANGED` → toast + nút tải lại.

## B8. UI (gate `NEXT_PUBLIC_DATA_SOURCE === "http"`)
**Trạng thái:** todo

| Component | Props / nội dung | Mount |
|---|---|---|
| `ShareToClassPanel` (`src/features/class-library/components/`) | `{itemType, itemId}`; danh sách lớp của tôi (`useClasses`) với `Switch` + `Select` audience (Giáo viên / Cả lớp); `useItemShares`, `useShareToClass`, `useUnshare` | `ShareDialog.tsx:196-243` thêm `SegmentedControl` tab `link \| classes`; `ShareFolderDialog {folderId}` ở `FolderView.tsx:136-139` (owner) |
| `ShareItemToClassDialog` | `{classId}`; chọn bộ (`useSets`) hoặc thư mục (`useFolders`) của tôi + audience | `ClassLibrarySection` |
| `ClassLibrarySection` | `{klass}`; hàng: icon loại, tiêu đề, `Avatar` người share, `Badge` audience, số thẻ/bộ; Mở (`/sets/:id` hoặc `/folders/:id`), "Sao chép vào thư viện" (bộ, `useDuplicateSet`), Gỡ (`canRemove`) | `ClassView.tsx` `Section id="class-library"` sau bài giao (L347-350) |
| `FromClassLibrary` | `useMyClassLibrary`; lưới thẻ + chip tên lớp | `LibraryView.tsx` khi `tab=class`; `SegmentedControl` "Của tôi \| Từ lớp" cạnh tiêu đề, param `tab` |
| `SharedInBadge` | `{sharedIn}` → "Chia sẻ trong lớp {class} bởi {name}" link `/classes/:id` | `SetOverview` header khi viewer |
| `ViewerActions` | `{set}`: "Đề xuất chỉnh sửa" (link `/sets/:id/propose?class=`; ẩn nếu `!acceptsContributions`) hoặc "Chỉnh sửa" nếu `canEdit`; "Sao chép vào thư viện" | `SetOverview` khi `!access.isOwner` |
| `MyChangeRequests` | `{setId}`: đề xuất của tôi trên bộ này + Rút lại | `SetOverview` (viewer) |
| `CollaboratorsDialog` | `{setId, open, onOpenChange}`: theo lớp `Switch` "Tất cả giáo viên" + `Checkbox` thành viên; `Switch` "Nhận đóng góp" | `SetActions` menu "Cộng tác viên" (owner) |
| `ChangeRequestsPanel` + `ChangeRequestDiff` | `{setId}` / `{request}`: pending list, mở rộng → diff (thêm xanh, sửa cũ→mới, xoá gạch), `Textarea` ghi chú, Duyệt/Từ chối, cảnh báo `stale` | `SetOverview` section `id="change-requests"` (owner) |
| `PendingReviews` | `usePendingReviews`; "Chờ bạn duyệt" link `/sets/:id#change-requests` | `HomeDashboard.tsx` sau `AssignedToMe` (L145) |
| `SetEditor` (sửa) | `mode?: "edit" \| "propose"`; propose: tiêu đề "Đề xuất chỉnh sửa", `Textarea` ghi chú, nút "Gửi đề xuất", submit = `diffSet(set, values)` → rỗng → toast `validation.noChanges`; tách `use-editor-submit.ts` để hàm < 50 dòng | trang mới `src/app/(app)/sets/[id]/propose/page.tsx` (bản sao `edit/page.tsx` với `mode="propose"`) |
| `SetOverview` (sửa) | `const access = set.access ?? { isOwner: !user \|\| user.id === set.ownerId, canEdit: same, acceptsContributions: true }`; owner → `SetActions`, khác → `ViewerActions`; `CardList editable={access.canEdit}`; `AiSetTools` owner-only | — |
| `FolderView` (sửa) | ẩn Đổi tên/Xoá/Gỡ bộ khi `!data.isOwner`; chú thích read-only; `ShareFolderDialog` cho owner | — |

## B9. i18n (3 ngôn ngữ)
**Trạng thái:** todo
`errors.{SET_CHANGED,CHANGE_REQUEST_LIMIT,NOT_CLASSMATE,CONTRIBUTIONS_CLOSED}`, `validation.noChanges`, `classes.library.{title,share,shareItem,chooseItem,audience,audienceTeachers,audienceClass,empty,open,copy,copied,remove,removed,shared,sharedBy,setItem,folderItem,setCount}`, `community.shareTabs.{link,classes}`, `community.classShare.{hint,none}`, `library.{tabMine,tabFromClass,fromClassEmpty,fromClass}`, `folders.{share,shareTitle,readOnly,sharedIn}`, `collab.{propose,proposeTitle,note,notePlaceholder,send,sent,noChanges,edit,copyToLibrary,sharedIn,pendingTitle,pendingCount,approve,reject,withdraw,withdrawn,approved,rejected,reviewNote,stale,added,edited,deleted,titleChange,descriptionChange,opCount,mine,status.{pending,approved,rejected,withdrawn},collaborators,collaboratorsTitle,allTeachers,collaboratorsHint,acceptContributions,acceptContributionsHint,homeTitle,by}`.

## B10. Test
**Trạng thái:** todo

Integration (harness như `tests/integration/classes.test.ts:29-68`; user: owner-học sinh `an`, giáo viên `mai`, đồng giáo viên `binh`, bạn lớp `bao`, người ngoài):

| # | Kịch bản | Mong đợi |
|---|---|---|
| A1 | owner `getSet`/`updateSet` | ok; `access.isOwner && canEdit`, `pendingChangeRequests: 0` |
| A2 | collaborator đích danh (bạn lớp) `updateSet` | ok; `canEdit`, `!isOwner` |
| A3 | grant `class_teachers` → giáo viên + đồng giáo viên `updateSet` ok; học sinh cùng lớp 403 |
| A4 | học sinh xem bộ share `audience=class` | `getSet` ok, `updateSet` 403, không có `sharing`, `access.sharedIn.className` |
| A5 | học sinh xem qua **thư mục** share (bộ không share trực tiếp) | ok; sau `removeSetFromFolder` → 404 |
| A6 | `audience=teachers` | giáo viên ok, học sinh 404; share lại `class` → ok |
| A7 | người ngoài | 404 get/update/propose; `listClassLibrary` 404 |
| A8 | thành viên rời lớp | item của người đó bị xoá; viewer đã rời → 404; collaborator qua `class_teachers` sau khi rời → 403/404 |
| A9 | `revokeCollaborator` | `updateSet` → 403 |
| A10 | bộ bị moderator ẩn (`hiddenAt`) | viewer/collaborator 404; owner ok |
| A11 | owner bị ban | lớp không thấy bộ |
| A12 | `updateSet` với `baseUpdatedAt` cũ | 409 `SET_CHANGED`; không gửi → ok |
| A13 | route ảnh cho viewer lớp trên bộ private | ok |
| A14 | `dueCards(..., folderId)` thư mục chia sẻ | có thẻ của viewer |
| L1 | `shareToClass` bởi non-owner item / non-member → 404; giáo viên gỡ item học sinh ok; học sinh khác gỡ → 403; item 501 → 409 |
| L2 | `listClassLibrary` lọc theo vai trò; `myClassLibrary` 2 lớp; bộ đã xoá bị lọc |
| C1 | grant cho người không chung lớp → 403 `NOT_CLASSMATE`; tự cấp → 400; thứ 51 → 409 |
| C2 | `collaboratorCandidates` của owner-học sinh chỉ liệt kê giáo viên |
| R1 | owner tự đề xuất → 403; viewer ok; pending thứ 21 → 409; `cardId` lạ → 400; `classId` không phải lớp của author → 404; `acceptsContributions=false` → 403 `CONTRIBUTIONS_CLOSED` |
| R2 | approve áp dụng add+edit+delete atomic, position liên tục, `cardCount`, `updatedAt` tăng, `moderationStatus` reset qua `markEdited` (mock groq như `community-api.test.ts:12-21`), có `audit_logs` |
| R3 | approve để lại < 2 thẻ → 400, request vẫn pending, thẻ nguyên |
| R4 | approve sau khi thẻ đã xoá → op bỏ qua, approved, `getChangeRequest` trước đó báo `stale` |
| R5 | reject lưu `reviewNote`; review lần 2 → 409; withdraw bởi người khác → 403; `listChangeRequests` non-owner chỉ thấy của mình; `myChangeRequests` |
| API | `tests/integration/collab-api.test.ts` gọi `communityApi` như `community-api.test.ts:34-43`: smoke mọi route, 404 path lạ, rate-limit mock |

Unit (jsdom): `card-diff.test.ts` (no-op rỗng; sửa 1 trường; xoá; add không id/id lạ; hỗn hợp; `applyOps(diffCards(a,b)) ≅ b` bỏ id/thứ tự; id lạ bỏ qua), `collab/schemas.test.ts` (giới hạn 200 op, refine `noChanges`), `ChangeRequestDiff.test.tsx`, bổ sung `SetOverview.test.tsx` (viewer có `access.sharedIn` thấy "Đề xuất chỉnh sửa" + badge; `canEdit && !isOwner` thấy "Chỉnh sửa" không thấy share/xoá; thiếu `access` → hành vi cũ), `SetEditor.test.tsx` (propose mode; form không đổi → toast, không gọi fetch), `ClassLibrarySection.test.tsx` (nút Gỡ chỉ khi `canRemove`).

E2E `tests/e2e/class-library.spec.ts` (multi-context, `person()` helper, 90s, skip nếu không http):
1. Giáo viên tạo lớp; học sinh join bằng mã; học sinh tạo bộ qua API; mở `/sets/:id` → "Chia sẻ" → tab "Lớp học" → bật lớp với "Cả lớp".
2. Giáo viên mở lớp → "Thư viện lớp" có bộ + tên học sinh → mở → "Đề xuất chỉnh sửa" → đổi 1 định nghĩa → "Gửi đề xuất" → toast.
3. `/home` học sinh có "Chờ bạn duyệt" với tên giáo viên; mở bộ, panel "Đề xuất chờ duyệt (1)" hiện cũ → mới, bấm "Duyệt"; danh sách thẻ đổi; trang giáo viên reload thấy text mới.
4. Học sinh mở "Cộng tác viên", bật "Tất cả giáo viên"; giáo viên reload thấy "Chỉnh sửa", sửa và lưu trực tiếp ("Đã lưu").
5. Học sinh share thư mục "Cả lớp"; giáo viên mở `/folders/:id` read-only (không "Đổi tên"), học `/study/folder/:id/flashcards`.

## Thứ tự làm
1 schema/migration → 2 access + test → 3 sets.ts → 4 ảnh → 5 classes/folders → 6 class-library → 7 collaborators → 8 change-requests → 9 collab-api + mã lỗi → 10 schemas/card-diff/hooks → 11 UI share/thư viện → 12 trang bộ thẻ, propose mode, cộng tác viên, panel duyệt, Home → 13 i18n → 14 e2e → lint/typecheck/unit/integration → `code-reviewer`.

## Rủi ro
- Reorder và ảnh không đề xuất được (diff bỏ qua thứ tự) → ghi trong hint propose mode.
- `sharedToClassOf` thêm exists lồng vào mọi `requireStudySet`; index có sẵn trên `class_library_items(item_id)`, `folder_sets(set_id)`, `class_members(user_id)`. Theo dõi p95 trang học.
- Owner-học sinh chỉ cấp được cho người mình thấy (giáo viên); owner-giáo viên cấp mọi thành viên. Ghi trong hint dialog.
- Owner rời lớp → share của họ ở lớp đó bị xoá (học sinh mất quyền ngay).
- `markEdited` sau approve đưa bộ public vào kiểm duyệt lại; owner chịu trách nhiệm (chính sách không đổi).
- Nút "Chia sẻ" vẫn owner-only (e2e `classes.spec.ts:79`).
- Hai editor lưu cùng lúc: người sau nhận 409 (`baseUpdatedAt`); `reviewChangeRequest` lock request + set trong 1 tx.
