import Icon from "@/components/ui/icon";
import { CurrentUser } from "./LoginScreen";

export interface AppHeaderProps {
  currentUser: CurrentUser;
  isAdmin: boolean;
  listening: boolean;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onAddTask: () => void;
  onLogout: () => void;
}

export default function AppHeader({
  currentUser,
  isAdmin,
  listening,
  onStartVoice,
  onStopVoice,
  onAddTask,
  onLogout,
}: AppHeaderProps) {
  return (
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
            <Icon name="User" size={12} className="text-white/60" />
            <span className="text-white/80 text-xs">{currentUser.name}</span>
          </div>
          {isAdmin && (
            <>
              <button
                onClick={listening ? onStopVoice : onStartVoice}
                title="Голосовой ввод задачи"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${listening ? "bg-red-500 text-white animate-pulse" : "bg-white/10 border border-white/20 text-white hover:bg-white/20"}`}
              >
                <Icon name="Mic" size={14} />
                <span className="hidden sm:inline">{listening ? "Говорите..." : "Голос"}</span>
              </button>
              <button
                onClick={onAddTask}
                className="flex items-center gap-1.5 bg-white text-[#1E3A5F] px-2.5 py-1.5 text-xs font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
              >
                <Icon name="Plus" size={14} />
                <span className="hidden sm:inline">Добавить задачу</span>
              </button>
            </>
          )}
          <button onClick={onLogout} className="text-white/50 hover:text-white transition-colors p-1" title="Выйти">
            <Icon name="LogOut" size={16} />
          </button>
        </div>
      </div>
      {/* Мобильные кнопки */}
      {isAdmin && (
        <div className="flex sm:hidden gap-2 mt-3">
          <button
            onClick={listening ? onStopVoice : onStartVoice}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded transition-colors ${listening ? "bg-red-500 text-white animate-pulse" : "bg-white/10 border border-white/20 text-white hover:bg-white/20"}`}
          >
            <Icon name="Mic" size={14} />
            {listening ? "Говорите..." : "Голосовой ввод"}
          </button>
          <button
            onClick={onAddTask}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white text-[#1E3A5F] py-2 text-xs font-semibold rounded hover:bg-[#E8EFF7] transition-colors"
          >
            <Icon name="Plus" size={14} />
            Добавить задачу
          </button>
        </div>
      )}
    </header>
  );
}