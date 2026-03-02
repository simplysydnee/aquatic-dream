import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, ChevronRight, Filter, ExternalLink } from "lucide-react";

const BOOKING_URL = "https://book.peek.com/s/bf926f86-9ac3-4030-a4b4-79a60c2a2d78/K1qNg";

type Course = { name: string; desc: string; prereqs: string; duration: string };

const courseGroups: { title: string; courses: Course[] }[] = [
  {
    title: "Get Introduced",
    courses: [
      { name: "Discover Scuba", desc: "Try diving in a pool — no certification required.", prereqs: "None", duration: "1 day" },
      { name: "Skin Diver & Snorkeling", desc: "Master surface diving and snorkeling skills.", prereqs: "None", duration: "1 day" },
    ],
  },
  {
    title: "Get Certified",
    courses: [
      { name: "Open Water Diver", desc: "Your entry-level scuba certification — dive to 60ft worldwide.", prereqs: "Age 10+", duration: "4–5 days" },
      { name: "Private Open Water", desc: "One-on-one Open Water certification at your pace.", prereqs: "Age 10+", duration: "Flexible" },
      { name: "Travel Referral Open Water", desc: "Start here, finish in paradise.", prereqs: "Age 10+", duration: "2 days + travel" },
      { name: "Private Travel Referral OW", desc: "Private referral course with personalized schedule.", prereqs: "Age 10+", duration: "Flexible" },
    ],
  },
  {
    title: "Improve Your Skills",
    courses: [
      { name: "PADI ReActivate", desc: "Refresh your skills after 6+ months out of the water.", prereqs: "OW Certified", duration: "1 day" },
      { name: "Advanced Open Water Diver", desc: "5 adventure dives including deep and navigation.", prereqs: "OW Certified", duration: "2 days" },
      { name: "Master Scuba Diver", desc: "The highest non-professional rating in recreational diving.", prereqs: "AOW + Rescue + 5 Specialties", duration: "Varies" },
    ],
  },
  {
    title: "Be a Safer Diver",
    courses: [
      { name: "Rescue Diver", desc: "Learn to manage emergencies and help other divers.", prereqs: "AOW Certified", duration: "3 days" },
      { name: "Emergency First Response", desc: "CPR, first aid, and AED training for anyone.", prereqs: "None", duration: "1 day" },
      { name: "Emergency Oxygen Provider", desc: "Administer emergency oxygen to injured divers.", prereqs: "None", duration: "Half day" },
    ],
  },
];

const specialties = [
  "Altitude Diver", "AWARE Fish ID", "Boat Diver", "Coral Reef Conservation",
  "Deep Diver", "Digital Underwater Photographer", "PADI Distinctive Specialties",
  "Drift Diver", "Dry Suit Diver", "Enriched Air Diver", "Equipment Specialist",
  "Night Diver", "Peak Performance Buoyancy", "Search & Recovery Diver",
  "Sidemount Diver", "Underwater Naturalist", "Underwater Navigator", "Wreck Diver",
];

const proTrack = [
  { name: "PADI Divemaster", desc: "Your first professional-level certification.", prereqs: "Rescue Diver + 40 dives" },
  { name: "PADI Assistant Instructor", desc: "Assist with teaching PADI courses.", prereqs: "Divemaster" },
  { name: "PADI OWSI", desc: "Open Water Scuba Instructor — teach the world to dive.", prereqs: "AI + IDC" },
  { name: "Specialty Instructor", desc: "Teach specialty courses in your areas of expertise.", prereqs: "OWSI" },
  { name: "PADI MSDT", desc: "Master Scuba Diver Trainer — 5+ Specialty Instructor ratings.", prereqs: "OWSI + 5 SI ratings" },
  { name: "Master Instructor", desc: "The pinnacle of PADI education.", prereqs: "MSDT + experience" },
  { name: "IDC Staff Instructor", desc: "Assist with Instructor Development Courses.", prereqs: "MI + experience" },
  { name: "CPR & EFR Instructor", desc: "Teach life-saving CPR and first response skills.", prereqs: "EFR certification" },
];

const Scuba = () => {
  const [specialtyFilter, setSpecialtyFilter] = useState("");

  const filteredSpecialties = specialties.filter((s) =>
    s.toLowerCase().includes(specialtyFilter.toLowerCase())
  );

  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-br from-secondary/95 to-secondary text-secondary-foreground py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Award className="w-8 h-8 text-primary" />
              <span className="text-primary font-bold text-sm tracking-wider uppercase">PADI 5★ IDC Center</span>
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
              Your Underwater<br />
              <span className="text-primary">Journey Starts Here</span>
            </h1>
            <p className="text-lg text-secondary-foreground/70 leading-relaxed mb-8 max-w-xl">
              From your first breath underwater to teaching others — Aquatic Dreams offers the complete 
              PADI certification pathway, 18 specialties, and world-class dive travel.
            </p>
            <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8 py-6 text-base">
              <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Book a Course <ExternalLink className="ml-2 w-4 h-4" />
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Course groups */}
      {courseGroups.map((group, gi) => (
        <section key={group.title} className={`py-16 ${gi % 2 === 0 ? "" : "bg-card"}`}>
          <div className="container">
            <h2 className="font-display text-3xl font-bold text-foreground mb-8">{group.title}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {group.courses.map((course) => (
                <Card key={course.name} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-2">{course.name}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{course.desc}</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Badge variant="secondary" className="text-xs">Prereqs: {course.prereqs}</Badge>
                      <Badge variant="outline" className="text-xs">{course.duration}</Badge>
                    </div>
                    <Button asChild size="sm" className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-lg">
                      <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                        Book This Course <ChevronRight className="ml-1 w-3 h-3" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Specialties */}
      <section className="py-16">
        <div className="container">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <h2 className="font-display text-3xl font-bold text-foreground">18 Specialties</h2>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter specialties..."
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="pl-10 pr-4 py-2 border rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredSpecialties.map((s) => (
              <Card key={s} className="hover:border-primary/40 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-foreground">{s}</p>
                  <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-1 inline-block">
                    Book →
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pro Track */}
      <section className="bg-secondary text-secondary-foreground py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold mb-3">Professional / Pro Track</h2>
          <p className="text-secondary-foreground/60 mb-10 max-w-xl">Go from recreational diver to PADI professional. Here's the pathway.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {proTrack.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="bg-secondary-foreground/5 border-secondary-foreground/10">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {i + 1}
                      </span>
                      <div>
                        <h3 className="font-display text-lg font-bold">{p.name}</h3>
                        <p className="text-sm text-secondary-foreground/60 mb-1">{p.desc}</p>
                        <p className="text-xs text-primary">Prereqs: {p.prereqs}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What Can I Teach */}
      <section className="py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">What Can I Teach?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl">Each professional certification unlocks additional courses you can teach.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-semibold text-foreground">Certification</th>
                  <th className="text-left py-3 font-semibold text-foreground">Courses You Can Teach</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b"><td className="py-3 pr-4 font-medium text-foreground">Divemaster</td><td>Assist with all courses, lead certified divers</td></tr>
                <tr className="border-b"><td className="py-3 pr-4 font-medium text-foreground">OWSI</td><td>Discover Scuba, Skin Diver, Open Water, ReActivate</td></tr>
                <tr className="border-b"><td className="py-3 pr-4 font-medium text-foreground">Specialty Instructor</td><td>Your rated specialties</td></tr>
                <tr className="border-b"><td className="py-3 pr-4 font-medium text-foreground">MSDT</td><td>All of the above + 5+ specialties</td></tr>
                <tr className="border-b"><td className="py-3 pr-4 font-medium text-foreground">IDC Staff Instructor</td><td>Assist with IDC, AI courses, all above</td></tr>
                <tr><td className="py-3 pr-4 font-medium text-foreground">Course Director</td><td>Everything — including IDC and IE prep</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Scuba;
