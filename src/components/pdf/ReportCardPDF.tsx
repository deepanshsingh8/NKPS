import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  ReportCardAttendance,
  ReportCardExamGroup,
  ReportCardStudent,
} from "@/lib/report-card";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#0b2452",
    paddingBottom: 10,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
    alignItems: "center",
  },
  logo: {
    width: 56,
    height: 56,
  },
  schoolName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: "#0b2452",
    letterSpacing: 0.5,
  },
  schoolMeta: {
    fontSize: 9,
    color: "#4b5563",
    marginTop: 2,
  },
  reportTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#0b2452",
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  studentBlock: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    padding: 10,
  },
  studentField: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 3,
  },
  fieldLabel: {
    fontFamily: "Helvetica-Bold",
    color: "#4b5563",
    width: 90,
  },
  fieldValue: {
    flex: 1,
    color: "#111827",
  },
  examTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#0b2452",
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 2,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0b2452",
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  totalRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    fontFamily: "Helvetica-Bold",
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  colSubject: { width: "40%" },
  colNum: { width: "15%", textAlign: "center" },
  colGrade: { width: "15%", textAlign: "center" },
  summary: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftColor: "#c9a227",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  attendanceRow: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftColor: "#0b2452",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  attendanceLabel: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
  },
  attendanceMeta: {
    color: "#4b5563",
    marginTop: 2,
  },
  attendanceValue: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
    fontSize: 12,
  },
  remarkBlock: {
    marginTop: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
  },
  remarkLabel: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
    marginBottom: 4,
  },
  remarkText: {
    color: "#111827",
    lineHeight: 1.4,
  },
  summaryLabel: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
  },
  summaryValue: {
    fontFamily: "Helvetica-Bold",
    color: "#0b2452",
    fontSize: 12,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontSize: 9,
    color: "#6b7280",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  signatureBlock: {
    alignItems: "center",
    width: 140,
  },
  signatureLine: {
    width: 120,
    borderBottomWidth: 1,
    borderBottomColor: "#9ca3af",
    marginBottom: 4,
    height: 20,
  },
  signatureLabel: {
    fontSize: 9,
    color: "#4b5563",
  },
});

interface ReportCardPDFProps {
  school: {
    name: string;
    addressLine: string;
    affiliation: string;
    affiliationNumber: string;
  };
  student: ReportCardStudent;
  exam: ReportCardExamGroup;
  attendance: ReportCardAttendance | null;
  /**
   * Raw PNG/JPEG bytes for the school logo. Buffers work server-side with
   * @react-pdf/renderer; undefined means skip the logo slot.
   */
  logoData?: Buffer | Uint8Array;
  generatedOn: string;
  /**
   * Footer config from `pdf_footer_configs`. Optional — if omitted, sensible
   * defaults matching the previous hardcoded footer are used.
   */
  footer?: {
    disclaimer_text: string | null;
    show_signatures: boolean;
    signature_labels: string[];
  };
}

export function ReportCardPDF({
  school,
  student,
  exam,
  attendance,
  logoData,
  generatedOn,
  footer,
}: ReportCardPDFProps) {
  const classLabel = student.class
    ? `${student.class.name} — ${student.class.section}`
    : "—";
  const disclaimer =
    footer?.disclaimer_text ?? "This is a computer-generated document.";
  const showSignatures = footer?.show_signatures ?? true;
  const signatureLabels =
    footer?.signature_labels && footer.signature_labels.length > 0
      ? footer.signature_labels
      : ["Class Teacher", "Principal"];

  return (
    <Document
      title={`Report Card — ${student.name} — ${exam.exam_type_name}`}
      author={school.name}
    >
      <Page size="A4" style={styles.page}>
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
              Affiliated to {school.affiliation} · Affiliation No.{" "}
              {school.affiliationNumber}
            </Text>
            <Text style={styles.reportTitle}>
              Report Card · {exam.exam_type_name}
            </Text>
          </View>
          {logoData ? <View style={styles.logo} /> : null}
        </View>

        <View style={styles.studentBlock}>
          <View style={styles.studentField}>
            <Text style={styles.fieldLabel}>Name</Text>
            <Text style={styles.fieldValue}>{student.name}</Text>
          </View>
          <View style={styles.studentField}>
            <Text style={styles.fieldLabel}>Class</Text>
            <Text style={styles.fieldValue}>{classLabel}</Text>
          </View>
          <View style={styles.studentField}>
            <Text style={styles.fieldLabel}>Roll No.</Text>
            <Text style={styles.fieldValue}>
              {student.roll_number ?? "—"}
            </Text>
          </View>
          <View style={styles.studentField}>
            <Text style={styles.fieldLabel}>Examination</Text>
            <Text style={styles.fieldValue}>{exam.exam_type_name}</Text>
          </View>
        </View>

        <Text style={styles.examTitle}>Subject-wise Performance</Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colSubject}>Subject</Text>
            <Text style={styles.colNum}>Max</Text>
            <Text style={styles.colNum}>Obtained</Text>
            <Text style={styles.colNum}>%</Text>
            <Text style={styles.colGrade}>Grade</Text>
          </View>
          {exam.subjects.map((sub) => {
            const pct =
              sub.max_marks > 0
                ? Math.round((sub.marks_obtained / sub.max_marks) * 100)
                : 0;
            return (
              <View key={sub.subject_id} style={styles.tableRow}>
                <Text style={styles.colSubject}>
                  {sub.subject_name}
                  {sub.subject_code ? ` (${sub.subject_code})` : ""}
                </Text>
                <Text style={styles.colNum}>{sub.max_marks}</Text>
                <Text style={styles.colNum}>{sub.marks_obtained}</Text>
                <Text style={styles.colNum}>{pct}%</Text>
                <Text style={styles.colGrade}>{sub.grade ?? "—"}</Text>
              </View>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={styles.colSubject}>Total</Text>
            <Text style={styles.colNum}>{exam.total_max}</Text>
            <Text style={styles.colNum}>{exam.total_obtained}</Text>
            <Text style={styles.colNum}>{exam.percentage}%</Text>
            <Text style={styles.colGrade}>{exam.overall_grade}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Overall Result</Text>
            <Text style={{ color: "#4b5563", marginTop: 2 }}>
              {exam.total_obtained} / {exam.total_max}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.summaryValue}>
              {exam.percentage}% · Grade {exam.overall_grade}
            </Text>
          </View>
        </View>

        {attendance ? (
          <View style={styles.attendanceRow}>
            <View>
              <Text style={styles.attendanceLabel}>Attendance</Text>
              <Text style={styles.attendanceMeta}>
                {attendance.present_days} / {attendance.total_days} days
                {attendance.academic_year_label
                  ? ` · ${attendance.academic_year_label}`
                  : ""}
              </Text>
            </View>
            <Text style={styles.attendanceValue}>{attendance.percentage}%</Text>
          </View>
        ) : null}

        {exam.remark ? (
          <View style={styles.remarkBlock} wrap={false}>
            <Text style={styles.remarkLabel}>Class Teacher&apos;s Remark</Text>
            <Text style={styles.remarkText}>{exam.remark}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <View>
            <Text>Generated on {generatedOn}</Text>
            {disclaimer ? (
              <Text style={{ marginTop: 2 }}>{disclaimer}</Text>
            ) : null}
          </View>
          {showSignatures
            ? signatureLabels.map((label, idx) => (
                <View key={idx} style={styles.signatureBlock}>
                  <View style={styles.signatureLine} />
                  <Text style={styles.signatureLabel}>{label}</Text>
                </View>
              ))
            : null}
        </View>
      </Page>
    </Document>
  );
}
