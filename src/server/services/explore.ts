import "server-only";
import { and, desc, eq, gt, gte, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { CONTENT_LANGUAGES } from "@/lib/types";
import { normalizeSearch } from "@/features/community/lib/search";
import type { Database } from "../db/client";
import { studySets, user } from "../db/schema";

export const EXPLORE_PAGE_SIZE = 24;
const MAX_PAGE = 20;
const DESCRIPTION_PREVIEW = 200;
const POPULAR_DAYS = 7;
const SIZES = { small: [2, 20], medium: [21, 50], large: [51, 500] } as const;

export const exploreQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  termLang: z.enum(CONTENT_LANGUAGES).optional().catch(undefined),
  definitionLang: z.enum(CONTENT_LANGUAGES).optional().catch(undefined),
  size: z.enum(["small", "medium", "large"]).optional().catch(undefined),
  tag: z.string().trim().toLowerCase().max(24).optional().catch(undefined),
  sort: z.enum(["relevance", "new", "popular"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).catch(1),
});
export type ExploreQuery = z.infer<typeof exploreQuerySchema>;

export interface ExploreItem {
  slug: string;
  title: string;
  description: string;
  termLang: string;
  definitionLang: string;
  cardCount: number;
  tags: string[];
  author: { name: string; avatarColor: string; username: string | null };
  copiesThisWeek: number;
  updatedAt: string;
}

/** Copies of each original made in the last week, the "popular" signal. */
const recentCopies = (db: Database) =>
  db
    .select({
      originalId: studySets.copiedFromId,
      copies: sql<number>`count(*)::int`.as("copies"),
    })
    .from(studySets)
    .where(
      and(
        isNotNull(studySets.copiedFromId),
        gte(studySets.createdAt, sql`now() - make_interval(days => ${POPULAR_DAYS})`),
      ),
    )
    .groupBy(studySets.copiedFromId)
    .as("recent_copies");

/** Public, approved, not taken down, owner in good standing: what Explore may show. */
export const listedFilter = (): SQL[] => [
  eq(studySets.visibility, "public"),
  eq(studySets.moderationStatus, "approved"),
  isNull(studySets.hiddenAt),
  isNull(studySets.deletedAt),
  isNull(user.bannedAt),
  isNull(user.deletedAt),
];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/**
 * Searches listed public sets. Matching is accent-insensitive and works for any script (the
 * query is folded like the stored text); results rank title matches first.
 */
export async function searchSets(
  db: Database,
  query: ExploreQuery,
  extra: { ownerId?: string; limit?: number } = {},
) {
  const limit = extra.limit ?? EXPLORE_PAGE_SIZE;
  const q = normalizeSearch(query.q);
  const sort = query.sort ?? (q ? "relevance" : "popular");
  const copies = recentCopies(db);
  const filters = listedFilter();
  if (q) filters.push(sql`${studySets.searchText} like ${`%${escapeLike(q)}%`}`);
  if (query.termLang) filters.push(eq(studySets.termLang, query.termLang));
  if (query.definitionLang) filters.push(eq(studySets.definitionLang, query.definitionLang));
  if (query.size) {
    const [min, max] = SIZES[query.size];
    filters.push(gte(studySets.cardCount, min), lte(studySets.cardCount, max));
  }
  if (query.tag) filters.push(sql`${query.tag} = any(${studySets.tags})`);
  if (extra.ownerId) filters.push(eq(studySets.ownerId, extra.ownerId));
  const copiesCount = sql<number>`coalesce(${copies.copies}, 0)`;
  const ordering =
    sort === "new"
      ? [desc(studySets.updatedAt)]
      : sort === "popular"
        ? [desc(copiesCount), desc(studySets.updatedAt)]
        : [
            // The title and description come first in the stored text.
            sql`case when strpos(${studySets.searchText}, ${q}) between 1 and 160 then 0 else 1 end`,
            sql`word_similarity(${q}, ${studySets.searchText}) desc`,
            desc(copiesCount),
            desc(studySets.updatedAt),
          ];
  const rows = await db
    .select({
      set: {
        slug: studySets.slug,
        title: studySets.title,
        description: studySets.description,
        termLang: studySets.termLang,
        definitionLang: studySets.definitionLang,
        cardCount: studySets.cardCount,
        tags: studySets.tags,
        updatedAt: studySets.updatedAt,
      },
      author: {
        name: user.name,
        avatarColor: user.avatarColor,
        username: user.username,
        profilePublic: user.profilePublic,
      },
      copies: copiesCount,
    })
    .from(studySets)
    .innerJoin(user, eq(user.id, studySets.ownerId))
    .leftJoin(copies, eq(copies.originalId, studySets.id))
    .where(and(...filters))
    .orderBy(...ordering, desc(studySets.id))
    .limit(limit + 1)
    .offset((query.page - 1) * limit);
  const items: ExploreItem[] = rows.slice(0, limit).map(({ set, author, copies: count }) => ({
    slug: set.slug!,
    title: set.title,
    description: set.description.slice(0, DESCRIPTION_PREVIEW),
    termLang: set.termLang,
    definitionLang: set.definitionLang,
    cardCount: set.cardCount,
    tags: set.tags,
    author: {
      name: author.name,
      avatarColor: author.avatarColor,
      username: author.profilePublic ? author.username : null,
    },
    copiesThisWeek: count,
    updatedAt: set.updatedAt.toISOString(),
  }));
  return { items, page: query.page, hasMore: rows.length > limit && query.page < MAX_PAGE, sort };
}

/** Sets copied most in the last week. */
export async function popularThisWeek(db: Database, limit = 6) {
  const { items } = await searchSets(db, exploreQuerySchema.parse({ sort: "popular" }), { limit });
  return items.filter((item) => item.copiesThisWeek > 0);
}

/** Most used tags among listed sets, for topic chips. */
export async function topTags(db: Database, limit = 12) {
  const rows = await db
    .select({ tag: sql<string>`tag`, count: sql<number>`count(*)::int` })
    .from(
      sql`(select unnest(${studySets.tags}) as tag from ${studySets} inner join ${user} on ${user.id} = ${studySets.ownerId} where ${and(...listedFilter())}) as listed_tags`,
    )
    .groupBy(sql`tag`)
    .having(gt(sql`count(*)`, 0))
    .orderBy(desc(sql`count(*)`), sql`tag`)
    .limit(limit);
  return rows.map((row) => row.tag);
}
