import { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/shared/PageTransition";

export const metadata: Metadata = {
  title: "Mandatory Public Disclosure",
};

const disclosureData = {
  general: [
    { label: "Name of the School", value: "NK Public School" },
    {
      label: "Affiliation No.",
      value: "1730446",
    },
    { label: "School Code", value: "14399" },
    {
      label: "Complete Address with Pin Code",
      value: "Grand Sikar Road, Rajawas, Jaipur, Rajasthan – 302013",
    },
    { label: "Principal Name", value: "Mrs. Prema Kavia" },
    { label: "School Email ID", value: "nkps.rajawas@gmail.com" },
    { label: "Contact Details", value: "+91-9785500046, +91-9785500048" },
  ],
  infrastructure: [
    { label: "Total Area of School (in sq. mtrs.)", value: "20,000 sq. mtrs." },
    {
      label: "No. and Size of Classrooms",
      value: "60+ Classrooms",
    },
    { label: "No. and Size of Laboratories", value: "5 Labs (Physics, Chemistry, Biology, Computer, Math)" },
    { label: "Computer Lab", value: "Yes" },
    { label: "Library", value: "Yes" },
    {
      label: "Whether Playground Available",
      value: "Yes",
    },
    {
      label: "Swimming Pool",
      value: "No",
    },
    {
      label: "Indoor Games",
      value: "Yes",
    },
    { label: "Auditorium", value: "Yes" },
  ],
  staff: [
    { label: "Principal", value: "Mrs. Prema Kavia" },
    { label: "Total No. of Teachers", value: "100+" },
    { label: "PGT", value: "25+" },
    { label: "TGT", value: "35+" },
    { label: "PRT", value: "40+" },
    {
      label: "Teachers Section Ratio",
      value: "1:1.5",
    },
  ],
  result: [
    { label: "Board Results (Class X)", value: "100% Pass" },
    { label: "Board Results (Class XII)", value: "100% Pass" },
  ],
};

function DisclosureTable({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: string }[];
}) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-heading font-bold text-navy-900 mb-4 border-b-2 border-gold-500 pb-2">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {data.map((item, index) => (
              <tr
                key={index}
                className={index % 2 === 0 ? "bg-cream-50" : "bg-white"}
              >
                <td className="border border-gray-200 px-4 py-3 font-medium text-navy-800 w-1/2">
                  {item.label}
                </td>
                <td className="border border-gray-200 px-4 py-3 text-gray-700">
                  {item.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MandatoryPublicDisclosurePage() {
  return (
    <PageTransition>
      <PageHeader
        title="Mandatory Public Disclosure"
        subtitle="As per CBSE requirements"
      />

      <section className="py-16 px-4 md:px-8 max-w-5xl mx-auto">
        <p className="text-gray-600 mb-8 text-sm">
          The following information is published as per CBSE Affiliation
          Bye-Laws and mandatory disclosure requirements. This information is
          updated periodically.
        </p>

        <DisclosureTable title="A. General Information" data={disclosureData.general} />
        <DisclosureTable title="B. Infrastructure Details" data={disclosureData.infrastructure} />
        <DisclosureTable title="C. Staff Details" data={disclosureData.staff} />
        <DisclosureTable title="D. Result & Academics" data={disclosureData.result} />
      </section>
    </PageTransition>
  );
}
