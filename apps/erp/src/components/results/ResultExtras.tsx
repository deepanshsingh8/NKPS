"use client";

import { useEffect, useState } from "react";
import { createClient } from "@nkps/shared/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@nkps/shared/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@nkps/shared/components/ui/table";
import { Badge } from "@nkps/shared/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { gradeChip } from "@/lib/grades";
import { getCurrentEnrollment } from "@/lib/current-enrollment";
import type { ReportCardNonScholasticGroup } from "@/lib/report-card";

/**
 * The parts of a result the student and parent pages render identically but
 * used to drop: the class teacher's remark, the non-scholastic grades and the
 * published class tests. One copy here rather than one per portal.
 */

export type NonScholasticGroup = ReportCardNonScholasticGroup;

export function ExamRemark({ remark }: { remark: string | null | undefined }) {
  if (!remark) return null;
  return (
    <div className="mt-4 rounded-lg bg-gray-50 dark:bg-muted px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Class teacher&apos;s remark
      </p>
      <p className="text-sm text-navy-900 dark:text-white mt-1">{remark}</p>
    </div>
  );
}

export function NonScholasticTable({
  groups,
}: {
  groups: NonScholasticGroup[] | undefined;
}) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-navy-900 dark:text-white mb-2">
        Non-scholastic areas
      </h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Area</TableHead>
              <TableHead>Indicator</TableHead>
              <TableHead className="text-center">Grade</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((area) =>
              area.sub_subjects.map((sub, i) => (
                <TableRow key={sub.sub_subject_id}>
                  <TableCell className="font-medium">
                    {i === 0 ? area.parent_name : ""}
                  </TableCell>
                  <TableCell>{sub.sub_subject_name}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={`text-xs ${gradeChip(sub.grade_label)}`}>
                      {sub.grade_label ?? "--"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                    {sub.remarks ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ClassTestRow {
  id: string;
  name: string;
  test_date: string | null;
  max_marks: number;
  subject_name: string;
  marks_obtained: number | null;
  grade: string | null;
  remarks: string | null;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Published class tests for the student's current class, read under RLS:
 * `class_tests` is visible only when published and the student has an active
 * enrollment in its class; `class_test_results` only for the student's own
 * rows (or a parent's children). Filtering the embed by student_id matters
 * for a parent with two children in one section, who would otherwise see
 * both children's marks under one test.
 */
export function ClassTestsCard({ studentId }: { studentId: string }) {
  const [tests, setTests] = useState<ClassTestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const enrollment = await getCurrentEnrollment(supabase, studentId);
      if (!enrollment) {
        if (!cancelled) {
          setTests([]);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("class_tests")
        .select(
          "id, name, test_date, max_marks, subjects(name), class_test_results(marks_obtained, grade, remarks)"
        )
        .eq("class_id", enrollment.class_id)
        .eq("is_published", true)
        .eq("class_test_results.student_id", studentId)
        .order("test_date", { ascending: false, nullsFirst: false });

      type Row = {
        id: string;
        name: string;
        test_date: string | null;
        max_marks: number;
        subjects: { name: string } | { name: string }[] | null;
        class_test_results:
          | { marks_obtained: number; grade: string | null; remarks: string | null }[]
          | null;
      };

      const rows: ClassTestRow[] = ((data ?? []) as unknown as Row[]).map((t) => {
        const subject = Array.isArray(t.subjects) ? t.subjects[0] : t.subjects;
        const result = t.class_test_results?.[0] ?? null;
        return {
          id: t.id,
          name: t.name,
          test_date: t.test_date,
          max_marks: Number(t.max_marks),
          subject_name: subject?.name ?? "—",
          marks_obtained: result ? Number(result.marks_obtained) : null,
          grade: result?.grade ?? null,
          remarks: result?.remarks ?? null,
        };
      });

      if (!cancelled) {
        setTests(rows);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <Card className="bg-white dark:bg-card rounded-2xl">
      <CardHeader>
        <CardTitle className="text-navy-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Class Tests
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-navy-900 border-t-transparent" />
          </div>
        ) : tests.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            No class tests published yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Marks</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.name}
                      {t.remarks && (
                        <p className="text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                          {t.remarks}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{t.subject_name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateShort(t.test_date)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {t.marks_obtained === null ? (
                        <span className="text-gray-400 dark:text-gray-500">
                          Not entered
                        </span>
                      ) : (
                        `${t.marks_obtained} / ${t.max_marks}`
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={`text-xs ${gradeChip(t.grade)}`}>
                        {t.grade ?? "--"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
