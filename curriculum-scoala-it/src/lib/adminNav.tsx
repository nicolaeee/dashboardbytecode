import { AlertTriangle, Archive, ClipboardList, GraduationCap, Library, Map, PiggyBank, Rocket, Star, TrendingDown, Users } from 'lucide-react';
import type { NavItem } from '@/components/NavLinks';

/**
 * Sidebar-ul adminului - SINGURA sursă de adevăr, folosită identic în admin/layout.tsx
 * (rutele /admin/*) ȘI în (teacher)/layout.tsx (rutele /progress, /diplome, /registru etc.,
 * pe care adminul le folosește la fel ca profesorul) - altfel, cum aceste două grupuri de
 * rute au layout-uri Next.js diferite, fiecare cu propriul array de nav, sidebar-ul "sărea"
 * (ex: apăsând "Progress Tracker" din /admin/curriculum, "Profesori" dispărea) pentru că
 * admin/layout.tsx și (teacher)/layout.tsx randau două sidebar-uri diferite. Folosind acest
 * array identic în ambele, sidebar-ul rămâne vizual și funcțional persistent la navigare,
 * indiferent sub care din cele două layout-uri Next.js cade pagina curentă.
 */
export function getAdminNavItems(newTaskCount: number): NavItem[] {
  return [
    {
      href: '/admin/task-uri-urgente',
      label: newTaskCount > 0 ? `Task-uri urgente (${newTaskCount})` : 'Task-uri urgente',
      icon: <AlertTriangle size={16} />,
    },
    { href: '/admin/curriculum', label: 'Curriculum', icon: <Library size={16} /> },
    { href: '/admin/teachers', label: 'Profesori', icon: <Users size={16} /> },
    { href: '/admin/arhiva', label: 'Arhivă', icon: <Archive size={16} /> },
    { href: '/progress', label: 'Progress Tracker', icon: <Rocket size={16} /> },
    { href: '/registru', label: 'Registru', icon: <ClipboardList size={16} /> },
    { href: '/diplome', label: 'Diplome', icon: <GraduationCap size={16} /> },
    { href: '/recompense', label: 'Recompense', icon: <Star size={16} /> },
    { href: '/roadmap', label: 'Roadmap', icon: <Map size={16} /> },
    // Adminul ("Super Admin") are acces implicit la toate modulele noi - vezi
    // src/lib/featureAccess.ts (getEnabledFeatureModules returnează setul complet pentru admin).
    { href: '/abonamente', label: 'Abonamente', icon: <PiggyBank size={16} /> },
    { href: '/analytics', label: 'Rata de Abandon', icon: <TrendingDown size={16} /> },
  ];
}
