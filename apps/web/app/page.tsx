import { StickyNav } from './_landing/sticky-nav';
import { Hero } from './_landing/hero';
import { HowItWorks } from './_landing/how-it-works';
import { FeatureSection } from './_landing/feature-section';
import { LandingFooter } from './_landing/footer';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <StickyNav />
      <main className="flex-1">
        <Hero />
        <HowItWorks />

        <FeatureSection
          eyebrow="Personalization"
          headline="Questions grounded in your actual work"
          description="Every question is generated from a specific phrase in your resume — not a generic interview list. You'll be asked about the projects you built, not someone else's. The anchor is verbatim from your resume, so textbook answers don't fly."
          imageSrc="/screenshots/Question.png"
          imageAlt="Personalized interview question with type and difficulty badges"
          imagePosition="right"
        />

        <FeatureSection
          eyebrow="Honest feedback"
          headline="Graded on what matters"
          description="Every answer is scored on four dimensions: clarity, structure, depth, and relevance. The rubric is calibrated against real senior-interviewer expectations — most answers score 2-3, not inflated 5s. Strengths and weaknesses are specific enough to act on."
          imageSrc="/screenshots/Evaluation.png"
          imageAlt="Answer evaluation with four-dimension rubric and feedback"
          imagePosition="left"
        />

        <FeatureSection
          eyebrow="Repetition"
          headline="Iterate until you're ready"
          description="Run as many sessions as you want against different job descriptions. The dashboard tracks every session so you can see how your answers evolve over time. Practice the same question type until it lands consistently."
          imageSrc="/screenshots/Dashboard.png"
          imageAlt="Dashboard showing recent interview sessions"
          imagePosition="right"
        />
      </main>
      <LandingFooter />
    </div>
  );
}
