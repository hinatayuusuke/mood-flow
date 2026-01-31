export type Task = {
  id: string;
  title: string;
  description: string | null;
  estimated_time: number | null;
  energy_level: number | null;
  is_completed: boolean;
  created_at: string;
};

