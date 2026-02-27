import { httpClient } from '@/shared/api/http-client';

export interface LoginRequest {
  emailOrDealerId: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  dealerId?: string;
}

export const loginRequest = (payload: LoginRequest): Promise<LoginResponse> =>
  httpClient.post<LoginResponse>('/auth/login', payload);
