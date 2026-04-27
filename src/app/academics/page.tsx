import { Metadata } from "next";
import { PageHeader } from "@/website/components/layout/PageHeader";
import { CurriculumOverview } from "@/website/components/academics/CurriculumOverview";
import { StaffDirectory } from "@/website/components/academics/StaffDirectory";
import { JsonLd } from "@/website/components/seo/JsonLd";
import { buildMetadata, breadcrumbJsonLd } from "@nkps/shared/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Academics & CBSE Curriculum — NK Public School Jaipur",
  description:
    "CBSE curriculum at NK Public School, Jaipur — structured pre-primary, primary, secondary and senior-secondary programs with experienced faculty in Science, Commerce and Humanities streams.",
  path: "/academics",
});

export default function AcademicsPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Academics", path: "/academics" },
        ])}
      />
      <PageHeader
        title="Academics"
        subtitle="Excellence in CBSE Education"
      />
      <CurriculumOverview />
      <StaffDirectory />
    </>
  );
}
