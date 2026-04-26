// app/(dashboard)/interviews/thank-you/page.tsx
import Link from "next/link";

export default function InterviewThankYouPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-white">Thank you for your time!</h1>
        <p className="text-gray-400 text-sm">
          The interview has ended. The hiring team will be in touch with next steps soon.
        </p>
        <Link
          href="/applications"
          className="inline-block mt-4 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Back to Applications
        </Link>
      </div>
    </div>
  );
}