import { LeadsCollectionPage } from '@/features/leads/pages/LeadsCollectionPage';

export const MyLeadsPage = () => (
  <LeadsCollectionPage
    scope="my"
    title="Мои лиды"
    emptyTitle="У вас пока нет активных лидов"
    emptyMessage="Возьмите подходящую заявку с витрины, чтобы начать работу."
  />
);

