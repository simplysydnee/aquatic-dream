import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import StarfishCurriculumBadge from "@/components/StarfishCurriculumBadge";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Users, Award, MapPin, Star, ChevronRight, Waves, Heart } from "lucide-react";
import iCanSwimLogo from "@/assets/i-can-swim-logo.jpg";

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
          className="text-primary font-medium mb-4 tracking-wider uppercase text-sm"
        >
          Modesto's Swim Lesson Destination
        </motion.p>
        <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold text-secondary-foreground mb-6 leading-[0.9]">
          Swim.<br />
          <span className="text-primary">Dive.</span><br />
          Dream.
        </h1>
        <p className="text-lg md:text-xl text-secondary-foreground/70 mb-10 max-w-xl leading-relaxed">
          From your child's first splash to confident, independent swimming —
          the only place in Modesto with max 3 students per instructor.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg" className="bg-coral hover:bg-coral/90 text-coral-foreground text-base px-8 py-6 rounded-xl shadow-lg">
            <Link to="/swim-enrollment">Enroll in Swim Lessons</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-primary text-primary hover:bg-primary/10 text-base px-8 py-6 rounded-xl">
            <Link to="/swim-lessons">View Levels & Pricing <ChevronRight className="ml-1 w-4 h-4" /></Link>
          </Button>
        </div>
      </motion.div>
    </div>
  </section>
);

const StatsSection = () => {
  const stats = [
    { icon: Users, value: "3 max", label: "Students per instructor", sub: "Industry-leading ratio" },
    { icon: Award, value: "5", label: "Progressive levels", sub: "Starfish Aquatics system" },
    { icon: Waves, value: "$30", label: "Group lessons", sub: "Semi-private & private too" },
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

const SwimProgramPanel = () => (
  <section className="py-20">
    <div className="container">
      <div className="text-center mb-14">
        <h2 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">Our Swim Program</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
          5 color-coded levels from water comfort to advanced strokes — every child gets the attention they deserve.
        </p>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <Card className="overflow-hidden border-2 hover:border-primary/40 transition-all duration-300">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-8 md:p-12">
            <Waves className="w-12 h-12 text-primary mb-6" />
            <h3 className="font-display text-3xl font-bold text-foreground mb-4">Swim Lessons</h3>
            <p className="text-muted-foreground mb-6 leading-relaxed max-w-2xl">
              5 color-coded levels based on the Starfish Aquatics curriculum. Max 3 students per instructor.
              Group, semi-private, and private lessons available for ages 3–12.
            </p>
            <ul className="space-y-2 mb-8 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Ages 3–12 · Preschool & School-Age tracks</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> $30 group · $45 semi-private · $65 private</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> $45 registration fee (swim bag, cap & goggles)</li>
              <li className="flex items-center gap-2"><Star className="w-4 h-4 text-coral" /> Monday & Wednesday summer sessions</li>
            </ul>
            <StarfishCurriculumBadge variant="inline" className="mb-8 p-4 rounded-xl bg-background/60 border border-border" />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">
                <Link to="/swim-enrollment">Enroll Now <ChevronRight className="ml-1 w-4 h-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/swim-lessons">View All Levels</Link>
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  </section>
);

const testimonials = [
  {
    name: "Sarah M.",
    role: "Swim Parent",
    text: "My daughter started in White at age 4 and is now a confident Yellow swimmer. The small class sizes make all the difference — her instructor knows her by name and exactly where she is in her progress.",
  },
  {
    name: "The Nguyen Family",
    role: "Multi-child Family",
    text: "Both our kids swim here — our 4-year-old in preschool and our 8-year-old in intermediate. We love that they each get the right level of attention.",
  },
  {
    name: "Lisa P.",
    role: "Swim Parent",
    text: "My son was terrified of water. The patience and expertise of the instructors here helped him overcome his fear. He's now loving his Red level classes!",
  },
  {
    name: "Carlos R.",
    role: "Swim Parent",
    text: "The registration kit with the swim bag, cap and goggles was a great touch. My daughter felt like a real swimmer from day one.",
  },
];

const TestimonialsSection = () => (
  <section className="py-20 bg-card">
    <div className="container">
      <div className="text-center mb-12">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">What Our Families Say</h2>
        <p className="text-muted-foreground">Real stories from real swim families.</p>
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
        title="Aquatic Dreams Swim — Modesto Swim Lessons Ages 3–12"
        description="Modesto's swim lesson destination. 5-level Starfish Aquatics curriculum for ages 3–12 with max 3 students per instructor. Group, semi-private & private lessons."
        path="/"
      />
      <HeroSection />
      <StatsSection />
      <SwimProgramPanel />
      <ICanSwimCallout />
      
    </main>
  );
};

export default Index;
