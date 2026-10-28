import { describe, expect, it } from "vitest";
import type { ClassRole } from "@/features/classes/schemas";
import { canListDocs, canReadDoc, canWriteDoc, teaches, type SessionGate } from "./permissions";

const AUTHOR = "author",
  PEER = "peer",
  TEACHER = "teacher";
const statuses = ["draft", "open", "closed"] as const;
const visibilities = ["hidden", "open"] as const;
const gates: SessionGate[] = statuses.flatMap((status) =>
  visibilities.flatMap((peerVisibility) =>
    [false, true].map((peerEditing) => ({ status, peerVisibility, peerEditing })),
  ),
);
type Viewer = { name: string; role: ClassRole; userId: string };
const viewers: Viewer[] = [
  { name: "owner", role: "owner", userId: TEACHER },
  { name: "co-teacher", role: "teacher", userId: TEACHER },
  { name: "author", role: "student", userId: AUTHOR },
  { name: "peer", role: "student", userId: PEER },
];
/** The rules written out independently of the implementation. */
function expected(viewer: Viewer, gate: SessionGate) {
  const teacher = viewer.role !== "student";
  const author = viewer.userId === AUTHOR;
  const peersOpen = gate.peerVisibility === "open";
  return {
    read: teacher || (author ? gate.status !== "draft" : gate.status !== "draft" && peersOpen),
    write: gate.status === "open" && (teacher || author || (peersOpen && gate.peerEditing)),
    list: teacher || peersOpen,
  };
}

describe("writing permissions", () => {
  it("treats owners and co-teachers as teaching", () => {
    expect(teaches("owner")).toBe(true);
    expect(teaches("teacher")).toBe(true);
    expect(teaches("student")).toBe(false);
  });
  for (const viewer of viewers)
    for (const gate of gates)
      it(`${viewer.name} with ${gate.status}/${gate.peerVisibility}/${gate.peerEditing ? "editing" : "no-editing"}`, () => {
        const rules = expected(viewer, gate);
        expect(canReadDoc(viewer.role, viewer.userId, AUTHOR, gate)).toBe(rules.read);
        expect(canWriteDoc(viewer.role, viewer.userId, AUTHOR, gate, "student")).toBe(rules.write);
        expect(canListDocs(viewer.role, gate)).toBe(rules.list);
      });
  it("never lets a peer write unless peers can also read", () => {
    for (const gate of gates)
      if (canWriteDoc("student", PEER, AUTHOR, gate, "student"))
        expect(canReadDoc("student", PEER, AUTHOR, gate)).toBe(true);
  });
  it("never lets students write in a teacher's own document, even with peer editing on", () => {
    const gate: SessionGate = { status: "open", peerVisibility: "open", peerEditing: true };
    expect(canWriteDoc("student", PEER, TEACHER, gate, "owner")).toBe(false);
    expect(canWriteDoc("student", PEER, TEACHER, gate, "teacher")).toBe(false);
    // Someone who left the class is not a classmate either.
    expect(canWriteDoc("student", PEER, "gone", gate, null)).toBe(false);
    // Teachers still write anywhere; the author still writes in their own.
    expect(canWriteDoc("teacher", "co", TEACHER, gate, "owner")).toBe(true);
    expect(canWriteDoc("owner", TEACHER, TEACHER, gate, "owner")).toBe(true);
  });
});
