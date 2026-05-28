/**
 * Development environment.
 *
 * `apiBaseUrl` is the ONLY place the API host is allowed to appear. If you find
 * yourself typing a host anywhere else, route the call through ApiService instead.
 */
export const environment = {
  production: false,

  /**
   * Our own NestJS backend, in this repo under backend/.
   *
   * The previous service at 159.223.197.108:1066 is legacy and no longer a
   * dependency. Start ours with: cd backend && npm run start:dev
   */
  apiBaseUrl: 'http://localhost:3000/hr/api/v1',

  /** Session policy — PRD §6.1. Overridable per company once settings land. */
  session: {
    /** Absolute session lifetime. Default 8h. */
    absoluteMs: 8 * 60 * 60 * 1000,
    /** Inactivity before re-authentication is required. Default 30min. */
    idleMs: 30 * 60 * 1000,
    /** Warn this long before the idle deadline. */
    idleWarningMs: 2 * 60 * 1000,
  },

  /** Localisation — PRD §10.4. Nigeria only. */
  locale: {
    currency: 'NGN',
    currencySymbol: '₦',
    dateFormat: 'dd MMM yyyy',
    timeFormat: 'h:mm a',
    timeZone: 'Africa/Lagos',
  },
} as const;
