const LABELS: Record<string, string> = {
  PENDING: "Uploaded",
  PROCESSING: "Processing",
  COMPLETE: "Complete",
  FAILED: "Failed",
};

const COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  COMPLETE: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export function DocumentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium ${
        COLORS[status] ?? COLORS.PENDING
      }`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
