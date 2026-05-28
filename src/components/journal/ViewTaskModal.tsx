import Icon from "@/components/ui/icon";
import { CurrentUser } from "./LoginScreen";

type Status = "Новая" | "В работе" | "На проверке" | "Выполнена" | "Просрочена";

const STATUS_CONFIG: Record<Status, { color: string; bg: string }> = {
  "Новая":       { color: "text-[#1E3A5F]",  bg: "bg-[#E8EFF7]" },
  "В работе":    { color: "text-[#1A5276]",  bg: "bg-[#D6EAF8]" },
  "На проверке": { color: "text-[#7D6608]",  bg: "bg-[#FEF9E7]" },
  "Выполнена":   { color: "text-[#145A32]",  bg: "bg-[#E9F7EF]" },
  "Просрочена":  { color: "text-[#7B241C]",  bg: "bg-[#FDEDEC]" },
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isOverdue(deadline: string, status: Status) {
  if (status === "Выполнена") return false;
  return new Date(deadline) < new Date();
}

export interface Comment {
  id: number;
  task_id: number;
  text: string;
  created_at: string;
  assignee: { id: number; name: string; tag: string };
}

export interface ViewTask {
  id: number;
  title: string;
  deadline: string;
  status: Status;
  assignee: { id: number; name: string; tag: string } | null;
}

export interface ViewTaskModalProps {
  viewTask: ViewTask;
  currentUser: CurrentUser;
  comments: Comment[];
  commentsLoading: boolean;
  commentText: string;
  commentSaving: boolean;
  setCommentText: (v: string) => void;
  onSubmitComment: () => void;
  onClose: () => void;
}

export default function ViewTaskModal({
  viewTask,
  currentUser,
  comments,
  commentsLoading,
  commentText,
  commentSaving,
  setCommentText,
  onSubmitComment,
  onClose,
}: ViewTaskModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md flex flex-col max-h-[90vh] animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-[#1E3A5F] uppercase tracking-widest">Задача</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmitComment(); } }}
                  placeholder="Написать комментарий..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                />
                <p className="text-[10px] text-gray-400 mt-1 text-right">{commentText.length}/100</p>
              </div>
              <button
                onClick={onSubmitComment}
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
  );
}