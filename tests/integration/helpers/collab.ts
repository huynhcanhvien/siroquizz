import { v7 } from "uuid";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { createSetInTransaction } from "@/server/services/sets";
import { createClass, getClass, joinClass, setMemberRole } from "@/server/services/classes";

/** People of the collaboration scenarios: a class taught by Mai and Bình with students An, Bảo. */
export interface Cast {
  an: string;
  mai: string;
  binh: string;
  bao: string;
  outsider: string;
}
export const newCast = (): Cast => ({ an: v7(), mai: v7(), binh: v7(), bao: v7(), outsider: v7() });

export async function insertCast(db: Database, cast: Cast) {
  const names: Record<keyof Cast, string> = {
    an: "An",
    mai: "Cô Mai",
    binh: "Thầy Bình",
    bao: "Bảo",
    outsider: "Người lạ",
  };
  await db.insert(schema.user).values(
    (Object.keys(cast) as (keyof Cast)[]).map((key) => ({
      id: cast[key],
      name: names[key],
      email: `${key}-${cast[key]}@example.com`,
      emailVerified: true,
    })),
  );
}

/** Mai owns the class, Bình co-teaches, An and Bảo are students. */
export async function makeClass(db: Database, cast: Cast, name = "Lớp 10A") {
  const { id } = await createClass(db, cast.mai, { name });
  const { joinCode } = (await getClass(db, cast.mai, id)) as { joinCode: string };
  for (const member of [cast.an, cast.bao, cast.binh])
    await joinClass(db, member, { code: joinCode });
  await setMemberRole(db, cast.mai, id, cast.binh, { role: "teacher" });
  return { id, joinCode };
}

export const makeSet = (db: Database, owner: string, title = "An's words", size = 4) =>
  db.transaction((tx) =>
    createSetInTransaction(tx, owner, {
      title,
      description: "",
      termLang: "en",
      definitionLang: "vi",
      source: "manual",
      cards: Array.from({ length: size }, (_, i) => ({
        term: `${title} ${i}`,
        definition: `d ${i}`,
      })),
    }),
  );
