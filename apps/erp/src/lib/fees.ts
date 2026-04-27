import type { FeeStructure } from "@nkps/shared/types";

export const FEE_FREQ_MULTIPLIER: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  annual: 1,
  one_time: 1,
};

export function annualizedAmount(
  fs: Pick<FeeStructure, "amount" | "frequency">
): number {
  const mult = FEE_FREQ_MULTIPLIER[fs.frequency] ?? 1;
  return Number(fs.amount) * mult;
}

export function sumAnnualized(
  structures: Array<Pick<FeeStructure, "amount" | "frequency">>
): number {
  return structures.reduce((sum, fs) => sum + annualizedAmount(fs), 0);
}

// Resolve which fee structures actually apply to a given student.
//
// Override rule: if a stream-specific structure exists for the student's stream
// and a given fee_type, the class-wide (stream_id NULL) structure for the same
// fee_type is hidden. Structures belonging to other streams are dropped.
// Transport is dropped unless the student has opted in.
export function resolveEffectiveFeeStructures(
  structures: FeeStructure[],
  opts: { studentStreamId: string | null; hasTransport: boolean }
): FeeStructure[] {
  const { studentStreamId, hasTransport } = opts;

  const visible = structures.filter((fs) => {
    if (fs.fee_type === "Transport" && !hasTransport) return false;
    if (fs.stream_id && fs.stream_id !== studentStreamId) return false;
    return true;
  });

  const overriddenTypes = new Set(
    visible
      .filter((fs) => fs.stream_id && fs.stream_id === studentStreamId)
      .map((fs) => fs.fee_type)
  );

  return visible.filter(
    (fs) => !(fs.stream_id == null && overriddenTypes.has(fs.fee_type))
  );
}
