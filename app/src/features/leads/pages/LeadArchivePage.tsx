import { LeadsCollectionPage } from '@/features/leads/pages/LeadsCollectionPage';

export const LeadArchivePage = () => (
  <LeadsCollectionPage
    scope="archive"
    title="Архив лидов"
    emptyTitle="Архив пуст"
    emptyMessage="Завершённые, конвертированные и отменённые лиды появятся здесь."
  />
);

