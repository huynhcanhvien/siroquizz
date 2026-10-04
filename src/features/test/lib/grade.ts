import { isAnswerMatch } from "@/lib/normalize";
import type { Answer, AnswerMap, Question, QuestionResult, TestGrade } from "./types";

function maxPointsOf(question: Question): number {
  return question.type === "matching" ? question.pairs.length : 1;
}

function pointsFor(question: Question, answer: Answer | undefined): number {
  if (!answer || answer.type !== question.type) return 0;
  switch (question.type) {
    case "multipleChoice":
      return answer.type === "multipleChoice" && answer.optionId === question.correctOptionId
        ? 1
        : 0;
    case "trueFalse":
      return answer.type === "trueFalse" && answer.value === question.isTrue ? 1 : 0;
    case "written":
      return answer.type === "written" &&
        (answer.overridden || isAnswerMatch(answer.text, question.answer))
        ? 1
        : 0;
    case "matching":
      if (answer.type !== "matching") return 0;
      return question.pairs.filter((pair) => answer.matches[pair.cardId] === pair.cardId).length;
  }
}

export function gradeQuestion(question: Question, answer: Answer | undefined): QuestionResult {
  const points = pointsFor(question, answer);
  const maxPoints = maxPointsOf(question);
  return { questionId: question.id, points, maxPoints, correct: points === maxPoints };
}

export function gradeTest(questions: readonly Question[], answers: AnswerMap): TestGrade {
  const results = questions.map((question) => gradeQuestion(question, answers[question.id]));
  return {
    results,
    score: results.reduce((sum, result) => sum + result.points, 0),
    total: results.reduce((sum, result) => sum + result.maxPoints, 0),
  };
}

export function isAnswered(question: Question, answer: Answer | undefined): boolean {
  if (!answer) return false;
  if (answer.type === "written") return answer.text.trim().length > 0;
  if (answer.type === "matching" && question.type === "matching") {
    return question.pairs.every((pair) => answer.matches[pair.cardId] !== undefined);
  }
  return true;
}

export function countAnswered(questions: readonly Question[], answers: AnswerMap): number {
  return questions.filter((question) => isAnswered(question, answers[question.id])).length;
}

/** Card ids behind questions that were not fully correct, for "retake mistakes". */
export function questionsForCards(questions: readonly Question[], grade: TestGrade): string[] {
  const wrongIds = new Set(
    grade.results.filter((result) => !result.correct).map((result) => result.questionId),
  );
  return questions
    .filter((question) => wrongIds.has(question.id))
    .flatMap((question) =>
      question.type === "matching" ? question.pairs.map((pair) => pair.cardId) : [question.cardId],
    );
}
