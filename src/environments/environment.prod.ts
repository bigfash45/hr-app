/**
 * Production environment.
 *
 * NOTE: `apiBaseUrl` is a placeholder. It must be an HTTPS origin before deploy —
 * PRD §11.2 requires TLS 1.2 minimum for data in transit, and bearer tokens over
 * plain HTTP are readable on the wire.
 */
export const environment = {
  production: true,

  apiBaseUrl: 'https://REPLACE-ME/hr/api/v1',

  session: {
    absoluteMs: 8 * 60 * 60 * 1000,
    idleMs: 30 * 60 * 1000,
    idleWarningMs: 2 * 60 * 1000,
  },

  locale: {
    currency: 'NGN',
    currencySymbol: '₦',
    dateFormat: 'dd MMM yyyy',
    timeFormat: 'h:mm a',
    timeZone: 'Africa/Lagos',
  },
} as const;
