import { CurriculumSkeleton } from '@/components/Skeletons';

// Skeleton cu forma paginii - apare instant la navigare, pana vin datele de pe server.
export default function Loading() {
  return <CurriculumSkeleton />;
}
