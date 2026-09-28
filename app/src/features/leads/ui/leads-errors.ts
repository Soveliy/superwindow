import { LeadsRepositoryError } from '@/features/leads/model/leads.types';

export const getLeadsErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof LeadsRepositoryError) {
    if (error.code === 'network') {
      return 'Проверьте подключение к интернету и повторите попытку.';
    }

    if (error.code === 'conflict') {
      return 'Данные уже изменились. Обновите страницу и повторите действие.';
    }

    return error.message || fallback;
  }

  return error instanceof Error && error.message.trim() ? error.message : fallback;
};

