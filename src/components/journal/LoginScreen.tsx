import { useState } from "react";
import Icon from "@/components/ui/icon";

const API_ASSIGNEES = "https://functions.poehali.dev/defb4901-3a86-4c40-923f-96cdf4be23ac";

export interface Assignee {
  id: number;
  name: string;
  email: string;
}

export interface CurrentUser {
  role: "setter" | "executor";
  id: number;
  name: string;
  email: string;
  assignee?: Assignee;
}

export interface LoginScreenProps {
  onEnter: (user: CurrentUser) => void;
}

export default function LoginScreen({ onEnter }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setLoading(true);
    setError("");
    const res = await fetch(`${API_ASSIGNEES}?action=login&email=${encodeURIComponent(clean)}`);
    const data = await res.json();
    setLoading(false);
    if (res.status === 403 || data.error === "not_allowed") {
      setError("Этот email не найден в системе.");
      return;
    }
    if (!res.ok) {
      setError("Ошибка входа. Попробуй ещё раз.");
      return;
    }
    if (data.role === "setter") {
      onEnter({ role: "setter", id: data.id, name: data.name, email: data.email });
    } else {
      const assignee: Assignee = { id: data.id, name: data.name, email: data.email };
      onEnter({ role: "executor", id: data.id, name: data.name, email: data.email, assignee });
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
        <p className="text-gray-500 text-sm mb-6">Введи свой рабочий email</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleLogin(); }}
              placeholder="you@dosfond.ru"
              className="w-full border border-gray-300 rounded-lg px-3.5 py-3 text-sm text-[#1A5276] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
            />
          </div>
          {error && <p className="text-[#7B241C] text-xs bg-[#FDEDEC] rounded px-3 py-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={!email.trim() || loading}
            className="w-full bg-[#1E3A5F] text-white rounded-xl py-3 font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Проверяем..." : "Войти"}
          </button>
          <div className="bg-[#F4F6F9] rounded-lg px-4 py-3 text-[11px] text-gray-500 flex items-start gap-2">
            <Icon name="Info" size={13} className="text-gray-400 shrink-0 mt-0.5" />
            <span>Доступ только для сотрудников ДОС Фонда. Используй корпоративный email.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
