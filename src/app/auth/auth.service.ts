import { Injectable } from '@angular/core';

export interface LoginPayload {
  companyCode: string;
  username: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  async login(payload: LoginPayload): Promise<{ ok: boolean; message?: string }> {
    await new Promise((r) => setTimeout(r, 800));
    if (!payload.username || !payload.password) {
      return { ok: false, message: 'Missing credentials' };
    }
    return { ok: true };
  }
}
