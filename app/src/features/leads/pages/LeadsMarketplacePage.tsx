import { LeadsCollectionPage } from '@/features/leads/pages/LeadsCollectionPage';

export const LeadsMarketplacePage = () => (
  <LeadsCollectionPage
    scope="available"
    title="Лиды"
    emptyTitle="Новых лидов пока нет"
    emptyMessage="Как только завод опубликует подходящие заявки, они появятся здесь."
  />
);

