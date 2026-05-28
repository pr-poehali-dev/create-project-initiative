import Icon from "@/components/ui/icon";
import { Assignee } from "./LoginScreen";

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";

const ACTIVE_STATUSES: Status[] = ["Новая", "В работе", "На проверке", "Просрочена"];

export interface TaskForm {
  title: string;
  assignee_id: string;
  deadline: string;
  status: Status;
}

export interface TaskModalProps {
  editTask: { id: number; title: string } | null;
  taskForm: TaskForm;
  setTaskForm: React.Dispatch<React.SetStateAction<TaskForm>>;
  assignees: Assignee[];
  saving: boolean;
  listening: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSave: () => void;
  onClose: () => void;
}

export default function TaskModal({
  editTask,
  taskForm,
  setTaskForm,
  assignees,
  saving,
  listening,
  onStartVoice,
  onStopVoice,
  onSave,
  onClose,
}: TaskModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">
            {editTask ? "Редактировать задачу" : "Новая задача"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Название задачи</label>
            <div className="relative">
              <input
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Введите название..."
                className="w-full border border-gray-300 rounded px-3 py-2.5 pr-10 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
              />
              <button
                type="button"
                onClick={listening ? onStopVoice : onStartVoice}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors ${listening ? "text-red-500 animate-pulse" : "text-gray-300 hover:text-[#1E3A5F]"}`}
                title="Голосовой ввод"
              >
                <Icon name="Mic" size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Исполнитель</label>
            <select
              value={taskForm.assignee_id}
              onChange={e => setTaskForm(f => ({ ...f, assignee_id: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
            >
              <option value="">Не назначен</option>
              {assignees.map(a => (
                <option key={a.id} value={String(a.id)}>{a.name} — {a.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Срок выполнения</label>
            <input
              type="date"
              value={taskForm.deadline}
              onChange={e => setTaskForm(f => ({ ...f, deadline: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Статус</label>
            <select
              value={taskForm.status}
              onChange={e => setTaskForm(f => ({ ...f, status: e.target.value as Status }))}
              className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
            >
              {ACTIVE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 rounded py-2.5 text-sm font-semibold hover:bg-gray-50">
            Отмена
          </button>
          <button
            onClick={onSave}
            disabled={!taskForm.title.trim() || !taskForm.deadline || saving}
            className="flex-1 bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Сохранение..." : editTask ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}