import Link from "next/link";
import type { Metadata } from "next";
import { requireParticipant } from "@/lib/session";
import { peopleForCompany } from "@/lib/queries";
import { STAGE_INFO } from "@/lib/copy";
import { PageTitle } from "@/lib/stage-gate";
import { DetailsForm } from "./DetailsForm";
import { FollowStage } from "@/components/participant/Shell";

export const metadata: Metadata = { title: "Welcome" };

// Arrival stage: confirm your details while everyone settles in.
export default async function Welcome({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params;
  const ctx = await requireParticipant(eventSlug);
  const team = await peopleForCompany(ctx.company.id);
  const stage = ctx.event.current_stage;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <FollowStage slug={ctx.event.slug} current={stage} from="arrival" />
      <div>
        <PageTitle step="Step 1" title={`Welcome, ${ctx.person.name.split(" ")[0]}`} intro="Check your details are right. You can change them at any time." />
        <DetailsForm company={ctx.company} name={ctx.person.name} role={ctx.person.role} />
        <div className="mt-8">
          {stage === "arrival" ? (
            <p className="notice" role="status">
              We will start soon. Your facilitator will open the first stage for everyone, and this page will move on by itself.
            </p>
          ) : (
            <Link className="btn" href={`/${ctx.event.slug}/${STAGE_INFO[stage].path}`}>
              Continue to {STAGE_INFO[stage].label}
            </Link>
          )}
        </div>
      </div>
      <aside aria-labelledby="team-title" className="card h-fit p-4">
        <h2 id="team-title" className="text-lg font-semibold">
          Your team today
        </h2>
        <ul className="mt-3 grid gap-2">
          {team.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="block font-medium text-ink">
                  {p.name}
                  {p.id === ctx.person.id && <span className="text-muted"> (you)</span>}
                </span>
                {p.role && <span className="block text-sm text-muted">{p.role}</span>}
              </span>
              {p.active && <span className="pill pill-success">Active</span>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
