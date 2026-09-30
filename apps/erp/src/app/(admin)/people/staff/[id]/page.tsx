"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { z } from "zod";
import { adminFetch } from "@nkps/shared/lib/admin-api";
import { Button } from "@nkps/shared/components/ui/button";
import { Badge } from "@nkps/shared/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  STAFF_PROFILE_FIELDS,
  STAFF_PROFILE_SECTIONS,
  NOTICE_ISSUER_OPTIONS,
} from "@nkps/shared/lib/staff-profile-fields";
import {
  STAFF_GROUPS,
  staffCategoryGroup,
  staffCategoryLabel,
} from "@nkps/shared/lib/staff-roles";
import { staffNoticeSchema, staffTrainingSchema } from "@nkps/shared/lib/validations";
import type { StaffMember } from "@nkps/shared/types";
import { StaffAvatar } from "@/components/StaffAvatar";
import {
  StaffProfileSection,
  type BusOption,
  type ProfileValues,
} from "../_components/StaffProfileSection";
import { StaffRecordList, type RecordColumn } from "../_components/StaffRecordList";

type Profile = {
  member: StaffMember;
  details: ProfileValues | null;
  trainings: Record<string, unknown>[];
  notices: Record<string, unknown>[];
  buses: BusOption[];
};

const TRAINING_COLUMNS: RecordColumn[] = [
  { key: "program_name", label: "Programme / Training", type: "text", required: true, wide: true },
  { key: "from_date", label: "From", type: "date" },
  { key: "to_date", label: "To", type: "date" },
  { key: "duration", label: "Duration", type: "text" },
  { key: "organizing_institute", label: "Organising Institute", type: "text" },
];

const NOTICE_COLUMNS: RecordColumn[] = [
  { key: "issued_by", label: "Issued By", type: "select", options: NOTICE_ISSUER_OPTIONS, required: true },
  { key: "issue_date", label: "Date of Issue", type: "date", required: true },
  { key: "reason", label: "Notice / Reason", type: "longtext", required: true, wide: true },
  { key: "clarification", label: "Clarification / Justification", type: "longtext", wide: true },
];

const trainingsSchema = z.array(staffTrainingSchema);
const noticesSchema = z.array(staffNoticeSchema);

/**
 * The full staff record, in the five sections the school's format uses plus
 * trainings and notices. A route rather than a dialog: it is long, and it
 * wants deep links and the back button. Authorisation comes from the path —
 * featureKeyForPath matches /people/staff/<id> to the `staff` key.
 */
export default function StaffProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const staffId = params?.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!staffId) return;
    try {
      const res = await adminFetch(`/api/staff/${staffId}/profile`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load staff profile");
        setProfile(null);
        return;
      }
      setProfile(data as Profile);
    } catch {
      toast.error("Failed to load staff profile");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (body: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await adminFetch(`/api/staff/${staffId}/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to save");
          return false;
        }
        toast.success("Saved");
        await load();
        return true;
      } catch {
        toast.error("Network error");
        return false;
      }
    },
    [staffId, load]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-gray-500 dark:text-gray-400">Staff member not found.</p>
        <Button variant="outline" onClick={() => router.push("/people/staff")}>
          Back to staff
        </Button>
      </div>
    );
  }

  const m = profile.member;
  const values: ProfileValues = { ...(profile.details ?? {}), ...m };
  const group = staffCategoryGroup(m.category);
  const groupLabel = STAFF_GROUPS.find((g) => g.key === group)?.label;
  const empNo = profile.details?.employee_no as string | undefined;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/people/staff?group=${group}`)}
          aria-label="Back to staff"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <StaffAvatar name={m.name} photoUrl={m.photo_url} size="lg" />
        <div className="min-w-0">
          <h1 className="font-heading text-2xl text-gray-900 dark:text-gray-100">{m.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {m.subject}
            {empNo ? ` · Emp No. ${empNo}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {groupLabel && <Badge variant="outline">{groupLabel}</Badge>}
            <Badge variant="secondary">{staffCategoryLabel(m.category)}</Badge>
            {!m.is_active && (
              <Badge variant="outline" className="text-gray-500">
                Inactive
              </Badge>
            )}
          </div>
        </div>
      </div>

      {STAFF_PROFILE_SECTIONS.map((s) => (
        <StaffProfileSection
          key={s.key}
          title={s.title}
          fields={STAFF_PROFILE_FIELDS.filter((f) => f.section === s.key)}
          values={values}
          buses={profile.buses}
          onSave={(fields) => save({ fields })}
          note={
            s.key === "licence" && m.category !== "busDriver"
              ? "Only needed for staff who drive a school vehicle."
              : s.key === "official"
                ? "Category and photo are changed from the staff list (pencil on the row)."
                : undefined
          }
        />
      ))}

      <StaffRecordList
        title="Capacity Building Programmes / Trainings / Workshops"
        emptyText="No trainings recorded."
        addLabel="Add training"
        columns={TRAINING_COLUMNS}
        records={profile.trainings}
        schema={trainingsSchema}
        onSave={(trainings) => save({ trainings })}
      />

      <StaffRecordList
        title="Notices from Management / Administration"
        emptyText="No notices issued."
        addLabel="Add notice"
        columns={NOTICE_COLUMNS}
        records={profile.notices}
        schema={noticesSchema}
        onSave={(notices) => save({ notices })}
      />
    </div>
  );
}
