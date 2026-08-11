import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { markWelcomeBackSeen, resolveJoinSrc } from "@/lib/joinSrc";

const HEADLINES: Record<string, string> = {
  summer2026: "Thank you for swimming with us this summer",
  fall2026: "Fall lessons are here at Aquatic Dreams",
};
const DEFAULT_HEADLINE = "Welcome back to Aquatic Dreams";

const POINTS = [
  {
    title: "This is a Swimbership",
    body: "A monthly membership, not a one time session payment like before.",
  },
  {
    title: "It renews each month",
    body: "Your membership continues automatically until you cancel. Cancel anytime with 30 days notice.",
  },
  {
    title: "Your spot is yours every week",
    body: "The same time is held for your swimmer week after week. No re signing up each session.",
  },
  {
    title: "Your waiver carries over",
    body: "If you already have a waiver on file with us, it still counts. Nothing to redo.",
  },
];

const WelcomeBack = () => {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Welcome back to Aquatic Dreams";
    markWelcomeBackSeen();
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Swim. Dive. Dream.
          </p>
          <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
            Thank you for swimming with us this summer
          </h1>
          <p className="text-base text-muted-foreground">
            We are continuing into fall a little differently. Here is what changed, in plain terms.
          </p>
        </header>

        <Card className="divide-y divide-border p-0">
          {POINTS.map((point) => (
            <div key={point.title} className="space-y-1 p-5">
              <h2 className="text-base font-semibold text-foreground">{point.title}</h2>
              <p className="text-sm text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </Card>

        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => navigate(`/join?src=${WELCOME_BACK_SRC}`)}
          >
            Choose your program
          </Button>
          <p className="text-sm text-muted-foreground">
            You will pick your program and time on the next step.
          </p>
        </div>
      </div>
    </main>
  );
};

export default WelcomeBack;
