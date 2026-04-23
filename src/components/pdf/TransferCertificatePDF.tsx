import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#111827",
    lineHeight: 1.45,
  },
  border: {
    borderWidth: 1.5,
    borderColor: "#0b2452",
    padding: 20,
    flexGrow: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#0b2452",
    paddingBottom: 10,
    marginBottom: 16,
  },
  logo: { width: 64, height: 64 },
  headerText: { flex: 1, alignItems: "center" },
  schoolName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: "#0b2452",
    letterSpacing: 0.5,
  },
  schoolMeta: {
    fontSize: 9.5,
    color: "#374151",
    marginTop: 2,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: "#0b2452",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 2,
    textDecoration: "underline",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    fontSize: 10,
  },
  metaItem: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
  },
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  fieldNum: {
    width: 22,
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
  },
  fieldLabel: {
    width: 220,
    color: "#1f2937",
  },
  fieldValue: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    color: "#111827",
  },
  declaration: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftColor: "#c9a227",
    fontSize: 9.5,
    lineHeight: 1.5,
  },
  signatures: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
  },
  signatureBlock: {
    width: 160,
    alignItems: "center",
  },
  signatureLine: {
    width: 150,
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    marginBottom: 4,
    height: 28,
  },
  signatureLabel: {
    fontSize: 9.5,
    color: "#1f2937",
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8.5,
    color: "#6b7280",
  },
});

export interface TransferCertificateData {
  tc_number: string;
  issue_date: string;
  academic_year: string;
  student: {
    full_name: string;
    admission_no: string;
    father_name: string | null;
    mother_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    category: string | null;
    religion: string | null;
    nationality: string | null;
    aadhar_number: string | null;
    admission_date: string;
    previous_school: string | null;
    class_last_attended: string | null;
    last_attended_date: string | null;
    reason_for_leaving: string;
    conduct: string;
    remarks: string | null;
  };
}

interface Props {
  school: {
    name: string;
    addressLine: string;
    affiliation: string;
    affiliationNumber: string;
    phone?: string;
    email?: string;
  };
  data: TransferCertificateData;
  logoData?: Buffer | Uint8Array;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export function TransferCertificatePDF({ school, data, logoData }: Props) {
  const { student } = data;
  const fields: Array<[string, string]> = [
    ["Admission No.", student.admission_no],
    ["Name of the Pupil", student.full_name],
    ["Father's Name", student.father_name || "—"],
    ["Mother's Name", student.mother_name || "—"],
    ["Nationality", student.nationality || "Indian"],
    ["Religion", student.religion || "—"],
    ["Category", student.category || "—"],
    ["Aadhar No.", student.aadhar_number || "—"],
    ["Date of Birth", formatDate(student.date_of_birth)],
    ["Gender", student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : "—"],
    ["Date of Admission", formatDate(student.admission_date)],
    ["Previous School (if any)", student.previous_school || "—"],
    ["Class Last Attended", student.class_last_attended || "—"],
    ["Last Date of Attendance", formatDate(student.last_attended_date)],
    ["Academic Year", data.academic_year],
    ["Reason for Leaving", student.reason_for_leaving],
    ["Conduct", student.conduct],
  ];

  return (
    <Document
      title={`Transfer Certificate — ${student.full_name}`}
      author={school.name}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.header}>
            {logoData ? (
              <Image
                src={{ data: Buffer.from(logoData), format: "png" }}
                style={styles.logo}
              />
            ) : null}
            <View style={styles.headerText}>
              <Text style={styles.schoolName}>{school.name}</Text>
              <Text style={styles.schoolMeta}>{school.addressLine}</Text>
              <Text style={styles.schoolMeta}>
                Affiliated to {school.affiliation} · Affiliation No. {school.affiliationNumber}
              </Text>
              {(school.phone || school.email) ? (
                <Text style={styles.schoolMeta}>
                  {school.phone ? `Tel: ${school.phone}` : ""}
                  {school.phone && school.email ? "   ·   " : ""}
                  {school.email ? `Email: ${school.email}` : ""}
                </Text>
              ) : null}
            </View>
            {logoData ? <View style={styles.logo} /> : null}
          </View>

          <Text style={styles.title}>Transfer Certificate</Text>

          <View style={styles.metaRow}>
            <Text>
              <Text style={styles.metaItem}>TC No.: </Text>
              {data.tc_number}
            </Text>
            <Text>
              <Text style={styles.metaItem}>Date of Issue: </Text>
              {formatDate(data.issue_date)}
            </Text>
          </View>

          <View>
            {fields.map(([label, value], idx) => (
              <View key={label} style={styles.fieldRow} wrap={false}>
                <Text style={styles.fieldNum}>{idx + 1}.</Text>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Text style={styles.fieldValue}>{value}</Text>
              </View>
            ))}
          </View>

          {student.remarks ? (
            <View style={styles.declaration} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2, color: "#0b2452" }}>
                Remarks
              </Text>
              <Text>{student.remarks}</Text>
            </View>
          ) : null}

          <View style={styles.declaration} wrap={false}>
            <Text>
              Certified that the above particulars have been verified from the school&apos;s
              records. The student is hereby relieved from the rolls of this institution
              with effect from {formatDate(student.last_attended_date)}.
            </Text>
          </View>

          <View style={styles.signatures} wrap={false}>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Class Teacher</Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>School Seal</Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Principal</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          This is a computer-generated Transfer Certificate from {school.name}.
        </Text>
      </Page>
    </Document>
  );
}
