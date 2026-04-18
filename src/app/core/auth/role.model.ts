/**
 * The four roles from PRD §4. Every user holds exactly one.
 *
 * Roles are NOT cumulative — a Line Manager does not inherit Local HR Manager
 * permissions. That is why this is a flat union with an explicit scope map
 * rather than a numeric rank you can compare with `>=`.
 */
export const ROLES = ['GROUP_HR_MANAGER', 'LOCAL_HR_MANAGER', 'LINE_MANAGER', 'EMPLOYEE'] as const;

export type Role = (typeof ROLES)[number];

/** Data visibility for each role — PRD §7.1. */
export type DataScope = 'group' | 'company' | 'department' | 'self';

export const ROLE_SCOPE: Record<Role, DataScope> = {
  GROUP_HR_MANAGER: 'group',
  LOCAL_HR_MANAGER: 'company',
  LINE_MANAGER: 'department',
  EMPLOYEE: 'self',
};

export const ROLE_LABEL: Record<Role, string> = {
  GROUP_HR_MANAGER: 'Group HR Manager',
  LOCAL_HR_MANAGER: 'HR Manager',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
};

/** Where each role lands after signing in — PRD §6.1. */
export const ROLE_HOME: Record<Role, string> = {
  GROUP_HR_MANAGER: '/overview',
  LOCAL_HR_MANAGER: '/overview',
  LINE_MANAGER: '/overview',
  EMPLOYEE: '/overview',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Normalise whatever the backend sends into a Role.
 *
 * The current dev API returns a `roles: string[]` array with unknown casing and
 * possible `ROLE_` prefixes, so we are liberal on input and strict on output.
 * Returns null when nothing recognisable is present — the caller must then
 * refuse the session rather than guessing a role.
 */
export function normaliseRole(raw: readonly string[] | string | null | undefined): Role | null {
  const candidates = typeof raw === 'string' ? [raw] : (raw ?? []);

  for (const candidate of candidates) {
    const key = candidate
      .trim()
      .toUpperCase()
      .replace(/^ROLE_/, '')
      .replace(/[\s-]+/g, '_');

    if (isRole(key)) return key;

    // Tolerate the shorter names a backend might reasonably use.
    switch (key) {
      case 'GROUP_HR':
      case 'GROUPHR':
        return 'GROUP_HR_MANAGER';
      case 'HR':
      case 'HR_MANAGER':
      case 'LOCAL_HR':
        return 'LOCAL_HR_MANAGER';
      case 'MANAGER':
      case 'LINE_MGR':
        return 'LINE_MANAGER';
      case 'STAFF':
      case 'USER':
      case 'REGULAR_EMPLOYEE':
        return 'EMPLOYEE';
    }
  }

  return null;
}
