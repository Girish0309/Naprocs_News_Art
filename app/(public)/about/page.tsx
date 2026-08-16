import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About",
  description: `About ${SITE_NAME} — our mission and how to reach us.`,
  alternates: { canonical: `${SITE_URL}/about` },
};

// Placeholder copy throughout this page — mission statement and contact details are
// provisional, pending final copy from the editorial team (see the Archive/About
// decision brief: a minimal version was scoped to mission + contact only; a masthead,
// submission guidelines, and a press section were deliberately deferred there).
export default function AboutPage() {
  return (
    <div className="flex flex-col items-center px-gutter py-section-gap">
      <div className="w-full max-w-max-reading-width">
        <h1 className="mb-12 font-display-lg text-journal-display-lg text-journal-on-surface">About {SITE_NAME}</h1>

        <section className="mb-12">
          <h2 className="mb-4 font-headline-lg text-journal-headline-lg text-journal-on-surface">Our Mission</h2>
          <p className="font-article-body text-journal-article-body text-journal-secondary">
            [Placeholder copy] {SITE_NAME} publishes thoughtful, long-form writing on culture, design, and modern
            life — essays that reward a slow read over a quick scroll. Replace this paragraph with the team&apos;s
            real mission statement.
          </p>
        </section>

        <section>
          <h2 className="mb-4 font-headline-lg text-journal-headline-lg text-journal-on-surface">Get in Touch</h2>
          <p className="font-article-body text-journal-article-body text-journal-secondary">
            [Placeholder copy] Have a pitch, a correction, or just want to say hello? Reach us at{" "}
            <a
              href="mailto:hello@example.com"
              className="text-journal-primary underline underline-offset-4 transition-opacity hover:opacity-80"
            >
              hello@example.com
            </a>
            . This address is a placeholder — replace with a real inbox before launch.
          </p>
        </section>
      </div>
    </div>
  );
}
