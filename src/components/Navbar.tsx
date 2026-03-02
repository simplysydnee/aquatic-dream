import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Phone, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/swim-lessons", label: "Swim Lessons" },
  { to: "/scuba", label: "PADI / Scuba" },
  { to: "/dive-trips", label: "Dive Trips" },
  { to: "/safety", label: "Safety" },
  { to: "/equipment", label: "Equipment" },
  { to: "/dream-divers", label: "Dream Divers" },
  { to: "/community", label: "Community" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Top bar */}
      <div className="bg-secondary text-secondary-foreground text-xs py-2 hidden md:block">
        <div className="container flex justify-between items-center">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> 1212 Kansas Ave, Modesto, CA
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="w-3 h-3" /> (209) 577-3483
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> generalmail@aquaticdreams.com
            </span>
          </div>
          <span className="font-display italic text-primary-foreground/80">Swim. Dive. Dream.</span>
        </div>
      </div>

      {/* Main nav */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b shadow-sm">
        <div className="container flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="font-display text-xl md:text-2xl font-bold text-secondary leading-tight">
                Aquatic Dreams
              </span>
              <span className="text-[10px] md:text-xs text-muted-foreground tracking-widest uppercase">
                Scuba Center
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  location.pathname === link.to
                    ? "text-primary bg-accent"
                    : "text-foreground/70 hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/swim-lessons">Swim Lessons</Link>
            </Button>
            <Button asChild size="sm" className="bg-coral hover:bg-coral/90 text-coral-foreground">
              <Link to="/scuba">Start PADI</Link>
            </Button>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="lg:hidden p-2 text-foreground"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-card border-b overflow-hidden"
            >
              <nav className="container py-4 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setIsOpen(false)}
                    className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      location.pathname === link.to
                        ? "text-primary bg-accent"
                        : "text-foreground/70 hover:bg-accent/50"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="flex gap-3 mt-4 px-4">
                  <Button asChild variant="outline" size="sm" className="flex-1">
                    <Link to="/swim-lessons" onClick={() => setIsOpen(false)}>Swim Lessons</Link>
                  </Button>
                  <Button asChild size="sm" className="flex-1 bg-coral hover:bg-coral/90 text-coral-foreground">
                    <Link to="/scuba" onClick={() => setIsOpen(false)}>Start PADI</Link>
                  </Button>
                </div>
                <div className="mt-4 px-4 pt-4 border-t text-xs text-muted-foreground space-y-2 md:hidden">
                  <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> 1212 Kansas Ave, Modesto, CA</p>
                  <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> (209) 577-3483</p>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
};

export default Navbar;
