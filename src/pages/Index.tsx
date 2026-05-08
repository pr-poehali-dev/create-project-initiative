import { useState, useMemo, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";

const API_ASSIGNEES = "https://functions.poehali.dev/defb4901-3a86-4c40-923f-96cdf4be23ac";
const API_TASKS = "https://functions.poehali.dev/53d318bd-f60a-459d-b3d4-4a534d7989b4";
const LS_KEY = "journal_user_v2";

// Постановщики (по TG username lowercase)
const SETTER_TGS = ["vyacheslav_dof", "big_nick87"];

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";
type Tab = "active" | "archive";

interface Assignee {
  id: number;
  name: string;
  telegram_username: string;
  telegram_chat_id?: number | null;
}

interface Task {
  id: number;
  title: string;
  deadline: string;
  status: Status;
  assignee: { id: number; name: string; tag: string } | null;
}

interface Comment {
  id: number;
  task_id: number;
  text: string;
  created_at: string;
  assignee: { id: number; name: string; tag: string };
}

const STATUS_CONFIG: Record<Status, { color: string; bg: string }> = {
  "Новая":       { color: "text-[#1E3A5F]",  bg: "bg-[#E8EFF7]" },
  "В работе":    { color: "text-[#1A5276]",  bg: "bg-[#D6EAF8]" },
  "На проверке": { color: "text-[#7D6608]",  bg: "bg-[#FEF9E7]" },
  "Выполнена":   { color: "text-[#145A32]",  bg: "bg-[#E9F7EF]" },
  "Просрочена":  { color: "text-[#7B241C]",  bg: "bg-[#FDEDEC]" },
};

const ACTIVE_STATUSES: Status[] = ["Новая", "В работе", "На проверке", "Просрочена"];

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isOverdue(deadline: string, status: Status) {
  if (status === "Выполнена") return false;
  return new Date(deadline) < new Date();
}

// ─── Экран входа ──────────────────────────────────────────────────────────────

interface LoginScreenProps {
  onEnter: (user: { role: "setter" | "executor"; tg: string; assignee?: Assignee }) => void;
}

function LoginScreen({ onEnter }: LoginScreenProps) {
  const [tg, setTg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    const clean = tg.trim().lstrip?.("@") ?? tg.trim().replace(/^@/, "");
    if (!clean) return;
    setLoading(true);
    setError("");
    const res = await fetch(`${API_ASSIGNEES}?action=login&tg=@${clean}`);
    const data = await res.json();
    setLoading(false);
    if (res.status === 403 || data.error === "not_allowed") {
      setError("Тебя нет в списке пользователей системы.");
      return;
    }
    if (!res.ok) {
      setError("Ошибка входа. Попробуй ещё раз.");
      return;
    }
    if (data.role === "setter") {
      onEnter({ role: "setter", tg: clean });
    } else {
      onEnter({ role: "executor", tg: clean, assignee: data });
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#1E3A5F] rounded-lg flex items-center justify-center">
            <Icon name="ClipboardList" size={22} className="text-white" />
          </div>
          <div>
            <p className="text-[#1E3A5F] font-bold text-base leading-tight">Журнал задач</p>
            <p className="text-gray-400 text-xs">ДОС Фонд</p>
          </div>
        </div>

        <h2 className="text-[#1E3A5F] font-bold text-xl mb-1">Вход</h2>
        <p className="text-gray-500 text-sm mb-6">Введи свой Telegram username</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Telegram username</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-sm">@</span>
              <input
                value={tg.replace(/^@/, "")}
                onChange={e => setTg(e.target.value.replace(/^@/, ""))}
                onKeyDown={e => { if (e.key === "Enter") handleLogin(); }}
                placeholder="username"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3.5 py-3 text-sm font-mono text-[#1A5276] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
              />
            </div>
          </div>
          {error && <p className="text-[#7B241C] text-xs bg-[#FDEDEC] rounded px-3 py-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={!tg.replace(/^@/, "").trim() || loading}
            className="w-full bg-[#1E3A5F] text-white rounded-xl py-3 font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Проверяем..." : "Войти"}
          </button>
          <div className="bg-[#F4F6F9] rounded-lg px-4 py-3 text-[11px] text-gray-500 flex items-start gap-2">
            <Icon name="Info" size={13} className="text-gray-400 shrink-0 mt-0.5" />
            <span>Доступ только для сотрудников ДОС Фонда. Используй свой Telegram username без @.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Голосовой ввод ───────────────────────────────────────────────────────────

function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);

  function start() {
    const SR = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      onResult(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  return { listening, start, stop };
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export default function Index() {
  const [currentUser, setCurrentUser] = useState<{ role: "setter" | "executor"; tg: string; assignee?: Assignee } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");

  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDeadline, setFilterDeadline] = useState<"all" | "today" | "week" | "overdue">("all");

  // Task modal
  const [taskModal, setTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({ title: "", assignee_id: "", deadline: "", status: "Новая" as Status });
  const [saving, setSaving] = useState(false);

  // View task + comments
  const [viewTask, setViewTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const isAdmin = currentUser?.role === "setter";

  // Voice input
  const { listening, start: startVoice, stop: stopVoice } = useVoiceInput((text) => {
    setTaskForm(f => ({ ...f, title: text }));
    if (!taskModal) setTaskModal(true);
  });

  // Restore session
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.role) setCurrentUser(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  // Load data
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    Promise.all([
      fetch(API_ASSIGNEES).then(r => r.json()),
      fetch(API_TASKS).then(r => r.json()),
      fetch(`${API_TASKS}?archived=1`).then(r => r.json()),
    ]).then(([a, t, ar]) => {
      setAssignees(Array.isArray(a) ? a : []);
      setTasks(Array.isArray(t) ? t : []);
      setArchivedTasks(Array.isArray(ar) ? ar : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [currentUser]);

  // Auto-filter for executor
  useEffect(() => {
    if (currentUser?.role === "executor" && currentUser.assignee) {
      setFilterAssignee(String(currentUser.assignee.id));
    }
  }, [currentUser]);

  function handleEnter(user: { role: "setter" | "executor"; tg: string; assignee?: Assignee }) {
    localStorage.setItem(LS_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }

  function handleLogout() {
    localStorage.removeItem(LS_KEY);
    setCurrentUser(null);
    setFilterAssignee("all");
    setFilterStatus("all");
    setFilterDeadline("all");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const activeTasks = useMemo(() => tasks.filter(t => {
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
  }), [tasks, filterAssignee, filterStatus, filterDeadline]);

  const filteredArchive = useMemo(() => {
    if (!isAdmin) return archivedTasks.filter(t => t.assignee?.id === currentUser?.assignee?.id);
    return archivedTasks;
  }, [archivedTasks, isAdmin, currentUser]);

  function openAddTask() {
    setEditTask(null);
    setTaskForm({ title: "", assignee_id: "", deadline: "", status: "Новая" });
    setTaskModal(true);
  }

  function openEditTask(task: Task) {
    setEditTask(task);
    setTaskForm({
      title: task.title,
      assignee_id: String(task.assignee?.id ?? ""),
      deadline: task.deadline,
      status: task.status,
    });
    setTaskModal(true);
  }

  async function saveTask() {
    if (!taskForm.title.trim() || !taskForm.deadline) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      title: taskForm.title,
      deadline: taskForm.deadline,
      status: taskForm.status,
      assignee_id: taskForm.assignee_id || null,
      setter_tg: currentUser?.tg ?? "",
    };
    if (editTask) {
      body.id = editTask.id;
      const res = await fetch(API_TASKS, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const raw = await res.json();
      const updated: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
      // Если статус стал Выполнена — переносим в архив
      if (updated.status === "Выполнена") {
        setTasks(ts => ts.filter(t => t.id !== editTask.id));
        setArchivedTasks(ar => [updated, ...ar.filter(t => t.id !== updated.id)]);
      } else {
        setTasks(ts => ts.map(t => t.id === editTask.id ? updated : t));
      }
    } else {
      const res = await fetch(API_TASKS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const raw = await res.json();
      const created: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
      setTasks(ts => [created, ...ts]);
    }
    setSaving(false);
    setTaskModal(false);
  }

  async function completeTask(task: Task) {
    const body = { id: task.id, status: "Выполнена", setter_tg: currentUser?.tg ?? "" };
    const res = await fetch(API_TASKS, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const raw = await res.json();
    const updated: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
    setTasks(ts => ts.filter(t => t.id !== task.id));
    setArchivedTasks(ar => [updated, ...ar]);
  }

  async function deleteTask(task: Task) {
    if (!confirm(`Удалить задачу «${task.title}»? Это действие нельзя отменить.`)) return;
    await fetch(`${API_TASKS}?id=${task.id}`, { method: "DELETE" });
    setTasks(ts => ts.filter(t => t.id !== task.id));
    setArchivedTasks(ar => ar.filter(t => t.id !== task.id));
    if (viewTask?.id === task.id) setViewTask(null);
  }

  async function openViewTask(task: Task) {
    setViewTask(task);
    setCommentText("");
    setCommentsLoading(true);
    const res = await fetch(`${API_TASKS}?comments=1&task_id=${task.id}`);
    const raw = await res.json();
    setComments(Array.isArray(raw) ? raw : []);
    setCommentsLoading(false);
  }

  async function submitComment() {
    if (!commentText.trim() || !viewTask || !currentUser?.assignee) return;
    setCommentSaving(true);
    const res = await fetch(`${API_TASKS}?action=comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: viewTask.id, assignee_id: currentUser.assignee.id, text: commentText.trim() }),
    });
    const raw = await res.json();
    const created = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (created.id) {
      setComments(c => [...c, created]);
      setCommentText("");
    }
    setCommentSaving(false);
  }

  const hasFilters = filterAssignee !== "all" || filterStatus !== "all" || filterDeadline !== "all";

  if (!currentUser) {
    return <LoginScreen onEnter={handleEnter} />;
  }

  const displayedTasks = tab === "active" ? activeTasks : filteredArchive;

  return (
    <div className="min-h-screen bg-[#F4F6F9] font-sans">
      {/* Header */}
      <header className="bg-[#1E3A5F] text-white px-4 md:px-8 py-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/15 rounded flex items-center justify-center shrink-0">
              <Icon name="ClipboardList" size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Журнал задач</h1>
              <p className="text-white/50 text-[11px] leading-tight">ДОС Фонд</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 px-2.5 py-1.5 rounded">
              <Icon name="Send" size={12} className="text-white/60" />
              <span className="text-white/80 font-mono text-xs">@{currentUser.tg}</span>
            </div>
            {isAdmin && (
              <>
                {/* Голосовой ввод */}
                <button
                  onClick={listening ? stopVoice : startVoice}
                  title="Голосовой ввод задачи"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${listening ? "bg-red-500 text-white animate-pulse" : "bg-white/10 border border-white/20 text-white hover:bg-white/20"}`}
                >
                  <Icon name="Mic" size={14} />
                  <span className="hidden sm:inline">{listening ? "Говорите..." : "Голос"}</span>
                </button>
                <button
                  onClick={openAddTask}
                  className="flex items-center gap-1.5 bg-white text-[#1E3A5F] px-2.5 py-1.5 text-xs font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
                >
                  <Icon name="Plus" size={14} />
                  <span className="hidden sm:inline">Добавить задачу</span>
                </button>
              </>
            )}
            <button onClick={handleLogout} className="text-white/50 hover:text-white transition-colors p-1" title="Выйти">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
        {/* Мобильные кнопки */}
        {isAdmin && (
          <div className="flex sm:hidden gap-2 mt-3">
            <button
              onClick={listening ? stopVoice : startVoice}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors ${listening ? "bg-red-500 text-white animate-pulse" : "bg-white/10 border border-white/20 text-white hover:bg-white/20"}`}
            >
              <Icon name="Mic" size={14} />
              {listening ? "Говорите..." : "Голосовой ввод"}
            </button>
            <button
              onClick={openAddTask}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white text-[#1E3A5F] py-2 text-xs font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
            >
              <Icon name="Plus" size={14} />
              Добавить задачу
            </button>
          </div>
        )}
      </header>

      <main className="px-4 md:px-8 py-4 md:py-6 max-w-7xl mx-auto">

        {/* Вкладки */}
        <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded p-1 w-fit">
          <button
            onClick={() => setTab("active")}
            className={`px-4 py-2 text-sm font-semibold rounded transition-colors ${tab === "active" ? "bg-[#1E3A5F] text-white" : "text-gray-500 hover:text-[#1E3A5F]"}`}
          >
            Активные
            {tasks.length > 0 && (
              <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${tab === "active" ? "bg-white/20 text-white" : "bg-[#E8EFF7] text-[#1E3A5F]"}`}>
                {tasks.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`px-4 py-2 text-sm font-semibold rounded transition-colors flex items-center gap-1.5 ${tab === "archive" ? "bg-[#1E3A5F] text-white" : "text-gray-500 hover:text-[#1E3A5F]"}`}
          >
            <Icon name="Archive" size={14} />
            Архив
            {archivedTasks.length > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === "archive" ? "bg-white/20 text-white" : "bg-[#E8EFF7] text-[#1E3A5F]"}`}>
                {archivedTasks.length}
              </span>
            )}
          </button>
        </div>

        {/* Статистика (только активные) */}
        {tab === "active" && (
          <div className="grid grid-cols-4 gap-2 md:gap-3 mb-4">
            {ACTIVE_STATUSES.map(s => {
              const count = tasks.filter(t => t.status === s).length;
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={s} className="bg-white border border-gray-200 rounded p-2 md:p-4 flex flex-col gap-1">
                  <span className="text-xl md:text-2xl font-bold text-[#1E3A5F]">{count}</span>
                  <span className={`text-[9px] md:text-[11px] font-semibold px-1.5 py-0.5 rounded w-fit ${cfg.bg} ${cfg.color}`}>{s}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Фильтры (только активные и только для постановщика) */}
        {tab === "active" && (
          <div className="bg-white border border-gray-200 rounded p-3 md:p-4 mb-4 flex flex-col md:flex-row flex-wrap gap-3 md:gap-4 md:items-end">
            {isAdmin && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Исполнитель</label>
                <select
                  value={filterAssignee}
                  onChange={e => setFilterAssignee(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F] w-full md:min-w-[200px]"
                >
                  <option value="all">Все исполнители</option>
                  {assignees.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.telegram_username})</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Статус</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
                >
                  <option value="all">Все статусы</option>
                  {ACTIVE_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Сроки</label>
                <select
                  value={filterDeadline}
                  onChange={e => setFilterDeadline(e.target.value as typeof filterDeadline)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm text-[#1E3A5F] bg-white focus:outline-none focus:border-[#1E3A5F]"
                >
                  <option value="all">Все сроки</option>
                  <option value="today">Сегодня</option>
                  <option value="week">На неделе</option>
                  <option value="overdue">Просроченные</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between md:contents">
              {hasFilters && (
                <button
                  onClick={() => { setFilterStatus("all"); setFilterDeadline("all"); if (isAdmin) setFilterAssignee("all"); }}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#1E3A5F] transition-colors"
                >
                  <Icon name="X" size={14} />
                  Сбросить
                </button>
              )}
              <span className="text-sm text-gray-400 md:ml-auto">
                Найдено: <strong className="text-[#1E3A5F]">{activeTasks.length}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Таблица — десктоп */}
        <div className="hidden md:block bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1E3A5F] text-white">
                <th className="text-left px-4 py-3.5 font-semibold w-16 text-[10px] uppercase tracking-widest">№</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest">Название задачи</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-52">Исполнитель</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-32">Срок</th>
                <th className="text-left px-4 py-3.5 font-semibold text-[10px] uppercase tracking-widest w-36">Статус</th>
                {isAdmin && <th className="px-4 py-3.5 w-24 text-[10px] uppercase tracking-widest text-center">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-16 text-gray-400">
                  <Icon name="Loader2" size={28} className="mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Загрузка...</p>
                </td></tr>
              ) : displayedTasks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-gray-400">
                  <Icon name={tab === "archive" ? "Archive" : "SearchX"} size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">{tab === "archive" ? "Архив пуст" : "Задачи не найдены"}</p>
                </td></tr>
              ) : (
                displayedTasks.map((task, idx) => {
                  const cfg = STATUS_CONFIG[task.status];
                  const overdue = isOverdue(task.deadline, task.status);
                  return (
                    <tr key={task.id} onClick={() => openViewTask(task)} className={`border-t border-gray-100 hover:bg-[#F0F5FA] transition-colors cursor-pointer ${idx % 2 !== 0 ? "bg-[#FAFBFC]" : ""}`}>
                      <td className="px-4 py-3.5 text-gray-400 font-mono text-xs">{String(task.id).padStart(3, "0")}</td>
                      <td className="px-4 py-3.5 text-[#1E3A5F] font-medium">{task.title}</td>
                      <td className="px-4 py-3.5">
                        {task.assignee ? (
                          <span className="font-mono text-xs text-[#1A5276] bg-[#D6EAF8] px-2 py-0.5 rounded">{task.assignee.tag}</span>
                        ) : (
                          <span className="text-gray-300 text-sm italic">не назначен</span>
                        )}
                      </td>
                      <td className={`px-4 py-3.5 font-mono text-xs ${overdue ? "text-[#7B241C] font-bold" : "text-gray-600"}`}>
                        {formatDate(task.deadline)}{overdue && <span className="ml-1">●</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded ${cfg.bg} ${cfg.color}`}>{task.status}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEditTask(task)} className="text-gray-300 hover:text-[#1E3A5F] transition-colors" title="Редактировать">
                              <Icon name="Pencil" size={15} />
                            </button>
                            {tab === "active" && (
                              <button onClick={() => completeTask(task)} className="text-gray-300 hover:text-[#145A32] transition-colors" title="Завершить задачу">
                                <Icon name="CheckCircle2" size={15} />
                              </button>
                            )}
                            <button onClick={() => deleteTask(task)} className="text-gray-300 hover:text-red-500 transition-colors" title="Удалить задачу">
                              <Icon name="Trash2" size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Карточки — мобильный */}
        <div className="md:hidden flex flex-col gap-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">
              <Icon name="Loader2" size={28} className="mx-auto mb-2 animate-spin" />
            </div>
          ) : displayedTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Icon name={tab === "archive" ? "Archive" : "SearchX"} size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{tab === "archive" ? "Архив пуст" : "Задачи не найдены"}</p>
            </div>
          ) : (
            displayedTasks.map(task => {
              const cfg = STATUS_CONFIG[task.status];
              const overdue = isOverdue(task.deadline, task.status);
              return (
                <div key={task.id} onClick={() => openViewTask(task)} className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer active:bg-[#F0F5FA]">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-[#1E3A5F] font-semibold text-sm leading-snug flex-1">{task.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded ${cfg.bg} ${cfg.color}`}>{task.status}</span>
                      {isAdmin && tab === "active" && (
                        <button
                          onClick={e => { e.stopPropagation(); completeTask(task); }}
                          className="text-gray-300 hover:text-[#145A32] transition-colors"
                          title="Завершить"
                        >
                          <Icon name="CheckCircle2" size={16} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); openEditTask(task); }}
                          className="text-gray-300 hover:text-[#1E3A5F] transition-colors"
                        >
                          <Icon name="Pencil" size={15} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteTask(task); }}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Удалить"
                        >
                          <Icon name="Trash2" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
                    {task.assignee && (
                      <span className="font-mono text-[#1A5276] bg-[#D6EAF8] px-1.5 py-0.5 rounded">{task.assignee.tag}</span>
                    )}
                    <span className={`flex items-center gap-1 font-mono ${overdue ? "text-[#7B241C] font-bold" : ""}`}>
                      <Icon name="Calendar" size={12} className="text-gray-400" />
                      {formatDate(task.deadline)}{overdue && " ●"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Task Modal */}
      {isAdmin && taskModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setTaskModal(false)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">
                {editTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button onClick={() => setTaskModal(false)} className="text-gray-400 hover:text-gray-600">
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
                    onClick={listening ? stopVoice : startVoice}
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
                    <option key={a.id} value={String(a.id)}>{a.name} — {a.telegram_username}</option>
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
              <button onClick={() => setTaskModal(false)} className="flex-1 border border-gray-300 text-gray-600 rounded py-2.5 text-sm font-semibold hover:bg-gray-50">
                Отмена
              </button>
              <button
                onClick={saveTask}
                disabled={!taskForm.title.trim() || !taskForm.deadline || saving}
                className="flex-1 bg-[#1E3A5F] text-white rounded py-2.5 text-sm font-semibold hover:bg-[#16304F] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "Сохранение..." : editTask ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Task + Comments */}
      {viewTask && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setViewTask(null)}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">Задача</h2>
              <button onClick={() => setViewTask(null)} className="text-gray-400 hover:text-gray-600">
                <Icon name="X" size={18} />
              </button>
            </div>
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-[#1E3A5F] font-semibold text-base mb-3">{viewTask.title}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                {viewTask.assignee && (
                  <span className="font-mono text-[#1A5276] bg-[#D6EAF8] px-2 py-0.5 rounded">{viewTask.assignee.tag}</span>
                )}
                <span className={`flex items-center gap-1 font-mono ${isOverdue(viewTask.deadline, viewTask.status) ? "text-[#7B241C] font-bold" : "text-gray-600"}`}>
                  <Icon name="Calendar" size={12} />
                  {formatDate(viewTask.deadline)}
                </span>
                <span className={`px-2 py-0.5 rounded font-semibold ${STATUS_CONFIG[viewTask.status].bg} ${STATUS_CONFIG[viewTask.status].color}`}>
                  {viewTask.status}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2 min-h-[80px]">
              {commentsLoading ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Icon name="Loader2" size={20} className="animate-spin mr-2" />
                  <span className="text-sm">Загрузка...</span>
                </div>
              ) : comments.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-4">Комментариев пока нет</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="bg-[#F4F6F9] rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-[#1A5276] bg-[#D6EAF8] px-1.5 py-0.5 rounded">{c.assignee.tag}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(c.created_at).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-[#1E3A5F]">{c.text}</p>
                  </div>
                ))
              )}
            </div>
            {currentUser.role === "executor" && viewTask.assignee?.id === currentUser.assignee?.id && (
              <div className="px-6 pb-5 pt-3 border-t border-gray-100">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value.slice(0, 100))}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                      placeholder="Написать комментарий..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 text-right">{commentText.length}/100</p>
                  </div>
                  <button
                    onClick={submitComment}
                    disabled={!commentText.trim() || commentSaving}
                    className="mb-5 bg-[#1E3A5F] text-white rounded-lg px-3 py-2.5 hover:bg-[#16304F] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon name="Send" size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}