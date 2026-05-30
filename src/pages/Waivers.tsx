import SEO from "@/components/SEO";
import VisitorWaiverForm from "@/components/waivers/VisitorWaiverForm";
import { ShieldCheck } from "lucide-react";

const Waivers = () => {
  return (
    <div className="min-h-screen">
      <SEO
        title="Pool Liability Waiver — Aquatic Dreams Swim School"
        description="Sign the Aquatic Dreams liability waiver and photo consent online before visiting our Modesto pool. Quick, mobile-friendly, emailed copy included."
        path="/waivers"
      />

      <section className="bg-secondary text-secondary-foreground py-16">
        <div className="container text-center max-w-3xl">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-coral" />
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            Pool Liability Waiver
          </h1>
          <p className="text-secondary-foreground/80 text-lg">
            Please sign before entering the pool. Takes about 2 minutes — a copy
            will be emailed to you.
          </p>
        </div>
      </section>

      <section className="container py-12">
        <VisitorWaiverForm source="public" />
      </section>
    </div>
  );
};

export default Waivers;
