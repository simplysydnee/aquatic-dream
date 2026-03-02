import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Users, Award, MapPin, Star, ChevronRight, Waves, Anchor, Heart, Plane } from "lucide-react";
import tripFiji from "@/assets/trip-fiji.jpg";
import tripSocorro from "@/assets/trip-socorro.jpg";
import tripMaldives from "@/assets/trip-maldives.jpg";

const HeroSection = () => (
  <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-secondary">
    {/* Animated wave background */}
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute bottom-0 left-0 right-0 h-40">
        <svg className="absolute bottom-0 w-[200%] animate-wave" viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,30 1440,60 L1440,120 L0,120 Z" fill="hsl(184 88% 36% / 0.15)" />
        </svg>
        <svg className="absolute bottom-0 w-[200%] animate-wave-slow" style={{ animationDelay: "-3s" }} viewBox="0 0 1440 120" preserveAspectRatio="none">
          <path d="M0,80 C240,20 480,100 720,60 C960,20 1200,100 1440,80 L1440,120 L0,120 Z" fill="hsl(184 88% 36% / 0.08)" />
        </svg>
      </div>
      {/* Bubbles */}
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
          className="text-primary font-medium mb-4 tracking-wider uppercase text-sm"
        >
          Modesto's Full Aquatic Campus
        </motion.p>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-secondary-foreground mb-6 leading-[0.9]">
          Swim.<br />
          <span className="text-primary">Dive.</span><br />
          Dream.
        </h1>
        <p className="text-lg md:text-xl text-secondary-foreground/70 mb-10 max-w-xl leading-relaxed">
          From your child's first splash to PADI certification and beyond — 
          the only place in Modesto where the whole family's aquatic journey begins.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg" className="bg-coral hover:bg-coral/90 text-coral-foreground text-base px-8 py-6 rounded-xl shadow-lg">
            <Link to="/swim-lessons">Enroll in Swim Lessons</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/60 text-white hover:bg-white/10 text-base px-8 py-6 rounded-xl">
            <Link to="/scuba">Start Your PADI Journey <ChevronRight className="ml-1 w-4 h-4" /></Link>
          </Button>
        </div>
      </motion.div>
    </div>
  </section>
);

const StatsSection = () => {
  const stats = [
    { icon: Users, value: "2–4", label: "Students per instructor", sub: "Industry-leading ratio" },
    { icon: Award, value: "PADI 5★", label: "IDC Center", sub: "Highest certification level" },
    { icon: Anchor, value: "OW → IDC", label: "Full certification path", sub: "Open Water to Instructor" },
    { icon: MapPin, value: "Modesto", label: "Local since day one", sub: "1212 Kansas Ave" },
  ];

  return (
    <section className="py-16 bg-card border-y">
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

const FeaturePanels = () => (
  <section className="py-20">
    <div className="container">
      <div className="text-center mb-14">
        <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">Two Worlds, One Campus</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          Whether your 3-year-old is taking their first swim or you're booking a dive trip to Fiji — it all starts here.
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        {/* Swim panel */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="group"
        >
          <Card className="overflow-hidden border-2 hover:border-primary/40 transition-all duration-300 h-full">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-12">
              <Waves className="w-12 h-12 text-primary mb-6" />
              <h3 className="font-display text-3xl font-bold text-foreground mb-4">Swim Lessons</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                5 progressive levels from Pearls (age 3) to Octopus Elite. Max 4 students per instructor — 
                because every child deserves to be seen in the water.
              </p>
              <ul className="space-y-2 mb-8 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Ages 3 to teen</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> 5 ocean-themed levels</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Private lessons available</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Pathway to PADI</li>
              </ul>
              <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">
                <Link to="/swim-lessons">Explore Swim Levels <ChevronRight className="ml-1 w-4 h-4" /></Link>
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Scuba panel */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="group"
        >
          <Card className="overflow-hidden border-2 hover:border-secondary/40 transition-all duration-300 h-full">
            <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 p-8 md:p-12">
              <Anchor className="w-12 h-12 text-secondary mb-6" />
              <h3 className="font-display text-3xl font-bold text-foreground mb-4">PADI Scuba</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                A PADI 5★ IDC Center offering everything from Discover Scuba to Instructor certification, 
                plus 18 specialties and world-class dive travel.
              </p>
              <ul className="space-y-2 mb-8 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Open Water to Instructor</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> 18 Specialty courses</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> Group dive trips</li>
                <li className="flex items-center gap-2"><Star className="w-4 h-4 text-primary" /> PADI 5★ IDC Center</li>
              </ul>
              <Button asChild variant="outline" className="border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground rounded-xl">
                <Link to="/scuba">View PADI Courses <ChevronRight className="ml-1 w-4 h-4" /></Link>
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  </section>
);

const testimonials = [
  {
    name: "Sarah M.",
    role: "Swim Parent",
    text: "My daughter started in Pearls at age 4 and now at 8 she's a confident Sea Turtle. The small class sizes make all the difference — her instructor knows her by name and exactly where she is in her progress.",
  },
  {
    name: "Carlos R.",
    role: "PADI Divemaster",
    text: "I went from Open Water to Divemaster right here at Aquatic Dreams. The instructors aren't just teachers, they're mentors. This place changed my life.",
  },
  {
    name: "The Nguyen Family",
    role: "Multi-program Family",
    text: "Our kids swim here and my husband and I just got our Advanced Open Water. We love that the whole family can have their own aquatic journey at one place.",
  },
  {
    name: "Lisa P.",
    role: "Adult Swim Student",
    text: "I was terrified of water at 35. The patience and expertise of the instructors here helped me overcome a lifelong fear. I'm now considering Discover Scuba!",
  },
];

const TestimonialsSection = () => (
  <section className="py-20 bg-card">
    <div className="container">
      <div className="text-center mb-12">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">What Our Community Says</h2>
        <p className="text-muted-foreground">Real stories from real swimmers and divers.</p>
      </div>
      <Carousel opts={{ align: "start", loop: true }} className="max-w-5xl mx-auto">
        <CarouselContent>
          {testimonials.map((t, i) => (
            <CarouselItem key={i} className="md:basis-1/2">
              <Card className="h-full">
                <CardContent className="p-8">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-coral text-coral" />
                    ))}
                  </div>
                  <p className="text-foreground/80 mb-6 leading-relaxed italic">"{t.text}"</p>
                  <div>
                    <p className="font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="-left-4 md:-left-12" />
        <CarouselNext className="-right-4 md:-right-12" />
      </Carousel>
    </div>
  </section>
);

const upcomingTrips = [
  { destination: "Fiji", dates: "April 2–11, 2026", emoji: "🇫🇯", image: tripFiji },
  { destination: "Socorro", dates: "June 7–16, 2026", emoji: "🇲🇽", image: tripSocorro },
  { destination: "Maldives", dates: "Coming Soon", emoji: "🇲🇻", image: tripMaldives },
];

const DiveTripsPreview = () => (
  <section className="py-20">
    <div className="container">
      <div className="text-center mb-12">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">Upcoming Dive Trips</h2>
        <p className="text-muted-foreground">Join us for world-class diving adventures.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {upcomingTrips.map((trip, i) => (
          <motion.div
            key={trip.destination}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
          >
            <Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
              <div className="relative h-48 overflow-hidden">
                <img
                  src={trip.image}
                  alt={`Diving in ${trip.destination}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-display text-2xl font-bold">{trip.emoji} {trip.destination}</h3>
                  <p className="text-white/80 text-sm">{trip.dates}</p>
                </div>
              </div>
              <CardContent className="p-6">
                <Button asChild variant="outline" className="w-full rounded-xl">
                  <Link to="/dive-trips">View Details <ChevronRight className="ml-1 w-4 h-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      <div className="text-center mt-8">
        <Button asChild variant="ghost" className="text-primary">
          <Link to="/dive-trips">See all trips →</Link>
        </Button>
      </div>
    </div>
  </section>
);

const ICanSwimCallout = () => (
  <section className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 py-12">
    <div className="container text-center">
      <Heart className="w-8 h-8 text-primary mx-auto mb-3" />
      <h3 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-3">
        Every Swimmer Deserves a Chance
      </h3>
      <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
        We're proud to partner with <strong>I Can Swim 209</strong>, an adaptive aquatic program 
        serving individuals with diverse needs — right here at our facility.
      </p>
      <a
        href="https://icanswim209.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
      >
        Learn about I Can Swim 209 →
      </a>
    </div>
  </section>
);

const Index = () => {
  return (
    <main>
      <HeroSection />
      <StatsSection />
      <FeaturePanels />
      <ICanSwimCallout />
      <TestimonialsSection />
      <DiveTripsPreview />
    </main>
  );
};

export default Index;
