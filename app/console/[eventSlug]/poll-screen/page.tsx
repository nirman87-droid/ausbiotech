import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { getEventBySlug, pollQuestions } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { topics } from "@/lib/topics";
import { POLL_MIN_RESPONSES } from "@/lib/rules";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PollScreen } from "./PollScreen";

export const metadata: Metadata = { title: "Poll screen" };

export default async function PollScreenPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const staff = await requireStaff();
  const event = await getEventBySlug(eventSlug);
  if (!event) notFound();
  const db = await getDb();
  const [questions, rows] = await Promise.all([
    pollQuestions(event.id),
    db.query<{ question_id: string; answer: string; n: number }>(
      `select r.question_id, r.answer, count(*) as n from poll_responses r join poll_questions q on q.id = r.question_id
        where q.event_id = $1 group by r.question_id, r.answer`,
      [event.id],
    ),
  ]);
  const data = questions.map((q) => {
    const mine = rows.filter((r) => r.question_id === q.id);
    const total = mine.reduce((s, r) => s + Number(r.n), 0);
    // Below the privacy threshold, send no counts to the browser at all.
    const counts = total < POLL_MIN_RESPONSES ? [] : q.options.map((o) => ({ option: o, count: Number(mine.find((r) => r.answer === o)?.n ?? 0) }));
    return { id: q.id, text: q.text, type: q.type, counts, total };
  });
  return (
    <>
      <LiveRefresh topics={[topics.poll(event.id), topics.event(event.id)]} debounceMs={500} />
      <PollScreen slug={event.slug} questions={data} pollOpen={event.poll_open} isAdmin={staff.role === "admin"} />
    </>
  );
}
