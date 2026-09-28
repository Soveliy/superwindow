import { LOCAL_AJAX_PATHS, LocalAjaxError, postLocalAjaxJson } from '@/shared/api/local-ajax';

export interface LoginRequest {
  emailOrDealerId: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponse {
  token: string;
  dealerId?: string;
  dealerName?: string;
  dealerEmail?: string;
  dealerLogin?: string;
}

interface LocalLoginResponse {
  success?: boolean;
  token?: string;
  dealerId?: string | number;
  dealer_id?: string | number;
  user_id?: string | number;
  login?: string;
  email?: string;
  name?: string;
  message?: string;
  error?: string;
  user?: {
    id?: string | number;
    login?: string;
    email?: string;
    name?: string;
  };
}

export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

const getErrorMessage = (response: LocalLoginResponse | unknown): string => {
  if (response && typeof response === 'object') {
    const payload = response as LocalLoginResponse;
    const message = payload.message ?? payload.error;

    if (message) {
      return message;
    }
  }

  return 'Не удалось выполнить вход. Проверьте логин и пароль.';
};

const normalizeLoginResponse = (
  response: LocalLoginResponse,
  payload: LoginRequest,
): LoginResponse => {
  if (response.success === false || response.error) {
    throw new LoginError(getErrorMessage(response));
  }

  const dealerId =
    response.dealerId ??
    response.dealer_id ??
    response.user_id ??
    response.user?.id ??
    payload.emailOrDealerId;

  return {
    token: response.token || `bitrix-session-${Date.now()}`,
    dealerId: String(dealerId),
    dealerName: response.name ?? response.user?.name,
    dealerEmail: response.email ?? response.user?.email,
    dealerLogin: response.login ?? response.user?.login ?? payload.emailOrDealerId,
  };
};

export const loginRequest = async (payload: LoginRequest): Promise<LoginResponse> => {
  try {
    const response = await postLocalAjaxJson<LocalLoginResponse>({
      label: 'user_login',
      path: LOCAL_AJAX_PATHS.login,
      payload: {
        login: payload.emailOrDealerId,
        emailOrDealerId: payload.emailOrDealerId,
        password: payload.password,
        remember: Boolean(payload.rememberMe),
      },
    });

    return normalizeLoginResponse(response, payload);
  } catch (error) {
    if (error instanceof LocalAjaxError) {
      throw new LoginError(getErrorMessage(error.payload));
    }

    throw error;
  }
};

export const logoutRequest = async (): Promise<void> => {
  await postLocalAjaxJson({
    label: 'user_logout',
    path: LOCAL_AJAX_PATHS.logout,
    payload: {},
  });
};
