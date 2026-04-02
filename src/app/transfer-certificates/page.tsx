"use client";

import { useState, useEffect } from "react";
import { Download, Search, FileText, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { AnimatedSection } from "@/components/shared/AnimatedSection";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { staggerContainer, fadeUp } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TC {
  id: string;
  student_name: string;
  academic_year: string;
  file_url: string;
}

export default function TransferCertificatesPage() {
  const [search, setSearch] = useState("");
  const [tcs, setTcs] = useState<TC[]>([]);

  useEffect(() => {
    async function fetchTCs() {
      const supabase = createClient();
      const { data } = await supabase
        .from("transfer_certificates")
        .select("id, student_name, academic_year, file_url")
        .order("created_at", { ascending: false });

      if (data) setTcs(data as TC[]);
    }
    fetchTCs();
  }, []);

  const filteredTCs = tcs.filter((tc) =>
    tc.student_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageTransition>
      <PageHeader
        title="Transfer Certificates"
        subtitle="Download student transfer certificates"
      />

      <SectionDivider />

      <section className="py-20 px-6">
        <div className="mx-auto max-w-4xl">
          <AnimatedSection>
            <SectionHeading title="Search Certificates" />
          </AnimatedSection>

          {/* Info Banner */}
          <AnimatedSection delay={0.1}>
            <div className="mt-8 rounded-2xl border border-gold-500/20 bg-gradient-to-r from-cream-50 to-gold-500/5 p-5 md:p-6">
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0 rounded-xl bg-gold-500/10 p-2.5">
                  <Info className="h-5 w-5 text-gold-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-navy-900 text-sm">
                    What are Transfer Certificates?
                  </h3>
                  <p className="mt-1 text-sm text-navy-800/70 leading-relaxed">
                    A Transfer Certificate (TC) is an official document issued when a student
                    leaves the school. Search by the student&apos;s name below to find and
                    download the certificate. If you cannot find a certificate, please contact
                    the school office.
                  </p>
                </div>
              </div>
            </div>
          </AnimatedSection>

          {/* Search Bar */}
          <AnimatedSection delay={0.15}>
            <div className="relative mx-auto mt-10 max-w-xl">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-navy-800/40">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                placeholder="Search by student name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  "w-full rounded-2xl border-2 border-navy-900/10 bg-white py-4 pl-14 pr-6",
                  "text-navy-900 placeholder:text-navy-800/40",
                  "transition-all duration-300",
                  "focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:shadow-lg focus:shadow-gold-500/5",
                  "text-base"
                )}
              />
            </div>
          </AnimatedSection>

          {/* TC Cards */}
          <AnimatedSection delay={0.2}>
            <div className="mt-10">
              <AnimatePresence mode="popLayout">
                {filteredTCs.length > 0 ? (
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 gap-4 md:grid-cols-2"
                  >
                    {filteredTCs.map((tc) => (
                      <motion.div
                        key={tc.id}
                        variants={fadeUp}
                        layout
                        className="group rounded-2xl border border-navy-900/5 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-gold-500/20 hover:-translate-y-0.5"
                      >
                        <div className="flex items-center gap-4">
                          {/* Icon */}
                          <div className="flex-shrink-0 rounded-xl bg-navy-900/5 p-3 transition-colors duration-300 group-hover:bg-navy-900/10">
                            <FileText className="h-6 w-6 text-navy-900" />
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-navy-900 truncate">
                              {tc.student_name}
                            </h3>
                            <span className="mt-1 inline-block rounded-full bg-cream-100 px-3 py-0.5 text-xs font-semibold text-navy-800">
                              {tc.academic_year}
                            </span>
                          </div>

                          {/* Download Button */}
                          <a
                            href={tc.file_url}
                            className={cn(
                              "flex-shrink-0 inline-flex items-center gap-2 rounded-full px-5 py-2.5",
                              "bg-gradient-to-r from-gold-500 to-gold-400 text-navy-900",
                              "font-semibold text-sm shadow-sm",
                              "transition-all duration-300",
                              "hover:shadow-md hover:shadow-gold-500/25 hover:scale-105",
                              "active:scale-95"
                            )}
                          >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex flex-col items-center justify-center py-20"
                  >
                    <div className="rounded-full bg-cream-100 p-6">
                      <Search className="h-10 w-10 text-navy-800/30" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-navy-900">
                      No certificates found
                    </h3>
                    <p className="mt-2 text-sm text-navy-800/50 text-center max-w-sm">
                      We couldn&apos;t find any transfer certificates matching
                      &ldquo;{search}&rdquo;. Try a different name or contact the school office
                      for assistance.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </AnimatedSection>

          <p className="mt-12 text-center text-sm text-gray-400">
            Transfer certificates are uploaded by the school administration.
          </p>
        </div>
      </section>
    </PageTransition>
  );
}
