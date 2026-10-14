import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scan your table code" };

// Shown when there is no valid table code or session. Deliberately reveals nothing.
export default async function NoAccess() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="mono-label">AI Use Case Builder</p>
      <h1 className="mt-2 text-3xl font-semibold">Scan the code on your table</h1>
      <p className="mt-3 text-lg">
        To join the workshop, scan the QR code on your table card with your phone or laptop camera.
      </p>
      <p className="mt-3">
        After the event, use the personal link in the email we sent you. If you cannot find it, ask the ARM Hub team.
      </p>
    </main>
  );
}
