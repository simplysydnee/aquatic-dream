import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Wind, Droplets, Phone } from "lucide-react";

const brands = ["Aqua Lung", "ScubaPro", "Hollis", "Tusa", "Bare", "Tilos", "Diving Unlimited (DUI)"];

const services = [
  { icon: Wrench, title: "Equipment Sales", desc: "Premium scuba gear from top brands." },
  { icon: Wrench, title: "Equipment Rental", desc: "Full rental packages for local and travel diving." },
  { icon: Wind, title: "Air Fills", desc: "Standard air fills for your tanks." },
  { icon: Droplets, title: "Nitrox Fills", desc: "Enriched Air Nitrox for extended bottom times." },
  { icon: Wrench, title: "Equipment Servicing", desc: "Factory-authorized service and repairs." },
];

const Equipment = () => {
  return (
    <main>
      <section className="bg-gradient-to-br from-primary/10 to-background py-20">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <Wrench className="w-10 h-10 text-primary mb-4" />
            <h1 className="font-display text-4xl md:text-6xl font-bold text-foreground mb-6">
              Equipment<br /><span className="text-primary">& Gear</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
              Premium brands, expert service, and everything you need to dive — from air fills to full gear packages.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Brands */}
      <section className="py-16">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8">Brands We Carry</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {brands.map((brand) => (
              <Card key={brand} className="text-center hover:border-primary/40 transition-colors">
                <CardContent className="p-6">
                  <p className="font-semibold text-sm text-foreground">{brand}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-16 bg-card">
        <div className="container">
          <h2 className="font-display text-3xl font-bold text-foreground mb-8">Rentals & Services</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s) => (
              <Card key={s.title}>
                <CardContent className="p-6 flex items-start gap-4">
                  <s.icon className="w-8 h-8 text-primary shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-10 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-8 text-center">
              <Phone className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-display text-2xl font-bold text-foreground mb-2">Need Gear?</h3>
              <p className="text-muted-foreground mb-4">
                Call us or stop by the shop — we'll help you find the perfect setup.
              </p>
              <Button asChild className="bg-coral hover:bg-coral/90 text-coral-foreground rounded-xl">
                <a href="tel:2095773483">Call (209) 577-3483</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
};

export default Equipment;
