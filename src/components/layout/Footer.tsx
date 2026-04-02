import Link from "next/link";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { FacebookIcon, InstagramIcon, YoutubeIcon } from "@/components/shared/SocialIcons";
import { SCHOOL, NAV_LINKS } from "@/lib/constants";

const resources = [
  { label: "Transfer Certificates", href: "/transfer-certificates" },
  { label: "Admissions", href: "/admissions" },
  { label: "Gallery", href: "/gallery" },
  { label: "Contact", href: "/contact" },
];

export function Footer() {
  const year = new Date().getFullYear();
  const quickLinks = NAV_LINKS.slice(0, 4);

  return (
    <footer className="bg-navy-900 text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: School Info */}
          <div>
            <h3 className="font-heading text-2xl font-bold">NK Public School</h3>
            <p className="mt-4 text-sm leading-relaxed text-gray-300">
              A {SCHOOL.affiliation}-affiliated institution committed to academic excellence,
              holistic development, and nurturing future leaders.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <Link href={SCHOOL.social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-gray-400 hover:text-gold-400 transition-colors">
                <FacebookIcon className="h-5 w-5" />
              </Link>
              <Link href={SCHOOL.social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-gray-400 hover:text-gold-400 transition-colors">
                <InstagramIcon className="h-5 w-5" />
              </Link>
              <Link href={SCHOOL.social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-gray-400 hover:text-gold-400 transition-colors">
                <YoutubeIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h4 className="text-lg font-semibold">Quick Links</h4>
            <ul className="mt-4 space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-300 hover:text-gold-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h4 className="text-lg font-semibold">Resources</h4>
            <ul className="mt-4 space-y-3">
              {resources.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-gray-300 hover:text-gold-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Contact Us */}
          <div>
            <h4 className="text-lg font-semibold">Contact Us</h4>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                <span className="text-sm text-gray-300">{SCHOOL.address.full}</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                <a href={`tel:${SCHOOL.phone[0]}`} className="text-sm text-gray-300 hover:text-gold-400 transition-colors">
                  {SCHOOL.phone[0]}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                <a href={`mailto:${SCHOOL.email[0]}`} className="text-sm text-gray-300 hover:text-gold-400 transition-colors">
                  {SCHOOL.email[0]}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
                <span className="text-sm text-gray-300">Mon – Sat: 8:00 AM – 3:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider + Copyright */}
        <div className="mt-12 border-t border-gold-500/30 pt-8 text-center">
          <p className="text-sm text-gray-400">
            &copy; {year} NK Public School. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
