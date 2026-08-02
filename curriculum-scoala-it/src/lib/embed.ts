/**
 * Transformă orice link YouTube/Vimeo într-un URL de embed. Fără dependințe de server —
 * utilizabil și din componente client.
 *
 * Audit securitate M-5: pentru un host necunoscut, functia intorcea inainte URL-ul brut
 * neschimbat, care ajunge direct in `src`-ul unui <iframe> (vezi lectie/[id]/page.tsx) - un
 * link care nu e YouTube/Vimeo (introdus, intentionat sau nu, din campul video_url din
 * Panoul Admin) s-ar fi incarcat neschimbat, nesandbox-at, in interiorul aplicatiei. Acum
 * returnam null pentru orice host in afara listei cunoscute - UI-ul trateaza deja `null` ca
 * "nu exista inca un video" (acelasi mesaj afisat si cand campul e complet gol).
 */
export function toEmbedUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.hostname.includes('youtu.be')) return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/embed/')) return url;
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      return null;
    }
    if (u.hostname.includes('vimeo.com')) return `https://player.vimeo.com/video${u.pathname}`;
    return null;
  } catch {
    return null;
  }
}
