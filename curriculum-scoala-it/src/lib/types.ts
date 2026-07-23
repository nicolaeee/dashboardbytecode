export type Role = 'admin' | 'teacher';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
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
  teacher_project_url: string;
  student_project_url: string;
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

export type TrackerGroup = {
  id: string;
  teacher_id: string;
  group_name: string;
  module_count: number;
  reward_type: string;
  day_of_week: string | null;
  time_of_day: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type TrackerStudent = {
  id: string;
  teacher_id: string;
  group_id: string;
  name: string;
  progress: number;
  deleted_at: string | null;
  created_at: string;
};

export const ENTITY_LABELS = {
  platform: 'Platformă',
  course: 'Curs',
  module: 'Modul',
  lesson: 'Lecție',
} as const;
export type EntityKind = keyof typeof ENTITY_LABELS;
