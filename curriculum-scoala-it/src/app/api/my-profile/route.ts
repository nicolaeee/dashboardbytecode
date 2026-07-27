import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Profilul minimal al utilizatorului logat curent - folosit de pagina statica
 * /roadmap.html (public/) pentru mesajul "Nivelul tau curent", care nu poate
 * primi props server-side ca o pagina Next obisnuita.
 */
export async function GET() {
  const profile = await requireUser();
  return NextResponse.json({
    fullName: profile.full_name || profile.email,
    role: profile.role,
    level: profile.level,
  });
}
