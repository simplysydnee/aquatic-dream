import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import SEO from "@/components/SEO";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Clock, DollarSign, Briefcase, Heart, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import JobApplicationForm from "@/components/careers/JobApplicationForm";

const Careers = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingTo, setApplyingTo] = useState<{ id: string; title: string } | null>(null);

  const { data: postings, isLoading } = useQuery({
    queryKey: ["job-postings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen">
      <SEO
        title="Careers at Aquatic Dreams Swim — Modesto Swim Instructor Jobs"
        description="Join the Aquatic Dreams team in Modesto. Open swim instructor and aquatic staff positions — apply online to teach with a 5-level curriculum and small class sizes."
        path="/careers"
      />
      {/* Hero */}
      <section className="bg-secondary text-secondary-foreground py-20">
        <div className="container text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Join Our Team
          </h1>
          <p className="text-secondary-foreground/70 max-w-2xl mx-auto text-lg">
            Make a positive impact by helping others stay safe and confident in the water. We're looking for passionate team members to join Aquatic Dreams.
          </p>
        </div>
      </section>

      {/* Postings */}
      <section className="container py-16">
        <h2 className="font-display text-2xl font-semibold mb-8">Open Positions</h2>

        {isLoading ? (
          <p className="text-muted-foreground">Loading positions...</p>
        ) : !postings?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No open positions right now — check back soon!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {postings.map((posting) => {
              const isExpanded = expandedId === posting.id;
              return (
                <Card key={posting.id} className="overflow-hidden">
                  <CardHeader className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : posting.id)}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl font-display">{posting.title}</CardTitle>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{posting.location}</span>
                          {posting.pay_rate && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{posting.pay_rate}</span>}
                          <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{posting.job_type}</span>
                          {posting.shift_schedule && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{posting.shift_schedule}</span>}
                        </div>
                        {posting.benefits && posting.benefits.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {posting.benefits.map((b: string) => (
                              <Badge key={b} variant="secondary" className="text-xs">
                                <Heart className="w-3 h-3 mr-1" />{b}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-coral hover:bg-coral/90 text-coral-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setApplyingTo({ id: posting.id, title: posting.title });
                          }}
                        >
                          Apply Now
                        </Button>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 border-t">
                      <div className="prose prose-sm max-w-none mt-4 text-foreground/80 whitespace-pre-line">
                        {posting.full_description?.split('\n').map((line: string, i: number) => {
                          if (line.startsWith('**') && line.endsWith('**')) {
                            return <h3 key={i} className="font-semibold text-foreground mt-4 mb-2 text-base">{line.replace(/\*\*/g, '')}</h3>;
                          }
                          if (line.startsWith('- ')) {
                            return <p key={i} className="ml-4 mb-1">• {line.slice(2)}</p>;
                          }
                          return line ? <p key={i} className="mb-1">{line.replace(/\*\*/g, '')}</p> : <br key={i} />;
                        })}
                      </div>
                      {posting.contact_email && (
                        <p className="mt-6 text-sm text-muted-foreground">
                          Questions? Email{" "}
                          <a href={`mailto:${posting.contact_email}`} className="text-primary hover:underline">
                            {posting.contact_email}
                          </a>
                        </p>
                      )}
                      <div className="mt-6">
                        <Button
                          className="bg-coral hover:bg-coral/90 text-coral-foreground"
                          onClick={() => setApplyingTo({ id: posting.id, title: posting.title })}
                        >
                          Apply for this Position
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Application Form Dialog */}
      {applyingTo && (
        <JobApplicationForm
          jobPostingId={applyingTo.id}
          jobTitle={applyingTo.title}
          onClose={() => setApplyingTo(null)}
        />
      )}
    </div>
  );
};

export default Careers;
