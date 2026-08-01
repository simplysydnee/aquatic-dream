import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import StarfishCurriculumBadge from "@/components/StarfishCurriculumBadge";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Users, Award, MapPin, Star, ChevronRight, Waves } from "lucide-react";
import iCanSwimLogo from "@/assets/i-can-swim-logo.jpg";
import { SEASON_START_LABEL, isSeasonStarted } from "@/lib/season";
import { JOIN_OPEN } from "@/lib/joinGate";

type PlanKey = "private" | "kid_group" | "adult_group";

// Source of truth is the membership_plans table; these are fallbacks only,
// used if the query has not resolved yet or fails.
const FALLBACK_PRICES: Record<PlanKey, number> = {
  private: 20000,
  kid_group: 14000,
  adult_group: 14000,
};

const PROGRAMS: { key: PlanKey; name: string; blurb: string; when: string }[] = [
  { key: "private", name: "Private Swim", blurb: "One-on-one · Ages 3+", when: "Tue–Thu evenings, Saturdays" },
  { key: "kid_group", name: "Small Group", blurb: "Max 3 swimmers · 5 levels", when: "Monday afternoons" },
  { key: "adult_group", name: "Adult Swim", blurb: "Never too late to learn", when: "Tuesday evenings" },
];

const usePlanPrices = () => {
  const { data } = useQuery({
    queryKey: ["membership-plan-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membership_plans")
        .select("plan_key, monthly_price_cents")
        .eq("active", true);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.plan_key] = row.monthly_price_cents;
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
  return (key: PlanKey) => Math.round((data?.[key] ?? FALLBACK_PRICES[key]) / 100);
};

const HeroSection = () => (
  <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-secondary">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute bottom-0 left-0 right-0 h-40">
        <svg className="absolute bottom-0 w-[200%] animate-wave" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,30 1440,60 L1440,120 L0,120 Z" fill="hsl(184 88% 36% / 0.15)" />
        </svg>
        <svg className="absolute bottom-0 w-[200%] animate-wave-slow" style={{ animationDelay: "-3s" }} viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0,80 C240,20 480,100 720,60 C960,20 1200,100 1440,80 L1440,120 L0,120 Z" fill="hsl(184 88% 36% / 0.08)" />
        </svg>
      </div>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-primary/10"
          style={{
            width: `${12 + i * 8}px`,
            height: `${12 + i * 8}px`,
            left: `${15 + i * 15}%`,
            bottom: `-20px`,
            animation: `bubble-rise ${8 + i * 2}s ease-in infinite`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}
    </div>

    <div className="container relative z-10 py-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-3xl"
      >
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6"
        >
          Now enrolling · Starts {SEASON_START_LABEL}
        </motion.p>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-secondary-foreground mb-6 leading-[0.9]">
          Your spot.<br />
          Every week.<br />
          <span className="text-coral">All year.</span>
        </h1>
        <div className="space-y-3 mb-8 max-w-xl">
          <p className="text-lg md:text-xl text-secondary-foreground/70 leading-relaxed">
            Introducing the Swimbership: one weekly lesson, the same time and the same coach, billed monthly.
          </p>
          <p className="text-lg md:text-xl text-secondary-foreground/70 leading-relaxed">
            No more re-registering every session. No more losing your spot.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          {JOIN_OPEN && (
            <Button asChild size="lg" className="bg-coral hover:bg-coral/90 text-coral-foreground text-base px-10 py-6 rounded-xl shadow-lg">
              <Link to="/join">Join</Link>
            </Button>
          )}
          <Link to="/swim-lessons" className="text-secondary-foreground/80 font-medium underline underline-offset-4 hover:text-primary">
            See times &amp; pricing
          </Link>
        </div>
        <p className="text-sm text-secondary-foreground/50 mt-6">
          Max 3 swimmers per instructor · Spots are limited
        </p>
      </motion.div>
    </div>
  </section>
);

const ProgramCards = () => {
  const price = usePlanPrices();
  return (
    <section className="py-16 bg-card border-y">
      <div className="container">
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {PROGRAMS.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Link to={JOIN_OPEN ? "/join" : "/swim-lessons"} className="block h-full">
                <Card className="h-full p-8 border-2 hover:border-primary/40 transition-all duration-300">
                  <h2 className="font-display text-2xl font-bold text-foreground mb-1">{p.name}</h2>
                  <p className="text-sm text-muted-foreground mb-6">{p.blurb}</p>
                  <p className="font-display text-3xl font-bold text-foreground">
                    ${price(p.key)}
                    <span className="text-base font-semibold text-muted-foreground">/mo</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">{p.when}</p>
                  <span className="inline-flex items-center gap-1 text-primary font-semibold mt-6">
                    {JOIN_OPEN ? "Join" : "See times"} <ChevronRight className="w-4 h-4" />
                  </span>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const StatsSection = () => {
  const stats = [
    { icon: Users, value: "3 max", label: "Swimmers per instructor", sub: "Industry-leading ratio" },
    { icon: Award, value: "5", label: "Progressive levels", sub: "Starfish Aquatics system" },
    { icon: Waves, value: "Weekly", label: "Same time, same coach", sub: "Your spot is held" },
    { icon: MapPin, value: "Modesto", label: "Local since day one", sub: "1212 Kansas Ave" },
  ];

  return (
    <section className="py-16">
      <div className="container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <stat.icon className="w-8 h-8 text-primary mx-auto mb-3" />
              <p className="font-display text-3xl md:text-4xl font-bold text-foreground">{stat.value}</p>
              <p className="font-semibold text-sm text-foreground mt-1">{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const SwimProgramPanel = () => (
  <section className="pb-20">
    <div className="container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <Card className="overflow-hidden border-2">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-12">
            <Waves className="w-12 h-12 text-primary mb-6" />
            <h2 className="font-display text-3xl font-bold text-foreground mb-4">How our swim program works</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed max-w-2xl">
              5 color-coded levels based on the Starfish Aquatics curriculum, with a maximum of 3 swimmers per
              instructor. Kids and adults both have a weekly place in the water.
            </p>
            <ul className="space-y-2 mb-8 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Preschool and school-age tracks, plus adults</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> One lesson every week at the same time</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> The same coach week to week</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Billed monthly, cancel with notice</li>
            </ul>
            <StarfishCurriculumBadge variant="inline" className="mb-8 p-4 rounded-xl bg-background/60 border border-border" />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/swim-lessons">View all levels</Link>
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  </section>
);

const PrivateLessonsNote = () => {
  if (isSeasonStarted()) return null;
  return (
    <section className="py-10 border-t">
      <div className="container">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Prefer a one-off lesson first? Private lessons are still bookable through August 16.{" "}
          <Link to="/book-private-lesson" className="text-primary font-medium underline">
            Book a private lesson
          </Link>
        </p>
      </div>
    </section>
  );
};

const ICanSwimCallout = () => (
  <section className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 py-12">
    <div className="container text-center">
      <p className="text-sm text-primary font-medium mb-4 tracking-wider uppercase">Proud Partner</p>
      <img src={iCanSwimLogo} alt="I Can Swim 209" className="w-32 h-32 mx-auto mb-4 rounded-full object-cover" />
      <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
        I Can Swim 209 is a specialized aquatic program serving individuals with a wide range of needs —
        right here at our facility. We're proud to support their mission.
      </p>
      <a
        href="https://icanswim209.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
      >
        Learn more at icanswim209.com →
      </a>
    </div>
  </section>
);

const Index = () => {
  return (
    <main>
      <SEO
        title="Aquatic Dreams Swim — Weekly Swim Lessons in Modesto"
        description="Swimberships in Modesto: one weekly lesson at the same time with the same coach, billed monthly. Private, small group, and adult swim, max 3 swimmers per instructor."
        path="/"
      />
      <HeroSection />
      <ProgramCards />
      <StatsSection />
      <SwimProgramPanel />
      <PrivateLessonsNote />
      <ICanSwimCallout />
    </main>
  );
};

export default Index;
