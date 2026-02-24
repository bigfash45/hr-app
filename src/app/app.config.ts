import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { correlationIdInterceptor } from './core/http/interceptors/correlation-id.interceptor';
import { authInterceptor } from './core/http/interceptors/auth.interceptor';
import { tenantInterceptor } from './core/http/interceptors/tenant.interceptor';
import { loadingInterceptor } from './core/http/interceptors/loading.interceptor';
import { errorInterceptor } from './core/http/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/errors/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      // Land at the top of each page, and restore position on Back.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),

    provideHttpClient(
      /**
       * Order matters. Requests flow down this list and responses come back up,
       * so:
       *  - correlationId is first, giving every later interceptor an id to log
       *  - auth sits above error, so a 401 gets its silent-refresh retry before
       *    the error interceptor would turn it into a session-expired dialog
       *  - error is last, so it sees the final outcome of any retry
       */
      withInterceptors([
        correlationIdInterceptor,
        authInterceptor,
        tenantInterceptor,
        loadingInterceptor,
        errorInterceptor,
      ])
    ),

    // Nothing fails silently: uncaught template and lifecycle errors get the
    // same treatment as HTTP failures.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
