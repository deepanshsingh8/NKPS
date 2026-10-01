import type { Metadata } from "next";
import { AdmissionsPageClient } from "./AdmissionsPageClient";
import { ADMISSIONS_FAQS } from "./faqs";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildMetadata, breadcrumbJsonLd, faqJsonLd } from "@nkps/shared/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Admissions — NK Public School Jaipur (CBSE, Nursery–XII)",
  description:
    "Admissions at NK Public School, Rajawas, Jaipur, a CBSE co-ed school for Nursery to Class XII: process, eligibility, fees and FAQ. Call the office to begin.",
  path: "/admissions",
});

export default function AdmissionsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Admissions", path: "/admissions" },
        ])}
      />
      <JsonLd data={faqJsonLd(ADMISSIONS_FAQS)} />
      <AdmissionsPageClient />
    </>
  );
}
