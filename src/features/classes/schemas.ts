import { z } from "zod";

export const classRoleSchema = z.enum(["owner", "teacher", "student"]);
export type ClassRole = z.infer<typeof classRoleSchema>;
export const classSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: classRoleSchema,
  members: z.number().int(),
  sets: z.number().int(),
});
export const classDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  role: classRoleSchema,
  joinCode: z.string().optional(),
  joinLocked: z.boolean().optional(),
  members: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      avatarColor: z.string(),
      role: classRoleSchema,
    }),
  ),
  sets: z.array(
    z.object({
      setId: z.uuid(),
      title: z.string(),
      cardCount: z.number().int(),
      dueAt: z.string().nullable(),
      assignedAt: z.string(),
    }),
  ),
});
export type ClassDetail = z.infer<typeof classDetailSchema>;
export const progressBoardSchema = z.object({
  students: z.array(z.object({ id: z.string(), name: z.string() })),
  sets: z.array(z.object({ id: z.uuid(), title: z.string(), cardCount: z.number().int() })),
  cells: z.array(
    z.object({
      studentId: z.string(),
      setId: z.uuid(),
      knownPercent: z.number(),
      lastTestPercent: z.number().nullable(),
      lastStudiedAt: z.string().nullable(),
    }),
  ),
});
export type ProgressBoard = z.infer<typeof progressBoardSchema>;
export const assignedItemSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  setId: z.uuid(),
  title: z.string(),
  cardCount: z.number().int(),
  dueAt: z.string().nullable(),
  known: z.number().int(),
});
export const isTeaching = (role: ClassRole) => role === "owner" || role === "teacher";
