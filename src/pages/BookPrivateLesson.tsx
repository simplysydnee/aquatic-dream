import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import PrivateBookingFlow from "@/components/private-lessons/PrivateBookingFlow";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { Button } from "@/components/ui/button";
import { isSeasonStarted, SEASON_START_LABEL } from "@/lib/season";
import {
  PROMO_ACTIVE_FOR_TODAY,
  PROMO_LABEL,
  PRIVATE_PROMO_PRICE,
  PRIVATE_REGULAR_PRICE,
} from "@/lib/privateLessonPricing";

const PrivateLessonsRetired = () => (
  <main className="min-h-screen bg-background">
    <SEO
      title="Private Swim Lessons — Now Swimberships | Aquatic Dreams"
      description="Private swim lessons at Aquatic Dreams in Modesto are now part of a monthly Swimbership with your own weekly time slot. Join online."
      path="/book-private-lesson"
    />
    <section className="bg-gradient-to-br from-primary/10 to-background py-16">
      <div className="container max-w-2xl">
        <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">
          Private Swim
        </p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
          Private lessons have moved to Swimberships
        </h1>
        <p className="text-muted-foreground mb-3">
          As of {SEASON_START_LABEL}, private swim is a monthly Swimbership instead of a
          lesson at a time booking. You keep the same weekly day, time, and instructor all
          year, and there is no need to rebook each week.
        </p>
        <p className="text-muted-foreground mb-8">
          Already have lessons on the calendar? Nothing changes. Your existing links for
          cancelling, rescheduling, and payment still work.
        </p>
        <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
          <Link to="/join">Join</Link>
        </Button>
      </div>
    </section>
  </main>
);

const BookPrivateLesson = () => {
  if (isSeasonStarted()) return <PrivateLessonsRetired />;

  const promo = PROMO_ACTIVE_FOR_TODAY;
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title={promo
          ? `Book a Private Swim Lesson — $${PRIVATE_PROMO_PRICE} ${PROMO_LABEL} | Aquatic Dreams`
          : "Book a Private Swim Lesson — Aquatic Dreams Modesto"}
        description={promo
          ? `${PROMO_LABEL}: $${PRIVATE_PROMO_PRICE} per 30-minute private swim lesson at Aquatic Dreams in Modesto. Pick your instructor, day, and time. Charged the day of each lesson.`
          : `Book a private swim lesson at Aquatic Dreams in Modesto. Pick your instructor, day, and time. $${PRIVATE_REGULAR_PRICE} per 30-minute lesson, charged the day of class.`}
        path="/book-private-lesson"
      />
      <PaymentTestModeBanner />

      <section className="bg-gradient-to-br from-primary/10 to-background py-12">
        <div className="container">
          <p className="text-primary font-medium tracking-wider uppercase text-sm mb-2">
            One-on-One Instruction
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
            Book a Private Lesson
          </h1>
          {promo && (
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-coral/15 border border-coral/30 text-sm font-semibold text-foreground">
              <span className="text-coral">★ {PROMO_LABEL}</span>
              <span className="text-muted-foreground">·</span>
              <span><span className="line-through text-muted-foreground mr-1">${PRIVATE_REGULAR_PRICE}</span><span>${PRIVATE_PROMO_PRICE} per lesson</span></span>
            </div>
          )}
          <p className="text-muted-foreground max-w-2xl">
            Pick your instructor, day, and time. We'll save a card on file —
            {promo ? (
              <> <strong className="text-foreground">${PRIVATE_PROMO_PRICE} is charged the day of each lesson</strong> (normally ${PRIVATE_REGULAR_PRICE}),
              so you only pay for what you book.</>
            ) : (
              <> <strong className="text-foreground"> ${PRIVATE_REGULAR_PRICE} is charged the day of each lesson</strong>,
              so you only pay for what you book.</>
            )}
          </p>
        </div>
      </section>


      <div className="container py-8 pb-16 max-w-3xl">
        <div className="border border-border rounded-xl p-4 sm:p-6 bg-card">
          <PrivateBookingFlow />
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Looking for group classes?{" "}
          <Link to="/swim-enrollment" className="text-primary font-medium underline">
            See all enrollment options
          </Link>
        </p>
      </div>
    </main>
  );
};

export default BookPrivateLesson;
