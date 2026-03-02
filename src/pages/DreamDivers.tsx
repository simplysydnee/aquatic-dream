import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Waves, Calendar, Users, ChevronRight } from "lucide-react";

const upcomingDives = [
  { title: "Monastery Beach Night Dive", date: "March 15, 2026", spots: 8 },
  { title: "Breakwater – Monterey", date: "March 22, 2026", spots: 12 },
  { title: "Point Lobos Reserve", date: "April 5, 2026", spots: 6 },
  { title: "Carmel River Beach", date: "April 19, 2026", spots: 10 },
];

const DreamDivers = () => {
  return (
    <main>
      <section className="bg-gradient-to-br from-secondary/95 to-secondary text-secondary-foreground py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <Waves className="w-10 h-10 text-primary mb-4" />
            <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
              Dream<br /><span className="text-primary">Divers Club</span>
            </h1>
            <p className="text-lg text-secondary-foreground/70 leading-relaxed max-w-xl">
              Our community of certified divers who explore together. Regular club dives, 
              social events, and a shared love for the ocean.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">About the Club</h2>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                Dream Divers Club is the community arm of Aquatic Dreams. Open to all certified divers, 
                the club organizes regular local dives, coordinates travel trips, and builds friendships 
                that last a lifetime.
              </p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Whether you just earned your Open Water card or you're a seasoned Divemaster, 
                there's a place for you in our community.
              </p>
              <Button className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl px-8">
                Join the Club <ChevronRight className="ml-1 w-4 h-4" />
              </Button>
            </div>

            <div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">Upcoming Club Dives</h2>
              <div className="space-y-3">
                {upcomingDives.map((dive) => (
                  <Card key={dive.title} className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm">{dive.title}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" /> {dive.date}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" /> {dive.spots} spots
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default DreamDivers;
