"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, BarChart3 } from "lucide-react";

interface SubjectResult {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  marks_obtained: number;
  max_marks: number;
  grade: string | null;
}

interface ExamGroup {
  exam_type_id: string;
  exam_type_name: string;
  sort_order: number;
  subjects: SubjectResult[];
  total_obtained: number;
  total_max: number;
  percentage: number;
  overall_grade: string;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-green-100 text-green-700 border-green-200",
  A: "bg-green-50 text-green-600 border-green-200",
  "B+": "bg-blue-100 text-blue-700 border-blue-200",
  B: "bg-blue-50 text-blue-600 border-blue-200",
  C: "bg-yellow-100 text-yellow-700 border-yellow-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  F: "bg-red-100 text-red-700 border-red-200",
};

export default function StudentResultsPage() {
  const [exams, setExams] = useState<ExamGroup[]>([]);
  const [studentName, setStudentName] = useState("");
  const [className, setClassName] = useState("");
  const [rollNumber, setRollNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResults() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch report card via API
      const res = await fetch(
        `/api/erp/results/report-card?student_id=${user.id}`
      );

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();

      setStudentName(data.student?.name ?? "");
      setClassName(
        data.student?.class
          ? `${data.student.class.name} - ${data.student.class.section}`
          : ""
      );
      setRollNumber(data.student?.roll_number ?? null);
      setExams(data.exams ?? []);
      setLoading(false);
    }

    fetchResults();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy-900">
            My Results
          </h1>
          <p className="text-gray-500 mt-1">
            {studentName && `${studentName}`}
            {className && ` | ${className}`}
            {rollNumber !== null && ` | Roll No: ${rollNumber}`}
          </p>
        </div>
        <Button
          variant="outline"
          className="border-navy-900 text-navy-900 hover:bg-navy-900/5"
          onClick={() =>
            toast.info("Report card download coming soon")
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Download Report Card
        </Button>
      </div>

      {exams.length === 0 ? (
        <Card className="bg-white rounded-2xl">
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-center text-gray-400">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No results available yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Results will appear here once published
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={exams[0]?.exam_type_id}>
          <TabsList variant="line" className="mb-4 flex-wrap">
            {exams.map((exam) => (
              <TabsTrigger key={exam.exam_type_id} value={exam.exam_type_id}>
                {exam.exam_type_name}
              </TabsTrigger>
            ))}
          </TabsList>

          {exams.map((exam) => (
            <TabsContent key={exam.exam_type_id} value={exam.exam_type_id}>
              <Card className="bg-white rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-navy-900 flex items-center justify-between">
                    <span>{exam.exam_type_name}</span>
                    <div className="flex items-center gap-3">
                      <Badge
                        className={`text-sm px-3 py-1 ${GRADE_COLORS[exam.overall_grade] ?? ""}`}
                      >
                        {exam.overall_grade}
                      </Badge>
                      <span className="text-sm font-normal text-gray-500">
                        {exam.percentage}%
                      </span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-center">
                            Marks Obtained
                          </TableHead>
                          <TableHead className="text-center">
                            Max Marks
                          </TableHead>
                          <TableHead className="text-center">
                            Percentage
                          </TableHead>
                          <TableHead className="text-center">Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exam.subjects.map((sub) => {
                          const pct =
                            sub.max_marks > 0
                              ? Math.round(
                                  (sub.marks_obtained / sub.max_marks) * 100
                                )
                              : 0;
                          return (
                            <TableRow key={sub.subject_id}>
                              <TableCell className="font-medium">
                                {sub.subject_name}
                                {sub.subject_code && (
                                  <span className="text-gray-400 text-xs ml-1">
                                    ({sub.subject_code})
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {sub.marks_obtained}
                              </TableCell>
                              <TableCell className="text-center">
                                {sub.max_marks}
                              </TableCell>
                              <TableCell className="text-center">
                                {pct}%
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  className={`text-xs ${GRADE_COLORS[sub.grade ?? ""] ?? ""}`}
                                >
                                  {sub.grade ?? "--"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {/* Summary Row */}
                        <TableRow className="bg-gray-50 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-center">
                            {exam.total_obtained}
                          </TableCell>
                          <TableCell className="text-center">
                            {exam.total_max}
                          </TableCell>
                          <TableCell className="text-center">
                            {exam.percentage}%
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={`text-xs ${GRADE_COLORS[exam.overall_grade] ?? ""}`}
                            >
                              {exam.overall_grade}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
