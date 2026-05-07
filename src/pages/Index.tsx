import { useState, useMemo, useEffect } from "react";
import Icon from "@/components/ui/icon";

const API_ASSIGNEES = "https://functions.poehali.dev/defb4901-3a86-4c40-923f-96cdf4be23ac";
const API_TASKS = "https://functions.poehali.dev/53d318bd-f60a-459d-b3d4-4a534d7989b4";

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";

interface Assignee {
  id: number;
  name: string;
  tag: string;
  email?: string;
}

interface Task {
  id: number;
  title: string;
  deadline: string;
  status: Status;
  assignee: Assignee | null;
}

const STATUS_CONFIG: Record<Status, { color: string; bg: string }> = {
  "Новая":       { color: "text-[#1E3A5F]",  bg: "bg-[#E8EFF7]" },
  "В работе":    { color: "text-[#1A5276]",  bg: "bg-[#D6EAF8]" },
  "На проверке": { color: "text-[#7D6608]",  bg: "bg-[#FEF9E7]" },
  "Выполнена":   { color: "text-[#145A32]",  bg: "bg-[#E9F7EF]" },
  "Просрочена":  { color: "text-[#7B241C]",  bg: "bg-[#FDEDEC]" },
};

const ALL_STATUSES: Status[] = ["Новая", "В работе", "На проверке", "Выполнена", "Просрочена"];

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isOverdue(deadline: string, status: Status) {
  if (status === "Выполнена") return false;
  return new Date(deadline) < new Date();
}

type ModalMode = "task" | "assignee" | null;

export default function Index() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDeadline, setFilterDeadline] = useState<"all" | "today" | "week" | "overdue">("all");

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", assignee_id: "" as string | number, deadline: "", status: "Новая" as Status, setter: "7@dosfond.ru" });
  const [assigneeForm, setAssigneeForm] = useState({ name: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [newTag, setNewTag] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(API_ASSIGNEES).then(r => r.json()),
      fetch(API_TASKS).then(r => r.json()),
    ]).then(([a, t]) => {
      setAssignees(Array.isArray(a) ? a : JSON.parse(a));
      setTasks(Array.isArray(t) ? t : JSON.parse(t));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterAssignee !== "all" && String(t.assignee?.id) !== filterAssignee) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterDeadline !== "all") {
        const d = new Date(t.deadline);
        d.setHours(0, 0, 0, 0);
        if (filterDeadline === "today" && d.getTime() !== today.getTime()) return false;
        if (filterDeadline === "week" && (d < today || d > weekEnd)) return false;
        if (filterDeadline === "overdue" && !isOverdue(t.deadline, t.status)) return false;
      }
      return true;
    });
  }, [tasks, filterAssignee, filterStatus, filterDeadline]);

  function openAddTask() {
    setEditTask(null);
    setTaskForm({ title: "", assignee_id: "", deadline: "", status: "Новая", setter: "7@dosfond.ru" });
    setModalMode("task");
  }

  function openEditTask(task: Task) {
    setEditTask(task);
    setTaskForm({
      title: task.title,
      assignee_id: task.assignee?.id ?? "",
      deadline: task.deadline,
      status: task.status,
      setter: "7@dosfond.ru",
    });
    setModalMode("task");
  }

  function openAddAssignee() {
    setAssigneeForm({ name: "", email: "" });
    setNewTag(null);
    setModalMode("assignee");
  }

  async function saveTask() {
    if (!taskForm.title.trim() || !taskForm.deadline) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      title: taskForm.title,
      deadline: taskForm.deadline,
      status: taskForm.status,
      assignee_id: taskForm.assignee_id || null,
      setter: taskForm.setter,
    };
    if (editTask) {
      body.id = editTask.id;
      const res = await fetch(API_TASKS, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const raw = await res.json();
      const updated: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
      setTasks(ts => ts.map(t => t.id === editTask.id ? updated : t));
    } else {
      const res = await fetch(API_TASKS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const raw = await res.json();
      const created: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
      setTasks(ts => [created, ...ts]);
    }
    setSaving(false);
    setModalMode(null);
  }

  async function saveAssignee() {
    if (!assigneeForm.name.trim()) return;
    setSaving(true);
    const res = await fetch(API_ASSIGNEES, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: assigneeForm.name, email: assigneeForm.email || null }),
    });
    const raw = await res.json();
    const created: Assignee = typeof raw === "string" ? JSON.parse(raw) : raw;
    setAssignees(prev => [...prev, created]);
    setNewTag(created.tag);
    setSaving(false);
  }

  const hasFilters = filterAssignee !== "all" || filterStatus !== "all" || filterDeadline !== "all";

  return (
    <div className="min-h-screen bg-[#F4F6F9] font-sans">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-8 py-5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 bg-white/15 rounded flex items-center justify-center">
            <Icon name="ClipboardList" size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-wide leading-tight">Журнал задач</h1>
            <p className="text-white/50 text-[11px] tracking-widest uppercase">Учебные материалы</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openAddAssignee}
            className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-4 py-2 text-sm font-medium rounded hover:bg-white/20 transition-colors"
          >
            <Icon name="UserPlus" size={15} />
            Добавить исполнителя
          </button>
          <button
            onClick={openAddTask}
            className="flex items-center gap-2 bg-white text-[#1E3A5F] px-4 py-2 text-sm font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
          >
            <Icon name="Plus" size={16} />
            Добавить задачу
          </button>
        </div>
      </header>

      <main className="px-8 py-6 max-w-7xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {ALL_STATUSES.map(s => {
            const count = tasks.filter(t => t.status === s).length;
            const cfg = STATUS_CONFIG[s];
            return (
              <div key={s} className="bg-white border border-gray-200 rounded p-4 flex flex-col gap-1.5">
                <span className="text-2xl font-bold text-[#1E3A5F]">{count}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded w-fit ${cfg.bg} ${cfg.color}`}>{s}</span>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded p-4 mb-4 flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Исполнитель</label>
            <select
              value={filterAssignee}
              onChange={e => setFilterAssignee(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] min-w-[200px]"
            >
              <option value="all">Все исполнители</option>
              {assignees.map(a => <option key={a.id} value={String(a.id)}>{a.name} {a.tag}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Статус</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] min-w-[160px]"
            >
              <option value="all">Все статусы</option>
              {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Сроки</label>
            <select
              value={filterDeadline}
              onChange={e => setFilterDeadline(e.target.value as typeof filterDeadline)}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] min-w-[160px]"
            >
              <option value="all">Все сроки</option>
              <option value="today">Сегодня</option>
              <option value="week">На этой неделе</option>
              <option value="overdue">Просроченные</option>
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setFilterAssignee("all"); setFilterStatus("all"); setFilterDeadline("all"); }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1E3A5F] transition-colors pb-0.5"
            >
              <Icon name="X" size={14} />
              Сбросить
            </button>
          )}

          <div className="ml-auto flex items-end pb-0.5">
            <span className="text-sm text-gray-400">
              Найдено: <strong className="text-[#1E3A5F]">{filtered.length}</strong>
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1E3A5F] text-white">
                <th className="text-left px-4 py-3.5 font-semibold w-16 text-[10px] uppercase tracking-widest">№</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest">Название задачи</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-56">Исполнитель</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-32">Срок</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-36">Статус</th>
                <th className="px-4 py-3.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">
                    <Icon name="Loader2" size={28} className="mx-auto mb-2 text-gray-300 animate-spin" />
                    <p className="text-sm">Загрузка...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-gray-400">
                    <Icon name="SearchX" size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Задачи не найдены</p>
                  </td>
                </tr>
              ) : (
                filtered.map((task, idx) => {
                  const cfg = STATUS_CONFIG[task.status];
                  const overdue = isOverdue(task.deadline, task.status);
                  return (
                    <tr
                      key={task.id}
                      className={`border-t border-gray-100 hover:bg-[#F0F5FA] transition-colors ${idx % 2 !== 0 ? "bg-[#FAFBFC]" : ""}`}
                    >
                      <td className="px-4 py-3.5 text-gray-400 font-mono text-xs">{String(task.id).padStart(3, "0")}</td>
                      <td className="px-4 py-3.5 text-[#1E3A5F] font-medium">{task.title}</td>
                      <td className="px-4 py-3.5">
                        {task.assignee ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 text-sm">{task.assignee.name}</span>
                            <span className="text-[11px] font-mono text-[#1A5276] bg-[#D6EAF8] px-1.5 py-0.5 rounded">{task.assignee.tag}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-sm italic">не назначен</span>
                        )}
                      </td>
                      <td className={`px-4 py-3.5 font-mono text-xs ${overdue ? "text-[#7B241C] font-bold" : "text-gray-600"}`}>
                        {formatDate(task.deadline)}
                        {overdue && <span className="ml-1.5">●</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded ${cfg.bg} ${cfg.color}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button onClick={() => openEditTask(task)} className="text-gray-300 hover:text-[#1E3A5F] transition-colors">
                          <Icon name="Pencil" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Task Modal */}
      {modalMode === "task" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalMode(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">
                {editTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <Icon name="X" size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Название задачи</label>
                <input
                  value={taskForm.title}
                  onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Введите название..."
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Исполнитель</label>
                <select
                  value={String(taskForm.assignee_id)}
                  onChange={e => setTaskForm(f => ({ ...f, assignee_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
                >
                  <option value="">Не назначен</option>
                  {assignees.map(a => (
                    <option key={a.id} value={String(a.id)}>{a.name} — {a.tag}</option>
                  ))}
                </select>
                {assignees.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1.5">Нет исполнителей — сначала зарегистрируйте их</p>
                )}
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
                  {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Постановщик</label>
                <select
                  value={taskForm.setter}
                  onChange={e => setTaskForm(f => ({ ...f, setter: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
                >
                  <option value="7@dosfond.ru">7@dosfond.ru</option>
                  <option value="1@dosfond.ru">1@dosfond.ru</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalMode(null)}
                className="flex-1 border border-gray-300 text-gray-600 rounded py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={saveTask}
                disabled={!taskForm.title.trim() || !taskForm.deadline || saving}
                className="flex-1 bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Сохранение..." : editTask ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignee Modal */}
      {modalMode === "assignee" && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { if (!newTag) setModalMode(null); }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">Новый исполнитель</h2>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <Icon name="X" size={18} />
              </button>
            </div>

            {newTag ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-[#E9F7EF] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="CheckCircle2" size={28} className="text-[#145A32]" />
                </div>
                <p className="text-[#1E3A5F] font-semibold text-base mb-1">{assigneeForm.name}</p>
                <p className="text-gray-500 text-sm mb-4">успешно зарегистрирован</p>
                <div className="bg-[#D6EAF8] rounded-lg px-6 py-3 inline-block">
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Личный тег</p>
                  <span className="font-mono text-[#1A5276] font-bold text-xl">{newTag}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-3">Используйте тег при назначении задач исполнителю</p>
                <button
                  onClick={() => setModalMode(null)}
                  className="mt-5 w-full bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] transition-colors"
                >
                  Готово
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Полное имя</label>
                    <input
                      value={assigneeForm.name}
                      onChange={e => setAssigneeForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Фамилия Имя Отчество"
                      className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                      onKeyDown={e => { if (e.key === "Enter") saveAssignee(); }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Email для уведомлений</label>
                    <input
                      type="email"
                      value={assigneeForm.email}
                      onChange={e => setAssigneeForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="example@mail.ru"
                      className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                    />
                  </div>
                  <div className="bg-[#F4F6F9] rounded p-3 text-[11px] text-gray-500 flex items-start gap-2">
                    <Icon name="Info" size={13} className="text-gray-400 mt-0.5 shrink-0" />
                    <span>Тег генерируется автоматически. При указании email исполнитель будет получать письма о новых задачах</span>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setModalMode(null)}
                    className="flex-1 border border-gray-300 text-gray-600 rounded py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={saveAssignee}
                    disabled={!assigneeForm.name.trim() || saving}
                    className="flex-1 bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? "Создание..." : "Зарегистрировать"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}