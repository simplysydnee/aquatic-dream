import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plane, MapPin, Calendar, Users, ChevronRight } from "lucide-react";

const trips = [
  {
    destination: "Fiji",
    emoji: "🇫🇯",
    dates: "April 2–11, 2026",
    description: "Crystal-clear waters, vibrant soft corals, and manta rays. Fiji's Bligh Water is world-class diving at its finest.",
    highlights: ["Soft coral capital of the world", "Manta ray encounters", "Remote island resorts", "Warm water year-round"],
    price: "Contact for pricing",
    spots: "Limited spots",
  },
  {
    destination: "Socorro",
    emoji: "🇲🇽",
    dates: "June 7–16, 2026",
    description: "The 'Mexican Galápagos' — giant mantas, hammerhead schools, and humpback whales in one of the world's top liveaboard destinations.",
    highlights: ["Giant Pacific mantas", "Hammerhead sharks", "Whale encounters", "Liveaboard experience"],
    price: "Contact for pricing",
    spots: "Limited spots",
  },
  {
    destination: "Maldives",
    emoji: "🇲🇻",
    dates: "Coming Soon",
    description: "Whale sharks, thilas, and channels teeming with life. The Maldives is every diver's dream destination.",
    highlights: ["Whale shark encounters", "Channel dives", "Overwater luxury", "Pristine reefs"],
    price: "TBA",
    spots: "Express interest",
  },
  {
    destination: "Philippines: Atlantis Adventurer",
    emoji: "🇵🇭",
    dates: "Coming Soon",
    description: "Explore the Philippines' incredible marine biodiversity aboard the Atlantis fleet.",
    highlights: ["Macro diving paradise", "Diverse marine life", "Expert local guides", "All-inclusive packages"],
    price: "TBA",
    spots: "Express interest",
  },
  {
    destination: "Philippines: Atlantis Puerto Galera",
    emoji: "🇵🇭",
    dates: "Coming Soon",
    description: "World-renowned dive sites just hours from Manila, with the best macro diving in the region.",
    highlights: ["Verde Island Passage", "200+ nudibranch species", "Coral gardens", "Shore diving access"],
    price: "TBA",
    spots: "Express interest",
  },
  {
    destination: "Philippines: Atlantis Dumaguete",
    emoji: "🇵🇭",
    dates: "Coming Soon",
    description: "The critter capital of the Philippines — unmatched muck diving and marine sanctuaries.",
    highlights: ["Apo Island sanctuary", "Muck diving capital", "Whale shark encounters", "Marine biodiversity"],
    price: "TBA",
    spots: "Express interest",
  },
];

const DiveTrips = () => {
  return (
    <main>
      <section className="bg-gradient-to-br from-secondary/95 to-secondary text-secondary-foreground py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <Plane className="w-10 h-10 text-primary mb-4" />
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
              Dive the<br /><span className="text-primary">World With Us</span>
            </h1>
            <p className="text-lg text-secondary-foreground/70 leading-relaxed max-w-xl">
              From Fiji's soft corals to Socorro's giant mantas — join our group dive trips 
              led by experienced Aquatic Dreams instructors.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <div className="grid gap-8">
            {trips.map((trip, i) => (
              <motion.div
                key={trip.destination}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="grid md:grid-cols-3">
                    <div className="bg-gradient-to-br from-secondary to-secondary/80 p-8 text-secondary-foreground flex flex-col justify-center">
                      <span className="text-5xl mb-4">{trip.emoji}</span>
                      <h2 className="font-display text-2xl font-bold mb-2">{trip.destination}</h2>
                      <div className="flex items-center gap-2 text-sm text-secondary-foreground/70">
                        <Calendar className="w-4 h-4" />
                        {trip.dates}
                      </div>
                    </div>
                    <CardContent className="p-8 md:col-span-2">
                      <p className="text-muted-foreground mb-4 leading-relaxed">{trip.description}</p>
                      <div className="grid grid-cols-2 gap-2 mb-6">
                        {trip.highlights.map((h) => (
                          <p key={h} className="text-sm flex items-center gap-1.5 text-foreground">
                            <ChevronRight className="w-3 h-3 text-primary shrink-0" />
                            {h}
                          </p>
                        ))}
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <p className="font-display text-lg font-bold text-foreground">{trip.price}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" /> {trip.spots}
                          </p>
                        </div>
                        <Button className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">
                          Reserve My Spot <ChevronRight className="ml-1 w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default DiveTrips;
