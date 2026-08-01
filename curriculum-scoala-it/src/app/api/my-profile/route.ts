import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/apiSecurity';

export const dynamic = 'force-dynamic';

/**
 * Profilul minimal al utilizatorului logat curent - folosit de pagina statica
 * /roadmap.html (public/) pentru mesajul "Nivelul tau curent", care nu poate
 * primi props server-side ca o pagina Next obisnuita.
 */
export async function GET() {
  const profile = await requireUser();
  if (!checkRateLimit(`my-profile:${profile.id}`, RATE_LIMITS.READ.limit, RATE_LIMITS.READ.windowMs)) {
    return NextResponse.json({ error: 'Prea multe cereri' }, { status: 429 });
  }
  return NextResponse.json({
    fullName: profile.full_name || profile.email,
    role: profile.role,
    level: profile.level,
  });
}
