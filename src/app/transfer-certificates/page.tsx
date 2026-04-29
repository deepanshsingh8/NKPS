import type { Metadata } from "next";
import { TransferCertificatesPageClient } from "./TransferCertificatesPageClient";
import { JsonLd } from "@/website/components/seo/JsonLd";
import { buildMetadata, breadcrumbJsonLd } from "@/shared/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Transfer Certificates — NK Public School Jaipur",
  description:
    "Search and download transfer certificates (TC) issued by NK Public School, Rajawas, Jaipur. If you can't find a certificate, contact the school office.",
  path: "/transfer-certificates",
});

export default function TransferCertificatesPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Transfer Certificates", path: "/transfer-certificates" },
        ])}
      />
      <TransferCertificatesPageClient />
    </>
  );
}
