import type { OrgBranding } from '@/types/database';

export function getOrgTheme(branding?: Partial<OrgBranding> | null): Record<string, string> {
  return {
    '--brand-primary': branding?.primary_color || '#F97316',
    '--brand-secondary': branding?.secondary_color || '#3B82F6',
    '--brand-accent': branding?.accent_color || branding?.primary_color || '#F97316',
  };
}

export function getOrgLogoUrl(branding?: Partial<OrgBranding> | null, variant: 'light' | 'dark' = 'light'): string {
  if (variant === 'light') return branding?.logo_light_url || '/logo-light.svg';
  return branding?.logo_dark_url || '/logo-dark.svg';
}
