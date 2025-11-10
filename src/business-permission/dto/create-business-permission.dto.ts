export class CreateBusinessPermissionDto {
  roleId: string;
  permissions: Record<string, string[]>; // e.g., { "Lead Management": ["view", "create"] }
}
