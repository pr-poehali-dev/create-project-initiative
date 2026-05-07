import { useState, useMemo } from "react";
import Icon from "@/components/ui/icon";

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";

interface Task {
  id: number;
  title: string;
  assignee: string;
  deadline: string;
  status: Status;
}

const INITIAL_TASKS: Task[] = [
  { id: 1, title: "Подготовить учебный план на семестр", assignee: "Иванова А.С.", deadline: "2026-05-15", status: "В работе" },
  { id: 2, title: "Разработать тестовые задания по теме «Алгебра»", assignee: "Петров Д.Н.", deadline: "2026-05-10", status: "Новая" },
  { id: 3, title: "Проверить контрольные работы — 10Б", assignee: "Смирнова Е.В.", deadline: "2026-05-08", status: "На проверке" },
  { id: 4, title: "Оформить журнал успеваемости за апрель", assignee: "Иванова А.С.", deadline: "2026-05-01", status: "Выполнена" },
  { id: 5, title: "Подготовить материалы к открытому уроку", assignee: "Козлов М.Р.", deadline: "2026-04-28", status: "Просрочена" },
  { id: 6, title: "Составить расписание консультаций", assignee: "Петров Д.Н.", deadline: "2026-05-20", status: "Новая" },
  { id: 7, title: "Загрузить презентации в общий доступ", assignee: "Смирнова Е.В.", deadline: "2026-05-12", status: "В работе" },
  { id: 8, title: "Сформировать отчёт по посещаемости", assignee: "Козлов М.Р.", deadline: "2026-05-07", status: "Выполнена" },
];

const STATUS_CONFIG: Record<Status, { color: string; bg: string }> = {
  "Новая":       { color: "text-[#1E3A5F]",  bg: "bg-[#E8EFF7]" },
  "В работе":    { color: "text-[#1A5276]",  bg: "bg-[#D6EAF8]" },
  "На проверке": { color: "text-[#7D6608]",  bg: "bg-[#FEF9E7]" },
  "Выполнена":   { color: "text-[#145A32]",  bg: "bg-[#E9F7EF]" },
  "Просрочена":  { color: "text-[#7B241C]",  bg: "bg-[#FDEDEC]" },
};

const ALL_STATUSES: Status[] = ["Новая", "В работе", "На проверке", "Выполнена", "Просрочена"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isOverdue(deadline: string, status: Status) {
  if (status === "Выполнена") return false;
  return new Date(deadline) < new Date();
}

export default function Index() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [filterAssignee, setFilterAssignee] = useState("Все");
  const [filterStatus, setFilterStatus] = useState("Все");
  const [filterDeadline, setFilterDeadline] = useState<"all" | "today" | "week" | "overdue">("all");
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ title: "", assignee: "", deadline: "", status: "Новая" as Status });

  const assignees = useMemo(() => {
    const unique = Array.from(new Set(tasks.map(t => t.assignee)));
    return ["Все", ...unique];
  }, [tasks]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (filterAssignee !== "Все" && t.assignee !== filterAssignee) return false;
      if (filterStatus !== "Все" && t.status !== filterStatus) return false;
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

  function openAdd() {
    setEditTask(null);
    setForm({ title: "", assignee: "", deadline: "", status: "Новая" });
    setShowModal(true);
  }

  function openEdit(task: Task) {
    setEditTask(task);
    setForm({ title: task.title, assignee: task.assignee, deadline: task.deadline, status: task.status });
    setShowModal(true);
  }

  function saveTask() {
    if (!form.title.trim() || !form.assignee.trim() || !form.deadline) return;
    if (editTask) {
      setTasks(ts => ts.map(t => t.id === editTask.id ? { ...t, ...form } : t));
    } else {
      const newId = Math.max(0, ...tasks.map(t => t.id)) + 1;
      setTasks(ts => [...ts, { id: newId, ...form }]);
    }
    setShowModal(false);
  }

  function deleteTask(id: number) {
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  const hasFilters = filterAssignee !== "Все" || filterStatus !== "Все" || filterDeadline !== "all";

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
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-white text-[#1E3A5F] px-4 py-2 text-sm font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
        >
          <Icon name="Plus" size={16} />
          Добавить задачу
        </button>
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
              className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] min-w-[180px]"
            >
              {assignees.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Статус</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] min-w-[160px]"
            >
              <option>Все</option>
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
              onClick={() => { setFilterAssignee("Все"); setFilterStatus("Все"); setFilterDeadline("all"); }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1E3A5F] transition-colors pb-0.5"
            >
              <Icon name="X" size={14} />
              Сбросить фильтры
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
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-44">Исполнитель</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-32">Срок</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-36">Статус</th>
                <th className="px-4 py-3.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
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
                      <td className="px-4 py-3.5 text-gray-600 text-sm">{task.assignee}</td>
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
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEdit(task)} className="text-gray-300 hover:text-[#1E3A5F] transition-colors">
                            <Icon name="Pencil" size={15} />
                          </button>
                          <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-[#7B241C] transition-colors">
                            <Icon name="Trash2" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">
                {editTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <Icon name="X" size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Название задачи</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Введите название..."
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Исполнитель</label>
                <input
                  value={form.assignee}
                  onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                  placeholder="Фамилия И.О."
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Срок выполнения</label>
                <input
                  type="date"
                  value={form.deadline}
                  onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F]"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Статус</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}
                  className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
                >
                  {ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 rounded py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={saveTask}
                disabled={!form.title.trim() || !form.assignee.trim() || !form.deadline}
                className="flex-1 bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editTask ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
