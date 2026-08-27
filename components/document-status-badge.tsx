import type { ProcessingStatus } from "../generated/prisma";

const LABELS: Record<ProcessingStatus, string> = {
  PENDING: "Uploaded",
  PROCESSING: "Processing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

const COLORS: Record<ProcessingStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETE: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export function DocumentStatusBadge({
  status,
}: {
  status: ProcessingStatus;
}) {
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium ${COLORS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
