export const LOCAL_AJAX_PATHS = {
  saveWindow: '/local/ajax/save-window.php',
  saveService: '/local/ajax/save-service.php',
} as const;

interface LocalAjaxRequestParams {
  label: string;
  path: string;
  payload: unknown;
}

export const postLocalAjaxJson = async ({ label, path, payload }: LocalAjaxRequestParams): Promise<void> => {
  console.log(`[local-ajax] ${label}`, payload);

  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.warn(`[local-ajax] ${label} failed`, {
        status: response.status,
        responseText,
      });
      return;
    }

    console.log(`[local-ajax] ${label} success`, {
      status: response.status,
      responseText,
    });
  } catch (error) {
    console.error(`[local-ajax] ${label} error`, error);
  }
};
