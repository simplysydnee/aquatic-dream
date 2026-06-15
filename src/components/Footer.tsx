import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Instagram } from "lucide-react";
import logoMain from "@/assets/logo-main.png";
import StarfishCurriculumBadge from "@/components/StarfishCurriculumBadge";

const Footer = () => {
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          <div>
            <img src={logoMain} alt="Aquatic Dreams" className="h-14 w-auto mb-4 brightness-0 invert" />
            <p className="text-secondary-foreground/70 text-sm mb-6">
              Modesto's swim lesson destination — building confident, safe swimmers from age 3 to 12.
            </p>
            <div className="flex gap-3">
              <a href="https://instagram.com/aquaticdreamswim" target="_blank" rel="noopener noreferrer" className="p-2 rounded-full bg-secondary-foreground/10 hover:bg-primary transition-colors">
                <Instagram className="w-4 h-4" />
              </a>
            </div>
            <p className="text-xs text-secondary-foreground/50 mt-3">@aquaticdreamswim</p>
          </div>

          <div>
            <h5 className="font-semibold mb-4 text-sm uppercase tracking-wider text-secondary-foreground/60">Programs</h5>
            <ul className="space-y-2 text-sm text-secondary-foreground/70">
              <li><Link to="/swim-lessons" className="hover:text-primary transition-colors">Swim Lessons</Link></li>
              <li><Link to="/swim-enrollment" className="hover:text-primary transition-colors">Enroll Now</Link></li>
              <li><a href="https://icanswim209.com" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">I Can Swim 209</a></li>
              <li><Link to="/careers" className="hover:text-primary transition-colors">Careers</Link></li>
            </ul>
          </div>

          <div>
            <h5 className="font-semibold mb-4 text-sm uppercase tracking-wider text-secondary-foreground/60">Contact</h5>
            <ul className="space-y-3 text-sm text-secondary-foreground/70">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span>1212 Kansas Ave<br />Modesto, CA 95351</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 shrink-0" />
                <a href="tel:2095773483" className="hover:text-primary transition-colors">(209) 577-3483</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                <a href="mailto:info@aquaticdreamsswim.com" className="hover:text-primary transition-colors text-xs">info@aquaticdreamsswim.com</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-secondary-foreground/10 flex flex-col gap-6">
          <StarfishCurriculumBadge variant="compact" onDark className="justify-center md:justify-start" />
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-secondary-foreground/50">
              © {new Date().getFullYear()} Aquatic Dreams. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-secondary-foreground/50">
              <Link to="/sms-terms" className="hover:text-primary transition-colors">SMS Terms</Link>
              <Link to="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link to="/waivers" className="hover:text-primary transition-colors">Waivers</Link>
              <span className="font-display italic">Swim. Dive. Dream.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
