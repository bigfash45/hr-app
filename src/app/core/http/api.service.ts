import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RequestFlags, contextFrom } from './http-context';

export type QueryParams = Record<
  string,
  string | number | boolean | ReadonlyArray<string | number | boolean> | null | undefined
>;

export interface RequestOptions extends RequestFlags {
  params?: QueryParams;
  headers?: Record<string, string>;
}

/**
 * The one place the API host lives, and the only HTTP surface features are
 * allowed to use.
 *
 * Before this existed, each service pasted the base URL and rebuilt its own
 * Authorization header (see the original dashboard.service.ts), which meant
 * eight services would have been eight places to fix a token bug. Auth,
 * tenancy, correlation ids, the progress bar, and error mapping are all
 * interceptor concerns now — callers just describe the request.
 *
 * Paths are relative and leading slashes are optional:
 *   api.get<Employee[]>('employees', { params: { page: 1 } })
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl.replace(/\/+$/, '');

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.get<T>(this.url(path), this.build(options));
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {}, this.build(options));
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {}, this.build(options));
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? {}, this.build(options));
  }

  delete<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http.delete<T>(this.url(path), this.build(options));
  }

  /**
   * Multipart upload with progress events — payslip and document batches
   * (PRD §6.6). Subscribe and read HttpEventType.UploadProgress for a bar.
   */
  upload<T>(
    path: string,
    files: File | File[],
    fields: Record<string, string> = {},
    options: RequestOptions = {}
  ): Observable<HttpEvent<T>> {
    const form = new FormData();
    const list = Array.isArray(files) ? files : [files];
    for (const file of list) form.append(list.length > 1 ? 'files' : 'file', file, file.name);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);

    return this.http.post<T>(this.url(path), form, {
      ...this.build(options),
      reportProgress: true,
      observe: 'events',
    });
  }

  /** Binary download (payslip PDFs). Returns a Blob, not JSON. */
  download(path: string, options: RequestOptions = {}): Observable<Blob> {
    return this.http.get(this.url(path), {
      ...this.build(options),
      responseType: 'blob',
    });
  }

  private url(path: string): string {
    return `${this.base}/${path.replace(/^\/+/, '')}`;
  }

  private build(options: RequestOptions) {
    return {
      context: contextFrom(options),
      params: toHttpParams(options.params),
      headers: options.headers,
    };
  }
}

/** Drop null/undefined so we don't send `?department=undefined`. */
function toHttpParams(params?: QueryParams): HttpParams | undefined {
  if (!params) return undefined;

  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) httpParams = httpParams.append(key, String(item));
    } else {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}

/** Type guard for the rare places a caller needs the raw HTTP failure. */
export function isHttpError(value: unknown): value is HttpErrorResponse {
  return value instanceof HttpErrorResponse;
}
