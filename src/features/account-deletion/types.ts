export type DeletionStatus = "received" | "identity_verified" | "deletion_confirmed" |
  "in_progress" | "completed" | "requires_attention" | "error";

export interface DeletionRequest {
  requestId: string;
  receiptToken: string;
  status: "received";
  expiresAt: string;
}
export interface DeletionVerification {
  status: "identity_verified";
  confirmationToken: string;
  expiresAt: string;
  consequences: {
    irreversible: true;
    endsAllSessions: true;
    newRegistrationIsSeparate: true;
    retainedCategories: string[];
    requiresAttention: boolean;
    reason: string | null;
    retentionPolicy: { basis: string; days: number } | null;
  };
}
export interface DeletionResult {
  requestId: string;
  status: DeletionStatus;
  reason: string | null;
  retainedCategories: string[];
  notification: "pending" | "sent" | "not_required" | "unavailable";
  retention?: { until: string; basis: string; identifiersExpired: boolean };
}
export interface DeletionReceipt {
  requestId: string;
  receiptToken: string;
  ownerId: number;
}
