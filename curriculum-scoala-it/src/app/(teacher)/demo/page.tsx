import { requireUser } from '@/lib/auth';
import DemoClient from './DemoClient';

// Sectiune Demo, complet izolata: date fictive, generate local (vezi DemoClient.tsx) - nu
// citeste si nu scrie NIMIC in Supabase, deci nu poate afecta datele reale ale scolii.
// Autentificarea/Shell-ul raman cele din (teacher)/layout.tsx, ca la orice alta ruta din grup.
// isAdmin vine din profilul real logat, ca DemoClient sa arate exact ce ar vedea ACEST
// utilizator in Progress Tracker (admin vede si panoul de abonament din Fisa Elevului,
// profesorul nu) - la fel ca /progress/page.tsx.
export default async function DemoPage() {
  const profile = await requireUser();
  return <DemoClient isAdmin={profile.role === 'admin'} />;
}
