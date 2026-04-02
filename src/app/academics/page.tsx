import { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { CurriculumOverview } from "@/components/academics/CurriculumOverview";
import { StaffDirectory } from "@/components/academics/StaffDirectory";

export const metadata: Metadata = {
  title: "Academics",
};

export default function AcademicsPage() {
  return (
    <>
      <PageHeader
        title="Academics"
        subtitle="Excellence in CBSE Education"
      />
      <CurriculumOverview />
      <StaffDirectory />
    </>
  );
}
