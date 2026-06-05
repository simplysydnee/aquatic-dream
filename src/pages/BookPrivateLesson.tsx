import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import PrivateBookingFlow from "@/components/private-lessons/PrivateBookingFlow";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { JUNE_PROMO_ACTIVE_FOR_TODAY } from "@/lib/privateLessonPricing";

const BookPrivateLesson = () => {
  const promo = JUNE_PROMO_ACTIVE_FOR_TODAY;
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title={promo
          ? "Book a Private Swim Lesson — $50 June Special | Aquatic Dreams"
          : "Book a Private Swim Lesson — Aquatic Dreams Modesto"}
        description={promo
          ? "June Special: $50 per 30-minute private swim lesson at Aquatic Dreams in Modesto. Pick your instructor, day, and time. Charged the day of each lesson."
          : "Book a private swim lesson at Aquatic Dreams in Modesto. Pick your instructor, day, and time. $65 per 30-minute lesson, charged the day of class."}
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
              <span className="text-coral">★ June Special</span>
              <span className="text-muted-foreground">·</span>
              <span><span className="line-through text-muted-foreground mr-1">$65</span><span>$50 per lesson</span></span>
            </div>
          )}
          <p className="text-muted-foreground max-w-2xl">
            Pick your instructor, day, and time. We'll save a card on file —
            {promo ? (
              <> <strong className="text-foreground">$50 is charged the day of each June lesson</strong> (normally $65),
              so you only pay for what you book.</>
            ) : (
              <> <strong className="text-foreground"> $65 is charged the day of each lesson</strong>,
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
          Looking for group classes or semi-private?{" "}
          <Link to="/swim-enrollment" className="text-primary font-medium underline">
            See all enrollment options
          </Link>
        </p>
      </div>
    </main>
  );
};

export default BookPrivateLesson;
