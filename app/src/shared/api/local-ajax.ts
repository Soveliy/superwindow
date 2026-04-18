export const LOCAL_AJAX_PATHS = {
  addProduct: '/local/rest/api/v1/?action=product_add',
  addService: '/local/rest/api/v1/?action=service_add',
  addOrder: '/local/rest/api/v1/?action=order_create',
  refreshOrder: '/local/rest/api/v1/?action=order_refresh',
  getOrder: '/local/rest/api/v1/?action=order_get',
  getOrders: '/local/rest/api/v1/?action=orders',
  registerOrGetUser: '/local/rest/api/v1/?action=user_register_or_get',
  deleteBasketItem: '/local/rest/api/v1/?action=basket_del',
} as const;

interface LocalAjaxRequestParams {
  label: string;
  path: string;
  payload: unknown;
  method?: 'GET' | 'POST';
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

export const postLocalAjaxJson = async <TResponse = unknown>({
  label,
  path,
  payload,
  method = 'POST',
}: LocalAjaxRequestParams): Promise<TResponse> => {
  console.log(`[local-ajax] ${label}`, payload);

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
  });

  const responsePayload = await parseLocalAjaxResponse(response);

  if (!response.ok) {
    console.warn(`[local-ajax] ${label} failed`, {
      status: response.status,
      responsePayload,
    });
    throw new LocalAjaxError(response.status, responsePayload, `[local-ajax] ${label} failed`);
  }

  console.log(`[local-ajax] ${label} success`, {
    status: response.status,
    responsePayload,
  });

  return responsePayload as TResponse;
};
