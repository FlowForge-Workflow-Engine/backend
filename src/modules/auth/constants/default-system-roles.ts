export const DEFAULT_SYSTEM_ROLES = [
  { name: "Admin", description: "Full access to all tenant resources", isSystemRole: true },
  { name: "Approver", description: "Can approve or reject workflow transitions", isSystemRole: true },
  { name: "Requestor", description: "Can initiate and track workflow instances", isSystemRole: true },
] as const;
