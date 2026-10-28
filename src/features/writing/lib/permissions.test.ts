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
        expect(canWriteDoc(viewer.role, viewer.userId, AUTHOR, gate)).toBe(rules.write);
        expect(canListDocs(viewer.role, gate)).toBe(rules.list);
      });
  it("never lets a peer write unless peers can also read", () => {
    for (const gate of gates)
      if (canWriteDoc("student", PEER, AUTHOR, gate))
        expect(canReadDoc("student", PEER, AUTHOR, gate)).toBe(true);
  });
});
