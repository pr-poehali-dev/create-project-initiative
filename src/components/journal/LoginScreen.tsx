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
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Экран первичной установки пароля
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [setPwdLoading, setSetPwdLoading] = useState(false);

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPwd = password.trim();
    if (!cleanEmail || !cleanPwd) return;
    setLoading(true);
    setError("");

    const res = await fetch(`${API_ASSIGNEES}?action=login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: cleanPwd }),
    });
    const data = await res.json();
    setLoading(false);

    if (data.error === "no_password") {
      setSettingPassword(true);
      return;
    }
    if (data.error === "wrong_password") {
      setError("Неверный пароль.");
      return;
    }
    if (res.status === 403 || data.error === "not_allowed") {
      setError("Этот email не найден в системе.");
      return;
    }
    if (!res.ok) {
      setError("Ошибка входа. Попробуй ещё раз.");
      return;
    }

    enterUser(data, remember, password.trim());
  }

  async function handleSetPassword() {
    if (newPassword.length < 4) {
      setError("Пароль должен быть не короче 4 символов.");
      return;
    }
    if (newPassword !== newPassword2) {
      setError("Пароли не совпадают.");
      return;
    }
    setSetPwdLoading(true);
    setError("");

    const res = await fetch(`${API_ASSIGNEES}?action=set_password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password: newPassword }),
    });
    const data = await res.json();
    setSetPwdLoading(false);

    if (data.error === "password_already_set") {
      setError("Пароль уже установлен. Введи его на экране входа.");
      setSettingPassword(false);
      return;
    }
    if (!res.ok) {
      setError("Ошибка. Попробуй ещё раз.");
      return;
    }

    enterUser(data, remember, newPassword);
  }

  function enterUser(data: { role: string; id: number; name: string; email: string }, save: boolean, pwd: string) {
    const user: CurrentUser = data.role === "setter"
      ? { role: "setter", id: data.id, name: data.name, email: data.email }
      : { role: "executor", id: data.id, name: data.name, email: data.email, assignee: { id: data.id, name: data.name, email: data.email } };

    if (save) {
      localStorage.setItem("journal_saved_email", data.email);
      localStorage.setItem("journal_saved_pwd", pwd);
    } else {
      localStorage.removeItem("journal_saved_email");
      localStorage.removeItem("journal_saved_pwd");
    }
    onEnter(user);
  }

  const Logo = () => (
    <div className="flex items-center gap-3 mb-8">
      <div className="w-10 h-10 bg-[#1E3A5F] rounded-lg flex items-center justify-center">
        <Icon name="ClipboardList" size={22} className="text-white" />
      </div>
      <div>
        <p className="text-[#1E3A5F] font-bold text-base leading-tight">Журнал задач</p>
        <p className="text-gray-400 text-xs">ДОС Фонд</p>
      </div>
    </div>
  );

  // ── Экран установки пароля ────────────────────────────────────────────────
  if (settingPassword) {
    return (
      <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
          <Logo />
          <h2 className="text-[#1E3A5F] font-bold text-xl mb-1">Придумай пароль</h2>
          <p className="text-gray-500 text-sm mb-6">Первый вход — установи пароль для входа в систему.</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Новый пароль</label>
              <div className="relative">
                <input
                  type={showNewPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Минимум 4 символа"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-3 pr-10 text-sm text-[#1A5276] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
                />
                <button type="button" onClick={() => setShowNewPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <Icon name={showNewPwd ? "EyeOff" : "Eye"} size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Повтори пароль</label>
              <input
                type={showNewPwd ? "text" : "password"}
                value={newPassword2}
                onChange={e => setNewPassword2(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSetPassword(); }}
                placeholder="Ещё раз"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-3 text-sm text-[#1A5276] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
              />
            </div>
            {error && <p className="text-[#7B241C] text-xs bg-[#FDEDEC] rounded px-3 py-2">{error}</p>}
            <button
              onClick={handleSetPassword}
              disabled={!newPassword || !newPassword2 || setPwdLoading}
              className="w-full bg-[#1E3A5F] text-white rounded-xl py-3 font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {setPwdLoading ? "Сохраняем..." : "Установить и войти"}
            </button>
            <button onClick={() => { setSettingPassword(false); setError(""); }} className="text-sm text-gray-400 hover:text-gray-600 text-center">
              ← Назад
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Экран входа ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F4F6F9] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <Logo />
        <h2 className="text-[#1E3A5F] font-bold text-xl mb-1">Вход</h2>
        <p className="text-gray-500 text-sm mb-6">Введи рабочий email и пароль</p>

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
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">Пароль</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleLogin(); }}
                placeholder="Твой пароль"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-3 pr-10 text-sm text-[#1A5276] focus:outline-none focus:border-[#1E3A5F] placeholder:text-gray-300"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={e => setRemember(e.target.checked)}
              className="w-4 h-4 accent-[#1E3A5F] cursor-pointer"
            />
            <span className="text-sm text-gray-500">Запомнить меня в этом браузере</span>
          </label>
          {error && <p className="text-[#7B241C] text-xs bg-[#FDEDEC] rounded px-3 py-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={!email.trim() || !password.trim() || loading}
            className="w-full bg-[#1E3A5F] text-white rounded-xl py-3 font-semibold hover:bg-[#16304F] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Проверяем..." : "Войти"}
          </button>
          <div className="bg-[#F4F6F9] rounded-lg px-4 py-3 text-[11px] text-gray-500 flex items-start gap-2">
            <Icon name="Info" size={13} className="text-gray-400 shrink-0 mt-0.5" />
            <span>При первом входе система предложит придумать пароль.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
