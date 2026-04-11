import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Star, ChevronRight, DollarSign, Calendar, Clock, ShoppingBag } from "lucide-react";

const curriculum = [
  {
    group: "Bubble Makers",
    level: "Preschool 1",
    color: "White",
    diveStatus: "Beginner",
    ages: "Ages 3–5",
    gradient: "from-gray-50 to-gray-100/60",
    borderColor: "border-gray-300",
    accentColor: "text-gray-600",
    badgeBg: "bg-white",
    badgeRing: "ring-gray-300",
    letter: "BM",
    skills: [
      "Water comfort & safety introduction",
      "Guided submersion practice",
      "Supported floating",
      "Water entry & exit",
    ],
  },
  {
    group: "Reef Explorers",
    level: "Preschool 2",
    color: "Red",
    diveStatus: "Foundations",
    ages: "Ages 3–5",
    gradient: "from-red-50 to-red-100/60",
    borderColor: "border-red-200",
    accentColor: "text-red-600",
    badgeBg: "bg-red-50",
    badgeRing: "ring-red-300",
    letter: "RE",
    skills: [
      "Submersion for 5+ seconds",
      "Beginning independent floating",
      "Front & back float introduction",
      "Basic water safety skills",
    ],
  },
  {
    group: "Sea Scouts",
    level: "School Age 1",
    color: "White / Red",
    diveStatus: "Beginner",
    ages: "Ages 6–12",
    gradient: "from-sky-50 to-sky-100/60",
    borderColor: "border-sky-200",
    accentColor: "text-sky-600",
    badgeBg: "bg-sky-50",
    badgeRing: "ring-sky-300",
    letter: "SS",
    skills: [
      "Beginner water comfort & submersion",
      "Independent floating introduction",
      "Basic kick drills",
      "Water safety fundamentals",
    ],
  },
  {
    group: "Deep Sea Divers",
    level: "School Age 2",
    color: "Yellow",
    diveStatus: "Intermediate",
    ages: "Ages 6–12",
    gradient: "from-yellow-50 to-yellow-100/60",
    borderColor: "border-yellow-200",
    accentColor: "text-yellow-600",
    badgeBg: "bg-yellow-50",
    badgeRing: "ring-yellow-300",
    letter: "DD",
    skills: [
      "Independent front & back float",
      "Introduction to kicking drills",
      "Treading water introduction",
      "Basic stroke mechanics",
    ],
  },
  {
    group: "Ocean Masters",
    level: "School Age 3",
    color: "Green / Blue",
    diveStatus: "Advanced",
    ages: "Ages 6–12",
    gradient: "from-green-50 to-green-100/60",
    borderColor: "border-green-200",
    accentColor: "text-green-600",
    badgeBg: "bg-green-50",
    badgeRing: "ring-green-300",
    letter: "OM",
    skills: [
      "Treading water 10+ seconds",
      "Side-roll-side kick drill",
      "Multiple stroke development",
      "Endurance & swim completion",
    ],
  },
];

const preschoolSlots = [
  { time: "2:45 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "3:15 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "3:45 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "4:15 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "4:45 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "5:30 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "6:00 PM", groups: "Bubble Makers / Reef Explorers" },
  { time: "6:30 PM", groups: "Bubble Makers / Reef Explorers" },
];

const schoolAgeSlots = [
  { time: "3:00 PM", groups: "Blue & Yellow" },
  { time: "3:30 PM", groups: "Blue & Yellow" },
  { time: "4:00 PM", groups: "Blue & Yellow" },
  { time: "4:30 PM", groups: "Blue & Yellow" },
  { time: "5:00 PM", groups: "Blue & Yellow" },
  { time: "5:45 PM", groups: "Blue & Yellow" },
  { time: "6:15 PM", groups: "Yellow & Green" },
  { time: "6:45 PM", groups: "Yellow & Green" },
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
              Five progressive groups based on the Starfish Aquatics system,
              maximum 3 students per instructor — because every child deserves to be seen in the water.
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
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Lesson Duration</p>
              <p className="font-display text-5xl font-bold text-primary">30</p>
              <p className="text-sm text-secondary-foreground/70">minutes per lesson</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Group Lesson</p>
              <p className="font-display text-5xl font-bold text-primary">$30</p>
              <p className="text-sm text-secondary-foreground/70">per lesson</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Semi-Private</p>
              <p className="font-display text-5xl font-bold text-primary">$45</p>
              <p className="text-sm text-secondary-foreground/70">per lesson</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-secondary-foreground/60 uppercase tracking-wider mb-1">Private</p>
              <p className="font-display text-5xl font-bold text-primary">$65</p>
              <p className="text-sm text-secondary-foreground/70">per lesson</p>
            </div>
          </div>
          <div className="text-center mt-8 space-y-2">
            <p className="text-secondary-foreground/60 text-sm max-w-md mx-auto">
              Smaller classes mean more attention, faster progress, and a safer learning environment for every child.
            </p>
            <p className="text-secondary-foreground/70 text-sm flex items-center justify-center gap-1">
              <ShoppingBag className="w-4 h-4" />
              $45 registration fee — includes swim bag, swim cap & goggles
            </p>
          </div>
        </div>
      </section>

      {/* Curriculum */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">Our Curriculum</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From Bubble Makers to Ocean Masters — each group builds on the last, following the Starfish Aquatics curriculum.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {curriculum.map((item, i) => (
              <motion.div
                key={item.group}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full border ${item.borderColor} bg-gradient-to-br ${item.gradient} hover:shadow-xl transition-all duration-300 overflow-hidden`}>
                  <CardContent className="p-0">
                    <div className="flex flex-col items-center pt-8 pb-4 px-6">
                      <div className={`w-24 h-24 rounded-full ${item.badgeBg} ring-4 ${item.badgeRing} shadow-lg mb-4 flex items-center justify-center`}>
                        <span className={`font-display text-2xl font-bold ${item.accentColor}`}>
                          {item.letter}
                        </span>
                      </div>
                      <h3 className="font-display text-2xl font-bold text-foreground">{item.group}</h3>
                      <div className="flex items-center gap-2 mt-1 mb-0.5">
                        <span className={`text-sm font-semibold ${item.accentColor}`}>{item.ages}</span>
                        <span className="text-muted-foreground/40">•</span>
                        <span className="text-xs text-muted-foreground font-medium">{item.color}</span>
                      </div>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${item.accentColor}`}>
                        🤿 {item.diveStatus}
                      </span>
                    </div>
                    <div className="px-6 pb-6">
                      <div className="border-t border-foreground/10 pt-4">
                        <ul className="space-y-2.5">
                          {item.skills.map((skill) => (
                            <li key={skill} className="flex items-start gap-2.5 text-sm text-foreground/80">
                              <Star className={`w-4 h-4 mt-0.5 shrink-0 fill-current ${item.accentColor}`} />
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Private / Semi-Private CTA */}
      <section className="bg-secondary text-secondary-foreground py-16">
        <div className="container text-center">
          <h2 className="font-display text-3xl font-bold mb-4">Private & Semi-Private Lessons</h2>
          <p className="text-secondary-foreground/70 max-w-xl mx-auto mb-4">
            Want one-on-one or small group attention? Request a private ($65/lesson)
            or semi-private ($45/lesson) lesson tailored to your child's needs.
          </p>
          <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl">
            <Link to="/swim-enrollment?type=request">Request a Lesson <ChevronRight className="ml-1 w-4 h-4" /></Link>
          </Button>
        </div>
      </section>

      {/* Schedule */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">Summer Schedule</h2>
            <p className="text-muted-foreground">Monday & Wednesday · 30 minute lessons · Max 3 students per class</p>
            <p className="text-xs text-muted-foreground mt-1">Preschool and school-age times staggered to ease parking</p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-display text-xl font-bold text-foreground">Session 1</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">June 6 – June 29 · 8 lessons</p>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preschool (Ages 3–5)</h4>
              {preschoolSlots.map((slot) => (
                <div key={slot.time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 mb-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{slot.time}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{slot.groups}</span>
                </div>
              ))}
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4">School-Age (Ages 6–12)</h4>
              {schoolAgeSlots.map((slot) => (
                <div key={slot.time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 mb-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{slot.time}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{slot.groups}</span>
                </div>
              ))}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-primary" />
                <h3 className="font-display text-xl font-bold text-foreground">Session 2</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">July 13 – August 5 · 8 lessons</p>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preschool (Ages 3–5)</h4>
              {preschoolSlots.map((slot) => (
                <div key={slot.time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 mb-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{slot.time}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{slot.groups}</span>
                </div>
              ))}
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 mt-4">School-Age (Ages 6–12)</h4>
              {schoolAgeSlots.map((slot) => (
                <div key={slot.time} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 mb-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{slot.time}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{slot.groups}</span>
                </div>
              ))}
            </Card>
          </div>

          <div className="text-center mt-8">
            <p className="text-muted-foreground text-sm mb-2">
              <Users className="w-4 h-4 inline mr-1" /> Every class has a maximum of 3 students per instructor.
            </p>
            <p className="text-muted-foreground text-sm flex items-center justify-center gap-1">
              <DollarSign className="w-4 h-4" /> $30/lesson (group) · $45 (semi-private) · $65 (private)
            </p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SwimLessons;
