import { useState, useMemo, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import LoginScreen, { Assignee, CurrentUser } from "@/components/journal/LoginScreen";
import AppHeader from "@/components/journal/AppHeader";
import TaskModal, { TaskForm } from "@/components/journal/TaskModal";
import ViewTaskModal, { Comment, ViewTask } from "@/components/journal/ViewTaskModal";

const API_ASSIGNEES = "https://functions.poehali.dev/defb4901-3a86-4c40-923f-96cdf4be23ac";
const API_TASKS = "https://functions.poehali.dev/53d318bd-f60a-459d-b3d4-4a534d7989b4";
const LS_KEY = "journal_user_v2";

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";
type Tab = "active" | "archive";

interface Task {
  id: number;
  title: string;
  deadline: string;
  status: Status;
  assignee: { id: number; name: string; tag: string } | null;
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

// ─── Голосовой ввод ───────────────────────────────────────────────────────────

interface VoiceParsed {
  title: string;
  status?: Status;
  deadline?: string;
  assignee_id?: string;
}

function parseVoiceText(raw: string, assignees: { id: number; name: string; telegram_username: string }[] = []): VoiceParsed {
  let text = raw.trim();

  const statusMap: { pattern: RegExp; value: Status }[] = [
    { pattern: /\b(в работе|в работу|берём в работу|начали|начинаем)\b/i, value: "В работе" },
    { pattern: /\b(на проверке|проверка|на проверку|проверить)\b/i, value: "На проверке" },
    { pattern: /\b(выполнена|выполнено|готово|завершена|сделано)\b/i, value: "Выполнена" },
    { pattern: /\b(просрочена|просрочено|просрочена)\b/i, value: "Просрочена" },
    { pattern: /\b(новая|новая задача)\b/i, value: "Новая" },
  ];
  let foundStatus: Status | undefined;
  for (const s of statusMap) {
    if (s.pattern.test(text)) {
      foundStatus = s.value;
      text = text.replace(s.pattern, "").trim();
      break;
    }
  }

  const today = new Date();
  let foundDeadline: string | undefined;

  if (/\bсегодня\b/i.test(text)) {
    foundDeadline = today.toISOString().slice(0, 10);
    text = text.replace(/\bсегодня\b/i, "").trim();
  } else if (/\bзавтра\b/i.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    foundDeadline = d.toISOString().slice(0, 10);
    text = text.replace(/\bзавтра\b/i, "").trim();
  } else if (/\bпослезавтра\b/i.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    foundDeadline = d.toISOString().slice(0, 10);
    text = text.replace(/\bпослезавтра\b/i, "").trim();
  } else {
    const m = text.match(/через\s+(\d+|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять)\s+(день|дня|дней)/i);
    if (m) {
      const numMap: Record<string, number> = { один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
      const n = isNaN(Number(m[1])) ? (numMap[m[1].toLowerCase()] ?? 1) : Number(m[1]);
      const d = new Date(today); d.setDate(d.getDate() + n);
      foundDeadline = d.toISOString().slice(0, 10);
      text = text.replace(m[0], "").trim();
    } else {
      const monthMap: Record<string, number> = {
        января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
        июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
      };
      const mDate = text.match(/(?:до|к|на|срок)\s+(\d{1,2})(?:\.(\d{1,2})|\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря))/i);
      if (mDate) {
        const day = parseInt(mDate[1]);
        const month = mDate[2] ? parseInt(mDate[2]) - 1 : monthMap[mDate[3].toLowerCase()];
        const year = today.getFullYear();
        const d = new Date(year, month, day);
        if (d < today) d.setFullYear(year + 1);
        foundDeadline = d.toISOString().slice(0, 10);
        text = text.replace(mDate[0], "").trim();
      }
    }
  }

  let foundAssigneeId: string | undefined;
  if (assignees.length > 0) {
    const lower = text.toLowerCase();
    let bestMatch: { id: number; score: number } | null = null;
    for (const a of assignees) {
      const nameParts = a.name.toLowerCase().split(/\s+/);
      let score = 0;
      for (const part of nameParts) {
        if (part.length >= 3 && lower.includes(part)) score++;
      }
      if (lower.includes(a.name.toLowerCase())) score += 5;
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: a.id, score };
      }
    }
    if (bestMatch) {
      foundAssigneeId = String(bestMatch.id);
      const matched = assignees.find(a => a.id === bestMatch!.id)!;
      for (const part of matched.name.split(/\s+/)) {
        if (part.length >= 3) {
          text = text.replace(new RegExp(part, "gi"), "").trim();
        }
      }
    }
    const forMatch = text.match(/(?:для|назначь|исполнитель|ответственный)[:\s]+([а-яё\s]+?)(?:\s+(?:до|к|на|через|сегодня|завтра|срок)|$)/i);
    if (forMatch && !foundAssigneeId) {
      const candidate = forMatch[1].trim().toLowerCase();
      for (const a of assignees) {
        const nameParts = a.name.toLowerCase().split(/\s+/);
        if (nameParts.some(p => p.length >= 3 && candidate.includes(p))) {
          foundAssigneeId = String(a.id);
          text = text.replace(forMatch[0], "").trim();
          break;
        }
      }
    }
  }

  text = text.replace(/^(задача|задачу|задание|поставь|создай|добавь|нужно|надо)[:\s]*/i, "").trim();
  text = text.replace(/[,\s]+$/, "").trim();

  return { title: text || raw.trim(), status: foundStatus, deadline: foundDeadline, assignee_id: foundAssigneeId };
}

function useVoiceInput(onResult: (parsed: VoiceParsed) => void, assignees: { id: number; name: string; email: string }[] = []) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognition | null>(null);
  const assigneesRef = useRef(assignees);
  assigneesRef.current = assignees;

  function start() {
    const SR = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition || (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ru-RU";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      onResult(parseVoiceText(text, assigneesRef.current));
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");

  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDeadline, setFilterDeadline] = useState<"all" | "today" | "week" | "overdue">("all");

  const [taskModal, setTaskModal] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>({ title: "", assignee_id: "", deadline: "", status: "Новая" });
  const [saving, setSaving] = useState(false);

  const [viewTask, setViewTask] = useState<ViewTask | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const isAdmin = currentUser?.role === "setter";

  const { listening, start: startVoice, stop: stopVoice } = useVoiceInput((parsed) => {
    setTaskForm(f => ({
      ...f,
      title: parsed.title,
      ...(parsed.status ? { status: parsed.status } : {}),
      ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
      ...(parsed.assignee_id ? { assignee_id: parsed.assignee_id } : {}),
    }));
    if (!taskModal) setTaskModal(true);
  }, assignees);

  useEffect(() => {
    // Сначала пробуем сессию из LS_KEY
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.role) { setCurrentUser(parsed); return; }
      } catch { /* ignore */ }
    }
    // Иначе — автовход по сохранённым email+pwd
    const savedEmail = localStorage.getItem("journal_saved_email");
    const savedPwd = localStorage.getItem("journal_saved_pwd");
    if (savedEmail && savedPwd) {
      fetch(`${API_ASSIGNEES}?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: savedEmail, password: savedPwd }),
      }).then(r => r.json()).then(data => {
        if (data.role) {
          const user: CurrentUser = data.role === "setter"
            ? { role: "setter", id: data.id, name: data.name, email: data.email }
            : { role: "executor", id: data.id, name: data.name, email: data.email, assignee: { id: data.id, name: data.name, email: data.email } };
          setCurrentUser(user);
        }
      }).catch(() => {});
    }
  }, []);

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

  useEffect(() => {
    if (currentUser?.role === "executor" && currentUser.assignee) {
      setFilterAssignee(String(currentUser.assignee.id));
    }
  }, [currentUser]);

  function handleEnter(user: CurrentUser) {
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
      setter_email: currentUser?.email ?? "",
    };
    if (editTask) {
      body.id = editTask.id;
      const res = await fetch(API_TASKS, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const raw = await res.json();
      const updated: Task = typeof raw === "string" ? JSON.parse(raw) : raw;
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
    const body = { id: task.id, status: "Выполнена", setter_email: currentUser?.email ?? "" };
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
      <AppHeader
        currentUser={currentUser}
        isAdmin={isAdmin}
        listening={listening}
        onStartVoice={startVoice}
        onStopVoice={stopVoice}
        onAddTask={openAddTask}
        onLogout={handleLogout}
      />

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
                  {assignees.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
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

      {isAdmin && taskModal && (
        <TaskModal
          editTask={editTask}
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          assignees={assignees}
          saving={saving}
          listening={listening}
          onStartVoice={startVoice}
          onStopVoice={stopVoice}
          onSave={saveTask}
          onClose={() => setTaskModal(false)}
        />
      )}

      {viewTask && (
        <ViewTaskModal
          viewTask={viewTask}
          currentUser={currentUser}
          comments={comments}
          commentsLoading={commentsLoading}
          commentText={commentText}
          commentSaving={commentSaving}
          setCommentText={setCommentText}
          onSubmitComment={submitComment}
          onClose={() => setViewTask(null)}
        />
      )}
    </div>
  );
}