import Link from "next/link";

// The bare domain. Participants arrive through table QR codes, so this page is for staff.
export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="mono-label">ARM Hub AI Adopt</p>
      <h1 className="mt-2 text-3xl font-semibold">AI Use Case Builder</h1>
      <p className="mt-3 text-lg">Workshop participants: scan the QR code on your table to begin.</p>
      <p className="mt-6 flex flex-wrap gap-3">
        <Link className="btn btn-secondary" href="/console">
          Team console
        </Link>
        <Link className="link self-center" href="/privacy">
          Privacy statement
        </Link>
      </p>
    </main>
  );
}
