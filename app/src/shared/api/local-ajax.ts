export const LOCAL_AJAX_PATHS = {
  login: '/local/rest/api/v1/?action=user_login',
  logout: '/local/rest/api/v1/?action=user_logout',
  getProductPrice: '/local/rest/api/v1/?action=product_price',
  addProduct: '/local/rest/api/v1/?action=product_add',
  addService: '/local/rest/api/v1/?action=service_add',
  addOrder: '/local/rest/api/v1/?action=order_create',
  refreshOrder: '/local/rest/api/v1/?action=order_refresh',
  updateOrderPayment: '/local/rest/api/v1/?action=order_payment_update',
  markOrderPaid: '/local/rest/api/v1/?action=order_paid_full',
  updateOrderCode: '/local/rest/api/v1/?action=order_code_update',
  getOrder: '/local/rest/api/v1/?action=order_get',
  getOrders: '/local/rest/api/v1/?action=orders',
  getDataInvoice: '/local/rest/api/v1/?action=get_data_invoice',
  getDataPrintInvoice: '/local/rest/api/v1/?action=get_data_print_invoice',
  registerOrGetUser: '/local/rest/api/v1/?action=user_register_or_get',
  deleteBasketItem: '/local/rest/api/v1/?action=basket_del',
} as const;

interface LocalAjaxRequestParams {
  label: string;
  path: string;
  payload: unknown;
  method?: 'GET' | 'POST';
  csrfToken?: string;
}

export class LocalAjaxError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, payload: unknown, message?: string) {
    super(message ?? 'Local AJAX request failed');
    this.name = 'LocalAjaxError';
    this.status = status;
    this.payload = payload;
  }
}

const parseLocalAjaxResponse = async (response: Response): Promise<unknown> => {
  const responseText = await response.text().catch(() => '');
  const contentType = response.headers.get('content-type') ?? '';

  if (!responseText) {
    return null;
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(responseText) as unknown;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
};

const getErrorDiagnostic = (payload: unknown): { requestId?: string; code?: string } => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const nestedError =
    record.error && typeof record.error === 'object' && !Array.isArray(record.error)
      ? (record.error as Record<string, unknown>)
      : undefined;

  return {
    requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
    code:
      typeof nestedError?.code === 'string'
        ? nestedError.code
        : typeof record.code === 'string'
          ? record.code
          : undefined,
  };
};

export const postLocalAjaxJson = async <TResponse = unknown>({
  label,
  path,
  payload,
  method = 'POST',
  csrfToken,
}: LocalAjaxRequestParams): Promise<TResponse> => {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-Bitrix-Csrf-Token': csrfToken } : {}),
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
  });

  const responsePayload = await parseLocalAjaxResponse(response);

  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.warn(`[local-ajax] ${label} failed`, {
        status: response.status,
        ...getErrorDiagnostic(responsePayload),
      });
    }
    throw new LocalAjaxError(response.status, responsePayload, `[local-ajax] ${label} failed`);
  }

  return responsePayload as TResponse;
};

interface LocalAjaxFormRequestParams {
  label: string;
  path: string;
  formData: FormData;
  csrfToken?: string;
}

export const postLocalAjaxForm = async <TResponse = unknown>({
  label,
  path,
  formData,
  csrfToken,
}: LocalAjaxFormRequestParams): Promise<TResponse> => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-Bitrix-Csrf-Token': csrfToken } : {}),
    },
    body: formData,
  });
  const responsePayload = await parseLocalAjaxResponse(response);

  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.warn(`[local-ajax] ${label} failed`, {
        status: response.status,
        ...getErrorDiagnostic(responsePayload),
      });
    }
    throw new LocalAjaxError(response.status, responsePayload, `[local-ajax] ${label} failed`);
  }

  return responsePayload as TResponse;
};
