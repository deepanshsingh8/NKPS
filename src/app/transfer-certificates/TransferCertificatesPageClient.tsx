"use client";

import { useState, useEffect } from "react";
import { Download, Search, FileText, Info } from "lucide-react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { SectionDivider } from "@/components/shared/SectionDivider";
import { AnimatedSection } from "@/components/shared/AnimatedSection";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TC {
  id: string;
  student_name: string;
  admission_no: string | null;
  academic_year: string;
}

export function TransferCertificatesPageClient() {
  const [search, setSearch] = useState("");
  const [tcs, setTcs] = useState<TC[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    async function fetchTCs() {
      const supabase = createClient();
      // file_url intentionally not selected — the page links to the
      // signed-URL download endpoint instead so the storage path stays
      // hidden and downloads stay rate-limited.
      const { data, error } = await supabase
        .from("transfer_certificates")
        .select("id, student_name, admission_no, academic_year")
        .order("created_at", { ascending: false });

      if (error) {
        setFetchError(true);
      } else if (data) {
        setTcs(data as TC[]);
      }
      setLoading(false);
    }
    fetchTCs();
  }, []);

  const filteredTCs = tcs.filter((tc) => {
    const q = search.toLowerCase();
    return (
      tc.student_name.toLowerCase().includes(q) ||
      (tc.admission_no && tc.admission_no.toLowerCase().includes(q))
    );
  });

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
                placeholder="Search by name or admission number..."
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

          {/* Error State */}
          {fetchError && (
            <AnimatedSection delay={0.2}>
              <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                <p className="text-sm text-red-700">
                  Unable to load transfer certificates. Please try again later or contact the school office.
                </p>
              </div>
            </AnimatedSection>
          )}

          {/* TC Cards */}
          <AnimatedSection delay={0.2}>
            <div className="mt-10">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900/20 border-t-navy-900" />
                  <p className="mt-4 text-sm text-navy-800/50">Loading certificates...</p>
                </div>
              ) : filteredTCs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredTCs.map((tc) => (
                    <motion.div
                      key={tc.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
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
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-block rounded-full bg-cream-100 px-3 py-0.5 text-xs font-semibold text-navy-800">
                              {tc.academic_year}
                            </span>
                            {tc.admission_no && (
                              <span className="inline-block rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-600">
                                Adm: {tc.admission_no}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Download Button */}
                        <a
                          href={`/api/transfer-certificates/${tc.id}/download`}
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
                </div>
              ) : search ? (
                <div className="flex flex-col items-center justify-center py-20">
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
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="rounded-full bg-cream-100 p-6">
                    <FileText className="h-10 w-10 text-navy-800/30" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-navy-900">
                    No certificates uploaded yet
                  </h3>
                  <p className="mt-2 text-sm text-navy-800/50 text-center max-w-sm">
                    Transfer certificates will appear here once uploaded by the school administration.
                  </p>
                </div>
              )}
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
