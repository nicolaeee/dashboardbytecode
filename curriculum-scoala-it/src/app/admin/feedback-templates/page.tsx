import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { FeedbackTemplate } from '@/lib/types';
import FeedbackTemplatesManager from './FeedbackTemplatesManager';

/**
 * "Șabloane Feedback" (CMS Admin) - STRICT admin: vezi requireAdmin() de mai jos +
 * admin/layout.tsx (singura sursă a link-ului din Sidebar, sub 'EDUCAȚIONAL' - vezi
 * lib/adminNav.tsx) + RLS-ul pe feedback_templates (schema.sql, "adminul gestioneaza
 * sabloanele de feedback"). Un profesor nu ajunge niciodată să vadă această pagină sau
 * textele brute din spatele ei - la fiecare "Generează Diplomă" primește doar rezultatul
 * final, ales și personalizat automat de random_diploma_parent_message.
 */
export default async function FeedbackTemplatesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from('feedback_templates')
    .select('*')
    .order('course_id')
    .order('module_number')
    .order('variant_index');

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <header>
        <p className="tag">CMS intern</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Șabloane Feedback</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Cele 3 variante de mesaj către părinte, per curs și modul, trimise automat la fiecare
          „Generează Diplomă” din Task-uri Urgente. Profesorul nu le vede și nu alege niciodată -
          sistemul alege una singură, aleatoriu, și o trimite mai departe.
        </p>
      </header>

      <div className="glass rounded-2xl border border-brand-300/40 px-4 py-3 text-sm leading-relaxed text-ink/80">
        <span className="font-semibold text-brand-500">Notă:</span> Folosiți placeholder-ul{' '}
        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[13px] text-brand-500">
          [Numele Copilului]
        </code>{' '}
        în texte pentru ca sistemul să îl înlocuiască automat la generarea diplomei.
      </div>

      <FeedbackTemplatesManager templates={(data ?? []) as FeedbackTemplate[]} />
    </div>
  );
}
