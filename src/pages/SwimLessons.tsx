import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Star, ChevronRight, ArrowRight, DollarSign, Calendar, Clock } from "lucide-react";

const swimLevels = [
  {
    name: "White",
    letter: "W",
    ages: "Ages 3–8",
    level: "Beginner",
    gradient: "from-gray-50 to-gray-100/60",
    borderColor: "border-gray-300",
    accentColor: "text-gray-600",
    badgeBg: "bg-white",
    badgeRing: "ring-gray-300",
    skills: [
      "Water comfort & safety introduction",
      "Guided submersion practice",
      "Supported floating",
      "Water entry & exit",
    ],
  },
  {
    name: "Red",
    letter: "R",
    ages: "Ages 3–8",
    level: "Beginner+",
    gradient: "from-red-50 to-red-100/60",
    borderColor: "border-red-200",
    accentColor: "text-red-600",
    badgeBg: "bg-red-50",
    badgeRing: "ring-red-300",
    skills: [
      "Submersion for 5+ seconds",
      "Beginning independent floating",
      "Front & back float introduction",
      "Basic water safety skills",
    ],
  },
  {
    name: "Yellow",
    letter: "Y",
    ages: "Ages 7+",
    level: "Intermediate",
    gradient: "from-yellow-50 to-yellow-100/60",
    borderColor: "border-yellow-200",
    accentColor: "text-yellow-600",
    badgeBg: "bg-yellow-50",
    badgeRing: "ring-yellow-300",
    skills: [
      "Independent front & back float",
      "Introduction to kicking drills",
      "Treading water introduction",
      "Basic stroke mechanics",
    ],
  },
  {
    name: "Blue",
    letter: "B",
    ages: "Ages 7+",
    level: "Intermediate+",
    gradient: "from-blue-50 to-blue-100/60",
    borderColor: "border-blue-200",
    accentColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeRing: "ring-blue-300",
    skills: [
      "Treading water 10+ seconds",
      "Developing freestyle & backstroke",
      "Side-roll-side kick introduction",
      "Deep water confidence",
    ],
  },
  {
    name: "Green",
    letter: "G",
    ages: "Ages 7+",
    level: "Advanced",
    gradient: "from-green-50 to-green-100/60",
    borderColor: "border-green-200",
    accentColor: "text-green-600",
    badgeBg: "bg-green-50",
    badgeRing: "ring-green-300",
    skills: [
      "Side-roll-side kick drill 10M",
      "Multiple stroke development",
      "Endurance building",
      "Learn to Swim completion pathway",
    ],
  },
  {
    name: "Stroke School",
    letter: "SS",
    ages: "Ages 7+",
    level: "Elite",
    gradient: "from-purple-50 to-purple-100/60",
    borderColor: "border-purple-200",
    accentColor: "text-purple-600",
    badgeBg: "bg-purple-50",
    badgeRing: "ring-purple-300",
    skills: [
      "Advanced stroke refinement",
      "All four competitive strokes",
      "Race readiness & strategy",
      "PADI intro pathway available",
    ],
    requiresCompletion: true,
  },
];

const timeSlots = ["2:45 PM", "3:15 PM", "3:45 PM", "4:15 PM", "4:45 PM", "5:30 PM", "6:00 PM", "6:30 PM"];

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
              Six progressive color-coded levels based on the Starfish Aquatics system, 
              maximum 3 students per instructor, and a pathway from water comfort to PADI certification.
            </p>
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              <Link to="/swim-enrollment">Find Your Level & Enroll</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Key stats */}
      <section className="bg-secondary text-secondary-foreground py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Max Class Size</p>
              <p className="font-display text-5xl font-bold text-primary">3</p>
              <p className="text-sm text-secondary-foreground/70">students per instructor</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Per Lesson</p>
              <p className="font-display text-5xl font-bold text-primary">$35</p>
              <p className="text-sm text-secondary-foreground/70">8 lessons per session</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Session Total</p>
              <p className="font-display text-5xl font-bold text-primary">$280</p>
              <p className="text-sm text-secondary-foreground/70">Mon & Wed schedule</p>
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
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">6 Progressive Levels</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From water comfort to competitive readiness — each level builds on the last, following the Starfish Aquatics curriculum.
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
                      <div className={`w-24 h-24 rounded-full ${level.badgeBg} ring-4 ${level.badgeRing} shadow-lg mb-4 flex items-center justify-center`}>
                        <span className={`font-display text-3xl font-bold ${level.accentColor}`}>
                          {level.letter}
                        </span>
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
                      {level.requiresCompletion && (
                        <div className="mt-5 p-3 rounded-lg bg-secondary/10 border border-secondary/20">
                          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground/80">
                            <ArrowRight className="w-3.5 h-3.5" /> Requires Green level completion · Connects to PADI pathway
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
            Stroke School swimmers can seamlessly transition into PADI Discover Scuba and beyond. 
            The skills they've built in the pool are the foundation for a lifetime of underwater adventures.
          </p>
          <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl">
            <Link to="/scuba">Explore PADI Courses <ChevronRight className="ml-1 w-4 h-4" /></Link>
          </Button>
        </div>
      </section>

      {/* Schedule */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Summer Schedule</h2>
            <p className="text-muted-foreground">Monday & Wednesday · Max 3 students per class</p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {/* Session 1 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-display text-xl font-bold text-foreground">Session 1</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">June 8 – July 1 · 8 lessons</p>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div key={time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{time}</span>
                    <span className="text-xs text-muted-foreground ml-auto">All levels</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Session 2 */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-display text-xl font-bold text-foreground">Session 2</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">July 13 – August 2 · 8 lessons</p>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div key={time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{time}</span>
                    <span className="text-xs text-muted-foreground ml-auto">All levels</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="text-center mt-8">
            <p className="text-muted-foreground text-sm mb-4">
              <Users className="w-4 h-4 inline mr-1" /> Every class has a maximum of 3 students per instructor.
            </p>
            <p className="text-muted-foreground text-sm flex items-center justify-center gap-1">
              <DollarSign className="w-4 h-4" /> $35 per lesson · $280 per 8-lesson session
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SwimLessons;
