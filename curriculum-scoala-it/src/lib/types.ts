export type Role = 'admin' | 'teacher';

/** Nivelul profesorului in grila de promovare (vezi /roadmap.html). */
export type TeacherLevel = 'Junior' | 'Middle' | 'Senior';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  level: TeacherLevel;
  /** Telefonul profesorului - editabil din Panoul de Profesori (Admin). */
  phone: string | null;
  /** Link catre calendarul propriu de recuperari - editabil de profesor din dashboard. */
  makeup_calendar_link: string | null;
  created_at: string;
};

export type Platform = {
  id: string; name: string; description: string; accent: string; position: number;
};
export type Course = {
  id: string; platform_id: string; title: string; description: string; position: number;
};
export type Module = {
  id: string; course_id: string; title: string; description: string; position: number;
};
export type Lesson = {
  id: string;
  module_id: string;
  title: string;
  objective: string;
  video_url: string;
  notes: string;
  homework: string;
  homework_url: string;
  position: number;
};
/** Doar metadate - folosit cand profesorul nu are acces la continut */
export type LessonStub = Pick<Lesson, 'id' | 'module_id' | 'title' | 'position'>;

export type ModuleNode = Module & { lessons: LessonStub[]; unlocked: boolean };
export type CourseNode = Course & { modules: ModuleNode[] };
export type PlatformNode = Platform & { courses: CourseNode[] };

export type Tree = PlatformNode[];

/** id-urile de continut deblocat pentru profesorul curent */
export type AccessMap = { modules: Set<string>; lessons: Set<string> };

/** Cursul grupei - leaga grupa de folderul de sabloane de diploma corespunzator, pentru
 * cursurile cunoscute (vezi COURSES din lib/diplomas.ts). `(string & {})` pastreaza
 * autocomplete-ul pe literalii cunoscuti, dar accepta si un curs custom (text liber,
 * introdus din "+ Alt curs..." la creare/editare clasa) - fara sablon de diploma asociat. */
export type CourseId = 'coblocks' | 'python' | 'roblox' | 'alfabetizare' | 'unity' | (string & {});

export type TrackerGroup = {
  id: string;
  teacher_id: string;
  group_name: string;
  module_count: number;
  reward_type: string;
  day_of_week: string | null;
  time_of_day: string | null;
  /** Cel mai mare multiplu de 16 lectii deja notificat/trimis (0 = niciunul inca). */
  diploma_milestone: number;
  course: CourseId | null;
  /** Link-ul Google Meet al clasei (editabil din antetul clasei in Tracker). */
  meet_link: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type TrackerStudent = {
  id: string;
  teacher_id: string;
  group_id: string;
  name: string;
  progress: number;
  /**
   * Decalaj manual de lectii (vezi src/lib/lessonNumbering.ts) - se aduna la numarul de
   * prezente+recuperari inregistrate in aplicatie ca sa dea numarul TOTAL de lectii efectuate,
   * folosit pentru afisarea compacta "M{modul} / L{lectie}". Setat de admin/profesor cand
   * elevul are istoric dinainte de a fi adaugat in Tracker (copii mai vechi) - ramane punctul
   * de pornire pentru toate calculele viitoare, care continua automat de acolo.
   */
  lesson_offset: number;
  /** Suprascriere manuala a totalului de prezente/absente - vezi formularul "Editeaza Elev". */
  presence_count: number;
  absence_count: number;
  /**
   * Task-uri urgente de diploma (vezi "🚨 Task-uri Urgente" din dashboard-ul profesorului):
   * pending = pragul (multiplu de 16 prezente) care asteapta diploma trimisa, null daca
   * elevul n-are niciun task deschis; last_issued = ultimul prag deja marcat ca trimis,
   * ca sa nu redeclansam popup-ul de celebrare pentru acelasi multiplu de doua ori.
   */
  pending_diploma_milestone: number | null;
  last_diploma_issued_milestone: number;
  /**
   * Momentul in care task-ul de diploma a devenit pending (intretinut automat de un trigger
   * SQL - vezi touch_pending_diploma_milestone in schema.sql, NU de cod din ProgressTracker.tsx).
   * Baza pentru alerta zilnica "diploma intarziata" (send_overdue_diploma_alerts, >= 3 zile lucratoare).
   */
  pending_diploma_milestone_at: string | null;
  /** Resetat automat la null de acelasi trigger ori de cate ori pending_diploma_milestone
   * se schimba - dedup pentru send_overdue_diploma_alerts (o singura alerta per task deschis). */
  diploma_overdue_alert_sent_at: string | null;
  /**
   * Numar de recuperari neefectuate (vezi "🚨 Task-uri Urgente" din dashboard-ul profesorului):
   * crescut cu 1 cand elevul e marcat "Absent" la o lectie, scazut cu 1 (fara sa scada sub 0)
   * cand absenta e anulata sau cand recuperarea e rezolvata din dashboard.
   */
  pending_makeups: number;
  /**
   * Ziua (YYYY-MM-DD) cand elevul a fost marcat "Absent" - porneste countdown-ul de 7 zile
   * din cardul de recuperare ("⏳ Mai sunt N zile"). Setat automat la prima absenta nerezolvata
   * (pending_makeups 0 -> 1), sters (null) cand recuperarea e rezolvata sau anulata din dashboard.
   */
  absence_date: string | null;
  /**
   * De cate ori s-a apasat "Trimite Notificare" pentru absenta curenta (max 3) - controleaza
   * cooldown-ul de 48h intre trimiteri si dezactivarea butonului dupa a 3-a. Resetat la 0
   * cand recuperarea e rezolvata/anulata din dashboard.
   */
  makeup_notification_count: number;
  /** Data/ora ultimei notificari trimise catre parinte - baza pentru cooldown-ul de 48h. */
  last_makeup_notification: string | null;
  /** true = profesorul a apasat "📅 Programat" - recuperarea e deja stabilita cu parintele.
   * Ascunde "Trimite Notificare"/"Nu mai e nevoie" din card; resetat cand alerta se inchide. */
  is_scheduled: boolean;
  /** Numele mic, folosit in notificarile catre parinti (spre deosebire de `name`). */
  short_name: string | null;
  /**
   * Pana la 5 telefoane/email-uri de parinte (format Green API pt telefoane, ex:
   * "40712345678@c.us") - GDPR: vizibile si editabile DOAR pentru admin (vezi isAdmin
   * in ProgressTracker.tsx si RLS-ul de mai jos). Profesorii nu primesc aceste coloane
   * in fetch-ul initial (progress/page.tsx).
   */
  parent_phones: string[];
  parent_emails: string[];
  /**
   * Statusul elevului (vezi butoanele din Fișa Elevului, StudentHistoryModal):
   * 'active' = normal, 'paused' = abonament întrerupt (lecțiile rămân înghețate,
   * nu se consumă), 'dropped_out' = abandon (a plecat din școală). Transferul la
   * alt profesor NU schimbă statusul - rămâne 'active', doar teacher_id/group_id
   * se schimbă (vezi transfer_student_teacher în schema.sql) - un transfer nu
   * contează niciodată ca abandon în src/lib/dropoutStats.
   */
  status: StudentStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_note: string | null;
  /** Tipul pachetului ales la înscriere - informativ, focusul tehnic e pe total_lessons_remaining. */
  subscription_type: SubscriptionType | null;
  /**
   * Individual sau Grup - controleaza DOAR ce optiuni de pachet apar in dropdown-ul Tip
   * Abonament din "Editeaza Elev" (vezi STUDY_MODE_SUBSCRIPTION_OPTIONS mai jos): 'lunar_4'
   * e disponibil doar pentru 'individual'. Independent de `format`-ul lectiilor (dedus automat
   * din numarul de elevi din grupa) - acesta e ales manual, per elev.
   */
  study_mode: StudyMode | null;
  /**
   * Soldul de lecții plătite, neconsumate încă (sistem pe bază de sold). Scade automat
   * cu 1 la prima marcare a unei prezențe (present/absent/made_up) pentru un elev -
   * vezi computeLessonBalanceDelta în attendanceTransition.ts. Crescut manual din
   * butonul "➕ Adaugă lecții" (StudentHistoryModal) când părintele reînnoiește
   * abonamentul - fiecare adăugare e logată în tracker_lesson_transactions.
   */
  total_lessons_remaining: number;
  /**
   * Numarul total de lectii din pachetul/abonamentul achizitionat (ex: 48) - setat din
   * formularul "Editeaza Elev". Impreuna cu `already_completed_lessons`, da soldul initial
   * la salvare: total_lessons_remaining = total_package_lessons - already_completed_lessons.
   */
  total_package_lessons: number;
  /**
   * Lectii efectuate deja de elev INAINTE de folosirea acestei platforme (istoric extern,
   * ex: 66) - baza statica, setata manual din "Editeaza Elev". Afisarea "Lectii efectuate"
   * din Fisa Elevului (StudentHistoryModal) o combina cu numarul de prezente/absente
   * inregistrate ulterior direct in aplicatie (vezi history in StudentHistoryModal).
   */
  already_completed_lessons: number;
  deleted_at: string | null;
  created_at: string;
};

/** Vezi comentariul câmpului `status` de mai sus. */
export type StudentStatus = 'active' | 'paused' | 'dropped_out';
export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Activ',
  paused: 'Întrerupt (Pauză)',
  dropped_out: 'Abandon',
};

/**
 * Vezi comentariul câmpului `subscription_type` de mai sus. Cele 4 valori legacy
 * (individual_lunar..grup_integral) raman doar pentru elevii care le au deja salvate dinainte -
 * formularul "Editeaza Elev" nu le mai ofera, a trecut pe pachetele cu numar fix de lectii de
 * mai jos (lunar_4..integral_48), alese din dropdown-ul dependent de `study_mode` (vezi
 * STUDY_MODE_SUBSCRIPTION_OPTIONS si PACKAGE_TIER_LESSONS).
 */
export type SubscriptionType =
  | 'individual_lunar' | 'individual_integral' | 'grup_lunar' | 'grup_integral'
  | 'lunar_4' | 'integral_16' | 'integral_32' | 'integral_48';
export const SUBSCRIPTION_TYPE_LABELS: Record<SubscriptionType, string> = {
  individual_lunar: 'Individual Lunar',
  individual_integral: 'Individual Integral',
  grup_lunar: 'Grup Lunar',
  grup_integral: 'Grup Integral',
  lunar_4: 'Lunar (4 Lecții)',
  integral_16: 'Integral - 16 Lecții',
  integral_32: 'Integral - 32 Lecții',
  integral_48: 'Integral - 48 Lecții',
};

/** Vezi comentariul câmpului `study_mode` de pe TrackerStudent mai sus. */
export type StudyMode = 'individual' | 'grup';
export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  individual: 'Individual',
  grup: 'Grup',
};

/**
 * Cate lectii seteaza automat fiecare pachet cu numar fix (dropdown-ul Tip Abonament din
 * "Editeaza Elev") in total_package_lessons - vezi handleEditStudent in ProgressTracker.tsx.
 * Valorile legacy (individual_lunar..grup_integral) nu au un numar fix asociat (istoric, fara
 * granularitate), deci lipsesc intentionat din aceasta harta.
 */
export const PACKAGE_TIER_LESSONS: Partial<Record<SubscriptionType, number>> = {
  lunar_4: 4,
  integral_16: 16,
  integral_32: 32,
  integral_48: 48,
};

/**
 * Optiunile de pachet oferite in dropdown-ul Tip Abonament, filtrate dupa Mod de Studiu ales
 * imediat deasupra - "Lunar (4 Lecții)" e disponibil DOAR pentru 'individual' (cerinta explicita
 * de business: nu exista abonament lunar de grup).
 */
export const STUDY_MODE_SUBSCRIPTION_OPTIONS: Record<StudyMode, SubscriptionType[]> = {
  individual: ['lunar_4', 'integral_16', 'integral_32', 'integral_48'],
  grup: ['integral_16', 'integral_32', 'integral_48'],
};

/** O intrare din jurnalul de modificări ale soldului de lecții (vezi tracker_lesson_transactions). */
export type TrackerLessonTransaction = {
  id: string;
  student_id: string;
  teacher_id: string;
  delta: number;
  reason: 'purchase' | 'adjustment';
  balance_after: number;
  /**
   * Pachetul cu numar fix de lectii ales la aceasta tranzactie (ex: 'integral_16') - completat
   * DOAR pentru reinnoirile facute din panoul de Management Abonament (Fisa Elevului, admin) sau
   * din selectorul de pachet al formularului Editeaza Elev. null pentru vechile tranzactii
   * "+ Adauga lectii" cu suma libera. Numaratoarea "Abonamentul #N" din Fisa Elevului = cate
   * randuri cu package_tier completat are elevul (vezi handleRenewSubscription).
   */
  package_tier: SubscriptionType | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/** Module noi, activabile per profesor de către Super Admin (vezi feature_access în schema.sql). */
export type FeatureModuleKey = 'subscriptions' | 'dropout_analytics';
export const FEATURE_MODULE_LABELS: Record<FeatureModuleKey, string> = {
  subscriptions: 'Pachete / Abonamente',
  dropout_analytics: 'Rata de Abandon',
};
export type FeatureAccess = {
  user_id: string;
  module_key: FeatureModuleKey;
  enabled: boolean;
  granted_by: string | null;
  granted_at: string;
};

/** O linie din raportul RPC teacher_dropout_stats (rata de abandon per profesor, la N luni). */
export type TeacherDropoutStat = {
  teacher_id: string;
  teacher_name: string;
  total_students: number;
  dropped_students: number;
  dropout_rate: number;
};

/** Tipul unei lectii, dedus AUTOMAT din numarul de elevi din grupa (1 = individual, >1 = grup). */
export type LessonKind = 'grup' | 'individual';

/** O lectie/sedinta tinuta pentru o grupa - baza pentru prezenta, stelute si Payslip. */
export type TrackerLesson = {
  id: string;
  teacher_id: string;
  group_id: string;
  session_number: number;
  /** Pozitia REALA in materie (M{x}/L{y}) - separata de session_number (contorul cronologic,
   * strict crescator, al sedintelor fizice). Ramane identica cu a lectiei anterioare daca
   * aceea a fost 100% absenta (vezi createLesson in ProgressTracker.tsx). */
  curriculum_index: number;
  lesson_date: string;
  lesson_time: string | null;
  format: LessonKind;
  /** false = "Neefectuată" - absolut toti elevii activi ai grupei au fost marcati Absenti la
   * aceasta lectie (recalculat automat la fiecare marcare de prezenta, vezi setAttendanceStatus
   * in ProgressTracker.tsx). Controleaza DOAR avansarea materiei (M/L, vezi createLesson) -
   * devine true si pe baza unui 'made_up' (recuperare), fara nicio sedinta live la lesson_date.
   * NU e folosit pentru Payslip-ul din /registru (ar dubla ora - vezi lib/registryCalc.ts,
   * care foloseste prezenta 'present' live, nu is_taught). Prezentele elevilor raman salvate
   * normal indiferent de acest flag (alertele de recuperare functioneaza la fel). */
  is_taught: boolean;
  /** Notita libera de tema pentru aceasta lectie (nu per elev), editabila din Tracker. */
  homework_note: string | null;
  created_at: string;
};

/** 'present' = prezent, 'absent' = absent (nerecuperat inca), 'made_up' = a recuperat lectia. */
export type AttendanceStatus = 'present' | 'absent' | 'made_up';

/**
 * Prezenta si steluta unui elev la o lectie - complet separate:
 * prezenta se bifeaza mereu, steluta doar daca a facut tema (se poate adauga retroactiv).
 * star_count e un multiplicator 0-3 (nu doar bifa facuta/nefacuta) - profesorul cicleaza
 * valoarea din click pe iconita. recovery_date/recovery_time = data/ora reala a sedintei
 * de recuperare (cand status = 'made_up'), diferita de data lectiei ratate initial -
 * alimenteaza Payslip-ul. recovery_group_id leaga mai multi elevi in ACEEASI sesiune de
 * recuperare de grup - vezi comentariul din schema.sql si Registru.tsx.
 */
export type TrackerAttendance = {
  id: string;
  teacher_id: string;
  lesson_id: string;
  student_id: string;
  status: AttendanceStatus;
  star_count: number;
  recovery_date: string | null;
  recovery_time: string | null;
  /** null = recuperare individuala; setat = recuperare de grup, impartita cu alti elevi care
   * au acelasi id - impreuna conteaza ca O SINGURA ora in Payslip (vezi Registru.tsx). */
  recovery_group_id: string | null;
  updated_at: string;
};

/** Categoriile de facturare afisate in Raportul Payslip din /registru. */
export type PayslipCategory = 'grup' | 'individual' | 'recuperare';

export const ENTITY_LABELS = {
  platform: 'Platformă',
  course: 'Curs',
  module: 'Modul',
  lesson: 'Lecție',
} as const;
export type EntityKind = keyof typeof ENTITY_LABELS;
