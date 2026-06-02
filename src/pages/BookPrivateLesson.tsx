import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import PrivateBookingFlow from "@/components/private-lessons/PrivateBookingFlow";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";

const BookPrivateLesson = () => {
  return (
    <main className="min-h-screen bg-background">
      <SEO
        title="Book a Private Swim Lesson — Aquatic Dreams Modesto"
        description="Book a private swim lesson at Aquatic Dreams in Modesto. Pick your instructor, day, and time. $65 per 30-minute lesson, charged the day of class."
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
          <p className="text-muted-foreground max-w-2xl">
            Pick your instructor, day, and time. We'll save a card on file —
            <strong className="text-foreground"> $65 is charged the day of each lesson</strong>,
            so you only pay for what you book.
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
