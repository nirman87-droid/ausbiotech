import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy statement" };

// Privacy statement in line with the Australian Privacy Principles.
// HANDOVER: needs review by ARM Hub's privacy or legal contact before the event.
// The contact email comes from PRIVACY_CONTACT_EMAIL. Nothing is shown when it is not set.
export default function Privacy() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10">
      <p className="mono-label">ARM Hub AI Use Case Builder</p>
      <h1 className="mt-2 text-3xl font-semibold">Privacy statement</h1>
      <div className="mt-6 grid gap-6 text-lg leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">What we collect</h2>
          <ul className="mt-2 list-disc pl-6">
            <li>Your name, role and work email, and your organisation&rsquo;s name, website, sector, size and state.</li>
            <li>Your answers to the warm-up poll.</li>
            <li>What your team writes in the workshop: data problems, ratings, your golden use case draft and next steps.</li>
            <li>Whether you agreed to be contacted, the exact wording you agreed to, and when.</li>
            <li>Basic technical details: which device you signed in on and when you last used the tool.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">How we use it</h2>
          <ul className="mt-2 list-disc pl-6">
            <li>To run the workshop and show your team&rsquo;s work back to you.</li>
            <li>To write your AI starter plan and send it to the people registered from your organisation.</li>
            <li>To understand common themes across the workshop. Any summary we share does not name you or your organisation.</li>
            <li>To contact you about your plan, funding options and related ARM Hub programs, but only if you ticked the consent box. You can withdraw at any time.</li>
          </ul>
          <p className="mt-2">Poll results shown on the big screen are totals only and never show names.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Where it is kept</h2>
          <p className="mt-2">
            Your information is stored in Australia, in Sydney. If the ARM Hub team turns on the optional AI helper for an
            event, the text you ask it to improve is sent to Anthropic, an AI provider outside Australia, to produce a
            suggestion. Nothing is changed unless you accept the suggestion.
          </p>
          <p className="mt-2">If you agreed to be contacted, your name, email and organisation details are added to ARM Hub&rsquo;s customer system (HubSpot).</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Your choices</h2>
          <p className="mt-2">
            You can ask to see the information we hold about you, ask us to correct it, or ask us to delete it.
            {contact ? (
              <> Email <a className="link" href={`mailto:${contact}`}>{contact}</a>.</>
            ) : (
              <> Ask any member of the ARM Hub team.</>
            )}
          </p>
          {/* HANDOVER: add ARM Hub's privacy contact (PRIVACY_CONTACT_EMAIL) and how to complain to the OAIC once confirmed. */}
        </section>
      </div>
      <p className="mt-10"><Link className="link" href="/">Back</Link></p>
    </main>
  );
}
