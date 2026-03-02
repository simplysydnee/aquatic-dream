import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Star, ExternalLink, MapPin, BookOpen, Video } from "lucide-react";

const diveSites = [
  { name: "Breakwater – Monterey", depth: "10–50ft", type: "Shore", highlights: "Kelp forests, sea otters, nudibranchs" },
  { name: "Monastery Beach", depth: "20–100ft+", type: "Shore (advanced)", highlights: "Deep walls, surge, experienced divers only" },
  { name: "Point Lobos Reserve", depth: "20–80ft", type: "Shore (permit)", highlights: "Pristine kelp forests, pinnacles" },
  { name: "Carmel River Beach", depth: "15–60ft", type: "Shore", highlights: "Gentle entry, good viz, kelp" },
];

const swimFaqs = [
  { q: "What age can my child start swim lessons?", a: "We accept children as young as 3 years old in our Pearls level. Each child is different, so we're happy to discuss your child's readiness." },
  { q: "How many kids are in each class?", a: "Maximum 4 students per instructor — always. This is our core commitment. Most programs have 8–10 per instructor." },
  { q: "How long does each level take?", a: "Every child progresses at their own pace. Most spend 1–2 sessions (4–8 weeks) per level, but we never rush. Mastery is the goal." },
  { q: "Do you offer private lessons?", a: "Yes! Private lessons are available for all ages and levels. They're great for accelerated progress or working on specific skills." },
  { q: "What should my child bring?", a: "A swimsuit, towel, and goggles (optional). We provide all other equipment. Swim caps are recommended for long hair." },
];

const scubaFaqs = [
  { q: "Do I need to know how to swim to try scuba?", a: "For Discover Scuba, basic water comfort is sufficient. For Open Water certification, you'll need to swim 200 meters and float for 10 minutes." },
  { q: "How long does Open Water certification take?", a: "Typically 4–5 days including classroom, pool sessions, and 4 open water dives. We also offer flexible scheduling and travel referral options." },
  { q: "What's a PADI 5★ IDC Center?", a: "It's the highest business rating PADI awards. It means we offer the full range of PADI courses from beginner to instructor level, with proven excellence in training." },
  { q: "Can I go from swim lessons to scuba?", a: "Absolutely! Our Octopus Elite swim level naturally bridges into PADI Discover Scuba. Many of our divers started as swim students." },
  { q: "Do you provide equipment for courses?", a: "Yes, all necessary equipment is included in course fees. As you progress, we can help you find the perfect gear setup." },
];

const testimonials = [
  { name: "Mike T.", role: "Rescue Diver", text: "The instructors here don't just teach — they mentor. I went from Open Water to Rescue and feel completely confident in the water." },
  { name: "Amy & Dave", role: "Travel Divers", text: "We've done two trips with Aquatic Dreams now — Fiji was life-changing. The organization and group dynamic were perfect." },
  { name: "Jennifer L.", role: "Swim Parent", text: "My anxious 5-year-old is now a confident Reef Explorer. The small class sizes make all the difference in the world." },
];

const Community = () => {
  return (
    <main>
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <BookOpen className="w-10 h-10 text-primary mb-4" />
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Community<br /><span className="text-primary">Hub</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Dive conditions, local sites, resources, and the voices of our community.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Dive Conditions */}
      <section className="py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-6 flex items-center gap-3">
            <MapPin className="w-8 h-8 text-primary" /> Monterey Dive Conditions
          </h2>
          <Card className="bg-gradient-to-r from-secondary/5 to-primary/5">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Check current conditions before your dive.</p>
              <Button asChild variant="outline" className="rounded-xl">
                <a href="https://www.montereybaydiving.com" target="_blank" rel="noopener noreferrer">
                  View Live Conditions <ExternalLink className="ml-1 w-4 h-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Dive Sites */}
      <section className="py-16 bg-card">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8">Local Dive Sites</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {diveSites.map((site) => (
              <Card key={site.name} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-6">
                  <h3 className="font-display text-lg font-bold text-foreground mb-1">{site.name}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{site.type} · {site.depth}</p>
                  <p className="text-sm text-foreground/70">{site.highlights}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8">Community Stories</h2>
          <Carousel opts={{ align: "start", loop: true }} className="max-w-4xl mx-auto">
            <CarouselContent>
              {testimonials.map((t, i) => (
                <CarouselItem key={i} className="md:basis-1/2">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex gap-1 mb-3">
                        {[...Array(5)].map((_, j) => (
                          <Star key={j} className="w-3.5 h-3.5 fill-coral text-coral" />
                        ))}
                      </div>
                      <p className="text-sm text-foreground/80 italic mb-4">"{t.text}"</p>
                      <p className="font-semibold text-sm text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
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

      {/* FAQs */}
      <section className="py-16 bg-card">
        <div className="container max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8 text-center">Frequently Asked Questions</h2>
          <Tabs defaultValue="swim" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="swim">Swim Lessons</TabsTrigger>
              <TabsTrigger value="scuba">Scuba / PADI</TabsTrigger>
            </TabsList>
            <TabsContent value="swim">
              <Accordion type="single" collapsible>
                {swimFaqs.map((faq, i) => (
                  <AccordionItem key={i} value={`swim-${i}`}>
                    <AccordionTrigger className="text-left font-medium">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
            <TabsContent value="scuba">
              <Accordion type="single" collapsible>
                {scubaFaqs.map((faq, i) => (
                  <AccordionItem key={i} value={`scuba-${i}`}>
                    <AccordionTrigger className="text-left font-medium">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* External Links */}
      <section className="py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8">Resources & Links</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { name: "PADI Website", url: "https://www.padi.com" },
              { name: "PADI eLearning", url: "https://www.padi.com/elearning" },
              { name: "DAN Website", url: "https://www.diversalertnetwork.org" },
              { name: "I Can Swim 209", url: "https://icanswim209.com" },
              { name: "Monterey Bay Conditions", url: "https://www.montereybaydiving.com" },
              { name: "Book a Course", url: "https://book.peek.com/s/bf926f86-9ac3-4030-a4b4-79a60c2a2d78/K1qNg" },
            ].map((link) => (
              <Button key={link.name} asChild variant="outline" className="rounded-xl justify-start">
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2 shrink-0" />
                  {link.name}
                </a>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Video Gallery Placeholder */}
      <section className="py-16 bg-card">
        <div className="container text-center">
          <Video className="w-10 h-10 text-primary mx-auto mb-4" />
          <h2 className="font-display text-3xl font-bold text-foreground mb-3">Video Gallery</h2>
          <p className="text-muted-foreground mb-6">Dive footage, swim highlights, and trip recaps — coming soon.</p>
          <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-video bg-muted rounded-xl flex items-center justify-center">
                <Video className="w-8 h-8 text-muted-foreground/40" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Community;
