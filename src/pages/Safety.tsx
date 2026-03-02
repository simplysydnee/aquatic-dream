import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Heart, ExternalLink } from "lucide-react";

const Safety = () => {
  return (
    <main>
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <Shield className="w-10 h-10 text-primary mb-4" />
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Safety &<br /><span className="text-primary">Certifications</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Community safety resources that bridge both the swim and scuba worlds. 
              Be prepared, be certified, be confident.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-20">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-12">
            {/* Red Cross */}
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <Heart className="w-8 h-8 text-coral" />
                Red Cross Programs
              </h2>
              <p className="text-muted-foreground mb-8">American Red Cross certified training for water safety professionals.</p>
              <div className="space-y-4">
                <Card className="border-2 hover:border-coral/40 transition-colors">
                  <CardContent className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-2">Lifeguarding Course</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Complete American Red Cross Lifeguarding certification — CPR/AED, first aid, 
                      and water rescue skills for pool and waterfront environments.
                    </p>
                    <Button className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">Inquire About Dates</Button>
                  </CardContent>
                </Card>
                <Card className="border-2 hover:border-coral/40 transition-colors">
                  <CardContent className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-2">Safety Training for Swim Coaches</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Essential safety training designed specifically for swim coaches and instructors. 
                      Covers emergency action plans, injury prevention, and water safety management.
                    </p>
                    <Button className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">Inquire About Dates</Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* DAN */}
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                <Shield className="w-8 h-8 text-primary" />
                DAN Programs
              </h2>
              <p className="text-muted-foreground mb-8">Divers Alert Network resources for dive safety and emergency preparedness.</p>
              <div className="space-y-4">
                <Card className="border-2 hover:border-primary/40 transition-colors">
                  <CardContent className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-2">CPR & EFR Instructor</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Become a certified CPR and Emergency First Response Instructor. Teach life-saving 
                      skills to divers and the general public.
                    </p>
                    <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl">
                      Learn More
                    </Button>
                  </CardContent>
                </Card>
                <Card className="border-2 hover:border-primary/40 transition-colors">
                  <CardContent className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-2">DAN Dive Insurance</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Protect yourself with dive accident insurance from the Divers Alert Network. 
                      Coverage for hyperbaric treatment, evacuation, and more.
                    </p>
                    <Button asChild variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl">
                      <a href="https://www.diversalertnetwork.org" target="_blank" rel="noopener noreferrer">
                        Visit DAN <ExternalLink className="ml-1 w-4 h-4" />
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Safety;
