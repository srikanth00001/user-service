// src/common/tenant/tenant.utils.ts
export const extractTenantDomain = (email: string): string => {
  if (!email.includes('@')) return 'digiwebspot';
  const domain = email.split('@')[1].toLowerCase();
  return domain.replace(/\./g, '_').replace(/[^a-z0-9_]/g, '');
};