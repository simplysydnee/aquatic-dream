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
    color: "bg-purple-100 border-purple-300 text-purple-900",
    colorAccent: "text-purple-600",
    skills: ["Water comfort & safety basics", "Bubble blowing", "Assisted floating", "Water entry & exit"],
  },
  {
    name: "Reef Explorers",
    badge: badgeReefExplorers,
    ages: "Ages 4–8",
    level: "Early Intermediate",
    color: "bg-emerald-100 border-emerald-300 text-emerald-900",
    colorAccent: "text-emerald-600",
    skills: ["Independent floating", "Basic freestyle arm/kick", "Submersion confidence", "Back float introduction"],
  },
  {
    name: "Sharks",
    badge: badgeSharks,
    ages: "Ages 6–12",
    level: "Intermediate",
    color: "bg-blue-100 border-blue-300 text-blue-900",
    colorAccent: "text-blue-600",
    skills: ["Full freestyle lap", "Backstroke introduction", "Treading water 60 seconds", "Diving fundamentals"],
  },
  {
    name: "Sea Turtles",
    badge: badgeSeaTurtles,
    ages: "Ages 8–14",
    level: "Advanced",
    color: "bg-teal-100 border-teal-300 text-teal-900",
    colorAccent: "text-teal-600",
    skills: ["Breaststroke & butterfly", "Flip turns", "Multi-lap endurance", "Stroke refinement"],
  },
  {
    name: "Octopus Elite",
    badge: badgeOctopusElite,
    ages: "Ages 10+",
    level: "Elite",
    color: "bg-violet-100 border-violet-300 text-violet-900",
    colorAccent: "text-violet-600",
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {swimLevels.map((level, i) => (
              <motion.div
                key={level.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full border-2 hover:shadow-lg transition-all duration-300 ${level.color}`}>
                  <CardContent className="p-8">
                    <img src={level.badge} alt={`${level.name} badge`} className="w-16 h-16 mb-4" />
                    <h3 className="font-display text-2xl font-bold mb-1">{level.name}</h3>
                    <p className={`text-sm font-medium mb-1 ${level.colorAccent}`}>{level.ages}</p>
                    <p className="text-xs opacity-70 mb-4">{level.level}</p>
                    <ul className="space-y-2">
                      {level.skills.map((skill) => (
                        <li key={skill} className="flex items-start gap-2 text-sm">
                          <Star className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${level.colorAccent}`} />
                          {skill}
                        </li>
                      ))}
                    </ul>
                    {level.name === "Octopus Elite" && (
                      <div className="mt-6 p-3 rounded-lg bg-secondary/10 border border-secondary/20">
                        <p className="text-xs font-medium flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> Connects to PADI pathway
                        </p>
                      </div>
                    )}
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
                        className={`py-3 rounded-lg text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${level.color}`}
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
