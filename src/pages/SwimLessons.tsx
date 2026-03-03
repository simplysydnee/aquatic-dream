import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Star, ChevronRight, ArrowRight } from "lucide-react";
import badgePearls from "@/assets/badge-pearls.png";
import badgeReefExplorers from "@/assets/badge-reef-explorers.png";
import badgeSharks from "@/assets/badge-sharks.png";
import badgeSeaTurtles from "@/assets/badge-sea-turtles.png";
import badgeOctopusElite from "@/assets/badge-octopus-elite.png";

const swimLevels = [
  {
    name: "Pearls",
    badge: badgePearls,
    ages: "Ages 3–6",
    level: "Beginner",
    gradient: "from-purple-50 to-purple-100/60",
    borderColor: "border-purple-200",
    accentColor: "text-purple-600",
    badgeBg: "bg-purple-50",
    skills: ["Water comfort & safety basics", "Bubble blowing", "Assisted floating", "Water entry & exit"],
  },
  {
    name: "Reef Explorers",
    badge: badgeReefExplorers,
    ages: "Ages 4–8",
    level: "Early Intermediate",
    gradient: "from-emerald-50 to-emerald-100/60",
    borderColor: "border-emerald-200",
    accentColor: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    skills: ["Independent floating", "Basic freestyle arm/kick", "Submersion confidence", "Back float introduction"],
  },
  {
    name: "Sharks",
    badge: badgeSharks,
    ages: "Ages 6–12",
    level: "Intermediate",
    gradient: "from-blue-50 to-blue-100/60",
    borderColor: "border-blue-200",
    accentColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    skills: ["Full freestyle lap", "Backstroke introduction", "Treading water 60 seconds", "Diving fundamentals"],
  },
  {
    name: "Sea Turtles",
    badge: badgeSeaTurtles,
    ages: "Ages 8–14",
    level: "Advanced",
    gradient: "from-teal-50 to-teal-100/60",
    borderColor: "border-teal-200",
    accentColor: "text-teal-600",
    badgeBg: "bg-teal-50",
    skills: ["Breaststroke & butterfly", "Flip turns", "Multi-lap endurance", "Stroke refinement"],
  },
  {
    name: "Octopus Elite",
    badge: badgeOctopusElite,
    ages: "Ages 10+",
    level: "Elite",
    gradient: "from-violet-50 to-violet-100/60",
    borderColor: "border-violet-200",
    accentColor: "text-violet-600",
    badgeBg: "bg-violet-50",
    skills: ["All 4 strokes competitive-ready", "Race strategy", "Swim team preparation", "PADI intro pathway available"],
  },
];

const SwimLessons = () => {
  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <p className="text-primary font-medium tracking-wider uppercase text-sm mb-3">Swim Lessons</p>
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Where Every Swimmer<br />
              <span className="text-primary">Thrives</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Five progressive ocean-themed levels, maximum 4 students per instructor, 
              and a pathway that can take your child all the way to PADI certification.
            </p>
            <Button className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              Find Your Level
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Industry comparison callout */}
      <section className="bg-secondary text-secondary-foreground py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Most Programs</p>
              <p className="font-display text-5xl font-bold text-secondary-foreground/40">8–10</p>
              <p className="text-sm text-secondary-foreground/50">kids per instructor</p>
            </div>
            <div className="text-4xl">→</div>
            <div className="text-center">
              <p className="text-sm text-primary uppercase tracking-wider mb-1">Aquatic Dreams</p>
              <p className="font-display text-5xl font-bold text-primary">Max 4</p>
              <p className="text-sm text-secondary-foreground/70">students per instructor. Always.</p>
            </div>
          </div>
          <p className="text-center mt-8 text-secondary-foreground/60 text-sm max-w-md mx-auto">
            Smaller classes mean more attention, faster progress, and a safer learning environment for every child.
          </p>
        </div>
      </section>

      {/* Swim levels */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">5 Progressive Levels</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From water comfort to competitive readiness — each level builds on the last.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {swimLevels.map((level, i) => (
              <motion.div
                key={level.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full border ${level.borderColor} bg-gradient-to-br ${level.gradient} hover:shadow-xl transition-all duration-300 overflow-hidden`}>
                  <CardContent className="p-0">
                    <div className="flex flex-col items-center pt-8 pb-4 px-6">
                      <div className={`w-28 h-28 rounded-full ${level.badgeBg} p-2 shadow-md mb-4 flex items-center justify-center`}>
                        <img src={level.badge} alt={`${level.name} badge`} className="w-full h-full object-contain rounded-full" />
                      </div>
                      <h3 className="font-display text-2xl font-bold text-foreground">{level.name}</h3>
                      <div className="flex items-center gap-2 mt-1 mb-1">
                        <span className={`text-sm font-semibold ${level.accentColor}`}>{level.ages}</span>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{level.level}</span>
                      </div>
                    </div>
                    <div className="px-6 pb-6">
                      <div className="border-t border-foreground/10 pt-4">
                        <ul className="space-y-2.5">
                          {level.skills.map((skill) => (
                            <li key={skill} className="flex items-start gap-2.5 text-sm text-foreground/80">
                              <Star className={`w-4 h-4 mt-0.5 shrink-0 fill-current ${level.accentColor}`} />
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {level.name === "Octopus Elite" && (
                        <div className="mt-5 p-3 rounded-lg bg-secondary/10 border border-secondary/20">
                          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground/80">
                            <ArrowRight className="w-3.5 h-3.5" /> Connects to PADI pathway
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PADI bridge */}
      <section className="bg-secondary text-secondary-foreground py-16">
        <div className="container text-center">
          <h2 className="font-display text-3xl font-bold mb-4">From Pool to Ocean</h2>
          <p className="text-secondary-foreground/70 max-w-xl mx-auto mb-8">
            Octopus Elite swimmers can seamlessly transition into PADI Discover Scuba and beyond. 
            The skills they've built in the pool are the foundation for a lifetime of underwater adventures.
          </p>
          <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl">
            <Link to="/scuba">Explore PADI Courses <ChevronRight className="ml-1 w-4 h-4" /></Link>
          </Button>
        </div>
      </section>

      {/* Schedule placeholder */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Weekly Schedule</h2>
            <p className="text-muted-foreground">Color-coded by level. Spots are limited — max 4 per class.</p>
          </div>
          <Card className="p-8">
            <div className="grid grid-cols-6 gap-2 text-center text-sm">
              <div className="font-semibold text-muted-foreground">Time</div>
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                <div key={day} className="font-semibold text-foreground">{day}</div>
              ))}
              {["9:00 AM", "10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM", "4:00 PM"].map((time, ti) => (
                <>
                  <div key={time} className="py-3 text-muted-foreground text-xs">{time}</div>
                  {[0, 1, 2, 3, 4].map((di) => {
                    const levelIdx = (ti + di) % 5;
                    const level = swimLevels[levelIdx];
                    const spots = 4 - ((ti + di) % 3);
                    return (
                      <div
                        key={`${time}-${di}`}
                        className={`py-3 rounded-lg text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity bg-gradient-to-br ${level.gradient} ${level.borderColor} border`}
                      >
                        <p className="font-semibold">{level.name}</p>
                        <p className="opacity-70">{spots} spots left</p>
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </Card>
          <p className="text-center mt-6 text-muted-foreground text-sm">
            <Users className="w-4 h-4 inline mr-1" /> Every class has a maximum of 4 students per instructor.
          </p>
        </div>
      </section>
    </main>
  );
};

export default SwimLessons;
