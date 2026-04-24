import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Tasks from "./Tasks.jsx";
import Clients from "./Clients.jsx";
import Branches from "./Branches.jsx";
import SellOut from "./SellOut.jsx";
import { supabase } from "./supabaseClient";
import "./index.css";

const MOBILE_THEME = {
  appBackground: "radial-gradient(1200px 500px at 0% -10%, #243744 0%, #121b22 45%, #0b1014 100%)",
  surface: "#182129",
  surfaceSoft: "#121920",
  surfaceStrong: "#0f151b",
  border: "#2f3d49",
  borderSoft: "#334756",
  text: "#eaf1f4",
  mutedText: "#9fb1bb",
  overlay: "rgba(6,10,13,.62)",
  ctaGradient: "linear-gradient(180deg,#f97316,#ea580c)",
  ctaShadow: "0 10px 28px rgba(249,115,22,.36)",
  activeByTab: {
    today: "linear-gradient(180deg,#0ea5e9,#0284c7)",
    tasks: "linear-gradient(180deg,#f97316,#ea580c)",
    clients: "linear-gradient(180deg,#14b8a6,#0f766e)",
    branches: "linear-gradient(180deg,#22c55e,#15803d)",
    sellout: "linear-gradient(180deg,#8b5cf6,#6d28d9)",
    inbox: "linear-gradient(180deg,#06b6d4,#0e7490)",
  },
};

function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  if (!r) return "";
  if (r === "admin") return "admin";
  if (r === "rkp") return "RKP";
  if (r === "kam") return "KAM";
  if (r === "jkam") return "JKAM";
  if (r === "regional_manager" || r === "regional" || r === "regional manager") {
    return "regional_manager";
  }
  return role;
}

function resolveResponsibleAssignment(users, responsibleValue) {
  const rawValue = responsibleValue == null ? "" : String(responsibleValue).trim();
  if (!rawValue) {
    return { responsible: null, responsible_id: null };
  }

  const matchedUser = (users || []).find((user) => {
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    const usernameWithAt = user?.username ? `@${user.username}` : "";
    return (
      String(user?.id || "") === rawValue ||
      String(user?.telegram_id || "") === rawValue ||
      fullName === rawValue ||
      usernameWithAt === rawValue
    );
  });

  if (!matchedUser) {
    return { responsible: rawValue, responsible_id: null };
  }

  return {
    responsible: matchedUser.telegram_id ? String(matchedUser.telegram_id) : null,
    responsible_id: matchedUser.id || null,
  };
}

function clearLocalAccessContext() {
  localStorage.removeItem("currentUserRole");
  localStorage.removeItem("currentUserPrimaryClient");
  localStorage.removeItem("currentUserId");
  localStorage.removeItem("currentUserBranchId");
  localStorage.removeItem("currentAuthUserId");
}

function withTimeout(promise, timeoutMs = 15000, message = "Превышено время ожидания запроса.") {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function mapLoginErrorMessage(error, authHost) {
  const raw = String(error?.message || "").trim();
  const msg = raw.toLowerCase();

  if (!raw) return "Не удалось выполнить вход.";
  if (msg.includes("email not confirmed")) {
    return "Email не подтвержден. Подтвердите почту по ссылке из письма и повторите вход.";
  }
  if (msg.includes("invalid login credentials")) {
    return "Неверный email или пароль.";
  }
  if (msg.includes("too many requests")) {
    return "Слишком много попыток входа. Подождите минуту и попробуйте снова.";
  }
  if (
    msg.includes("failed to fetch") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("network") ||
    msg.includes("timeout")
  ) {
    return `Сервис авторизации недоступен (${authHost}). Проверьте интернет и VITE_SUPABASE_URL.`;
  }
  return raw;
}

const pageShellStyle = {
  minHeight: "100vh",
  background: "#0b1014",
  color: "#eaf1f4",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
};

const cardStyle = {
  background: "#182129",
  padding: "24px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,.45)",
  width: "min(420px, 100%)",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: "8px",
  background: "#0f151b",
  border: "1px solid #334756",
  color: "#eaf1f4",
};

const primaryButtonStyle = {
  marginTop: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700,
  background: "linear-gradient(180deg,#f97316,#ea580c)",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  marginTop: 8,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700,
  background: "#182129",
  color: "#eaf1f4",
  border: "1px solid #334756",
  cursor: "pointer",
};

function AuthLayout({ title, subtitle, children }) {
  return (
    <div style={pageShellStyle}>
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h2>
        {subtitle ? <p style={{ color: "#9fb1bb", marginTop: 0 }}>{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}

function LoginPage({ onLogin, loading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <AuthLayout title="Вход в CRM">
      <form onSubmit={submit}>
        <p style={{ margin: "8px 0" }}>Email</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          autoComplete="email"
          style={inputStyle}
        />

        <p style={{ margin: "8px 0" }}>Пароль</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          style={inputStyle}
        />

        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>

      <button onClick={() => navigate("/forgot-password")} style={secondaryButtonStyle}>
        Забыли пароль?
      </button>
      <button onClick={() => navigate("/register")} style={secondaryButtonStyle}>
        Нет профиля? Зарегистрируйтесь с рабочей почтой
      </button>

      {error ? <p style={{ color: "#e31b23", marginTop: 10 }}>{error}</p> : null}
    </AuthLayout>
  );
}

function SignupPage({ onSignup, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Введите email.");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    const result = await onSignup(email, password);
    if (result.ok) {
      setSuccess(result.message);
      setPassword("");
      setConfirmPassword("");
      return;
    }
    setError(result.message);
  };

  return (
    <AuthLayout title="Регистрация" subtitle="Создайте аккаунт по email и паролю">
      <form onSubmit={submit}>
        <p style={{ margin: "8px 0" }}>Email</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          autoComplete="email"
          style={inputStyle}
        />

        <p style={{ margin: "8px 0" }}>Пароль</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          style={inputStyle}
        />

        <p style={{ margin: "8px 0" }}>Повторите пароль</p>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Повторите пароль"
          autoComplete="new-password"
          style={inputStyle}
        />

        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          {loading ? "Создаем..." : "Создать аккаунт"}
        </button>
      </form>

      <button onClick={() => navigate("/forgot-password")} style={secondaryButtonStyle}>
        Забыли пароль?
      </button>
      <button onClick={() => navigate("/login")} style={secondaryButtonStyle}>
        Уже есть аккаунт
      </button>

      {error ? <p style={{ color: "#e31b23", marginTop: 10 }}>{error}</p> : null}
      {success ? <p style={{ color: "#5fd38d", marginTop: 10 }}>{success}</p> : null}
    </AuthLayout>
  );
}

function ForgotPasswordPage({ onForgot, loading }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Введите email.");
      return;
    }

    const result = await onForgot(email);
    if (result.ok) {
      setSuccess(result.message);
      return;
    }
    setError(result.message);
  };

  return (
    <AuthLayout title="Восстановление пароля" subtitle="Введите email, отправим письмо для сброса пароля">
      <form onSubmit={submit}>
        <p style={{ margin: "8px 0" }}>Email</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          autoComplete="email"
          style={inputStyle}
        />

        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          {loading ? "Отправляем..." : "Отправить письмо"}
        </button>
      </form>

      <p style={{ marginTop: 12, color: "#9fb1bb" }}>
        <Link to="/login" style={{ color: "#eaf1f4" }}>Вернуться ко входу</Link>
      </p>

      {error ? <p style={{ color: "#e31b23", marginTop: 10 }}>{error}</p> : null}
      {success ? <p style={{ color: "#5fd38d", marginTop: 10 }}>{success}</p> : null}
    </AuthLayout>
  );
}

function ResetPasswordPage({ onReset, loading }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    const result = await onReset(password);
    if (result.ok) {
      setSuccess(result.message);
      setPassword("");
      setConfirmPassword("");
      return;
    }
    setError(result.message);
  };

  return (
    <AuthLayout title="Новый пароль" subtitle="Установите новый пароль для аккаунта">
      <form onSubmit={submit}>
        <p style={{ margin: "8px 0" }}>Новый пароль</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          style={inputStyle}
        />

        <p style={{ margin: "8px 0" }}>Повторите пароль</p>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Повторите пароль"
          autoComplete="new-password"
          style={inputStyle}
        />

        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          {loading ? "Сохраняем..." : "Сохранить пароль"}
        </button>
      </form>

      <p style={{ marginTop: 12, color: "#9fb1bb" }}>
        <Link to="/login" style={{ color: "#eaf1f4" }}>Перейти ко входу</Link>
      </p>

      {error ? <p style={{ color: "#e31b23", marginTop: 10 }}>{error}</p> : null}
      {success ? <p style={{ color: "#5fd38d", marginTop: 10 }}>{success}</p> : null}
    </AuthLayout>
  );
}

function MobileTodayPage({ stats, onOpenTasks, onOpenClients }) {
  const card = {
    background: MOBILE_THEME.surface,
    border: `1px solid ${MOBILE_THEME.border}`,
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 10px 26px rgba(0,0,0,.28)",
  };

  const actionBtn = {
    appearance: "none",
    border: `1px solid ${MOBILE_THEME.borderSoft}`,
    background: MOBILE_THEME.surfaceStrong,
    color: MOBILE_THEME.text,
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 700,
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
  };

  return (
    <div style={{ padding: "clamp(8px, 3vw, 14px) clamp(8px, 3vw, 14px) 0" }}>
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ color: MOBILE_THEME.mutedText, fontSize: 13, marginBottom: 6 }}>Сегодня</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: MOBILE_THEME.surfaceStrong, border: `1px solid ${MOBILE_THEME.borderSoft}`, borderRadius: 10, padding: 10 }}>
            <div style={{ color: MOBILE_THEME.mutedText, fontSize: 12 }}>Просрочено</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.overdue}</div>
          </div>
          <div style={{ background: MOBILE_THEME.surfaceStrong, border: `1px solid ${MOBILE_THEME.borderSoft}`, borderRadius: 10, padding: 10 }}>
            <div style={{ color: MOBILE_THEME.mutedText, fontSize: 12 }}>На сегодня</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.today}</div>
          </div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ color: MOBILE_THEME.mutedText, fontSize: 13, marginBottom: 8 }}>Быстрые действия</div>
        <div style={{ display: "grid", gap: 8 }}>
          <button onClick={onOpenTasks} style={actionBtn}>Открыть мои задачи</button>
          <button onClick={onOpenClients} style={actionBtn}>Открыть клиентов</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ color: MOBILE_THEME.mutedText, fontSize: 13, marginBottom: 8 }}>Ориентир</div>
        <div style={{ fontSize: 14, lineHeight: 1.35 }}>
          Начинайте день с экрана “Сегодня”, затем переходите в “Задачи” для обновления статусов и комментариев.
        </div>
      </div>
    </div>
  );
}

function MobileInboxPage({ items, loading, onRefresh }) {
  const panel = {
    background: MOBILE_THEME.surface,
    border: `1px solid ${MOBILE_THEME.border}`,
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 10px 26px rgba(0,0,0,.28)",
  };

  return (
    <div style={{ padding: "clamp(8px, 3vw, 14px) clamp(8px, 3vw, 14px) 0" }}>
      <div style={{ ...panel, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Уведомления</div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            appearance: "none",
            border: `1px solid ${MOBILE_THEME.borderSoft}`,
            background: MOBILE_THEME.surfaceStrong,
            color: MOBILE_THEME.text,
            borderRadius: 10,
            padding: "6px 10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "Обновить"}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {items.length === 0 ? (
          <div style={panel}>Пока пусто</div>
        ) : (
          items.map((item) => (
            <div key={item.id} style={panel}>
              <div style={{ fontSize: 12, color: MOBILE_THEME.mutedText, marginBottom: 6 }}>
                {item.event_type || "event"} · {item.created_at ? new Date(item.created_at).toLocaleString("ru-RU") : "—"}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}>
                {item.payload?.message || item.payload?.text || "Новое событие по задаче"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MobileFullscreenTextEditor({ open, label, value, onChange, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: MOBILE_THEME.appBackground,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px",
          borderBottom: `1px solid ${MOBILE_THEME.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700 }}>{label || "Текст"}</div>
        <button onClick={onClose} style={quickActionStyle}>Готово</button>
      </div>
      <div style={{ padding: "12px", flex: 1 }}>
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            height: "100%",
            resize: "none",
            background: MOBILE_THEME.surfaceSoft,
            color: MOBILE_THEME.text,
            border: `1px solid ${MOBILE_THEME.border}`,
            borderRadius: 12,
            padding: "12px",
          }}
        />
      </div>
    </div>
  );
}

function MobileTasksPage({
  tasks,
  loading,
  onRefresh,
  onQuickStatus,
  onCreateTask,
  onSaveTask,
  onDeleteTask,
  users,
  clients,
  branches,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [activeTask, setActiveTask] = useState(null);
  const [editPayload, setEditPayload] = useState(null);
  const [savingTask, setSavingTask] = useState(false);
  const [textEditor, setTextEditor] = useState({ open: false, target: "", field: "", label: "" });
  const [fabOpen, setFabOpen] = useState(false);
  const [createPayload, setCreatePayload] = useState({
    title: "",
    client: "",
    primary_client: "",
    due_date: "",
    status: "В работе",
    description: "",
    result: "",
    comments: "",
    city: "",
    assigner_telegram_id: "",
    assignee_telegram_id: "",
    branch_id: "",
    client_id: "",
  });

  useEffect(() => undefined, []);

  const chips = [
    { key: "all", label: "Все" },
    { key: "overdue", label: "Просрочено" },
    { key: "today", label: "Сегодня" },
    { key: "inwork", label: "В работе" },
  ];

  const now = useMemo(() => new Date(), [tasks]);
  const todayEnd = useMemo(() => {
    const t = new Date();
    t.setHours(23, 59, 59, 999);
    return t;
  }, [tasks]);
  const normalize = (v) => String(v || "").trim().toLowerCase();
  const isClosed = (status) => ["завершено", "archived", "completed"].includes(normalize(status));

  const filtered = useMemo(() => {
    return (tasks || []).filter((t) => {
      const hay = `${t.title || ""} ${t.client || ""} ${t.primary_client || ""} ${t.assignee_name || ""}`.toLowerCase();
      if (search.trim() && !hay.includes(search.trim().toLowerCase())) return false;

      const due = t.due_date ? new Date(t.due_date) : null;
      if (filter === "overdue") {
        return due && !Number.isNaN(due.getTime()) && due < now && !isClosed(t.status);
      }
      if (filter === "today") {
        return due && !Number.isNaN(due.getTime()) && due >= now && due <= todayEnd && !isClosed(t.status);
      }
      if (filter === "inwork") {
        const s = normalize(t.status);
        return s === "в работе" || s === "выполняется";
      }
      return true;
    });
  }, [tasks, search, filter, now, todayEnd]);

  const card = {
    background: MOBILE_THEME.surface,
    border: `1px solid ${MOBILE_THEME.border}`,
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 10px 26px rgba(0,0,0,.28)",
  };

  function openTextEditor(target, field, label) {
    setTextEditor({ open: true, target, field, label });
  }

  function closeTextEditor() {
    setTextEditor({ open: false, target: "", field: "", label: "" });
  }

  function getTextEditorValue() {
    if (!textEditor.open) return "";
    if (textEditor.target === "edit") return editPayload?.[textEditor.field] || "";
    return createPayload?.[textEditor.field] || "";
  }

  function setTextEditorValue(nextValue) {
    if (textEditor.target === "edit") {
      setEditPayload((p) => ({ ...(p || {}), [textEditor.field]: nextValue }));
      return;
    }
    setCreatePayload((p) => ({ ...p, [textEditor.field]: nextValue }));
  }

  const statusOptions = ["В работе", "Пауза", "Результат на согласовании", "Просрочена", "Завершено"];

  function toDatetimeLocalValue(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function startEdit(task) {
    setActiveTask(task);
    setEditPayload({
      title: task.title || "",
      client: task.client || "",
      primary_client: task.primary_client || "",
      due_date: toDatetimeLocalValue(task.due_date),
      status: task.status || "В работе",
      description: task.description || "",
      result: task.result || "",
      comments: task.comments || "",
      city: task.city || "",
      assigner_telegram_id: String(task.assigner_telegram_id || ""),
      assignee_telegram_id: String(task.assignee_telegram_id || ""),
      branch_id: String(task.branch_id || ""),
      client_id: String(task.client_id || ""),
    });
  }

  return (
    <div style={{ padding: "clamp(8px, 3vw, 14px) clamp(8px, 3vw, 14px) 0" }}>
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск задачи"
            style={{
              flex: 1,
              background: MOBILE_THEME.surfaceStrong,
              color: MOBILE_THEME.text,
              border: `1px solid ${MOBILE_THEME.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          />
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              appearance: "none",
              border: `1px solid ${MOBILE_THEME.borderSoft}`,
              background: MOBILE_THEME.surfaceStrong,
              color: MOBILE_THEME.text,
              borderRadius: 10,
              padding: "9px 10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "..." : "?"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              style={{
                appearance: "none",
                whiteSpace: "nowrap",
                border: `1px solid ${MOBILE_THEME.borderSoft}`,
                background: filter === c.key ? MOBILE_THEME.activeByTab.tasks : MOBILE_THEME.surfaceStrong,
                color: "#fff",
                borderRadius: 999,
                padding: "6px 10px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={card}>Задачи не найдены</div>
        ) : (
          filtered.map((t) => (
            <button key={t.id} onClick={() => startEdit(t)} style={{ ...card, textAlign: "left", cursor: "pointer", appearance: "none", width: "100%" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.title || "Без названия"}</div>
              <div style={{ fontSize: 12, color: "#9fb1bb", marginBottom: 6 }}>
                {t.client || "Без клиента"} · {t.primary_client || "—"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{t.status || "—"}</span>
                <span>{t.due_date ? new Date(t.due_date).toLocaleDateString("ru-RU") : "без дедлайна"}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {activeTask ? (
        <div
          onClick={() => setActiveTask(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: MOBILE_THEME.overlay,
            zIndex: 40,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "82dvh",
              overflowY: "auto",
              background: MOBILE_THEME.surfaceSoft,
              borderTop: `1px solid ${MOBILE_THEME.border}`,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
            }}
          >
             <div style={{ fontWeight: 700, marginBottom: 10 }}>Редактирование задачи</div>
             <div style={{ display: "grid", gap: 8 }}>
               <input value={editPayload?.title || ""} onChange={(e) => setEditPayload((p) => ({ ...p, title: e.target.value }))} placeholder="Название" style={mobileInputStyle} />
               <input value={editPayload?.client || ""} onChange={(e) => setEditPayload((p) => ({ ...p, client: e.target.value }))} placeholder="Клиент (текст)" style={mobileInputStyle} />
               <select value={editPayload?.client_id || ""} onChange={(e) => setEditPayload((p) => ({ ...p, client_id: e.target.value }))} style={mobileInputStyle}>
                 <option value="">Клиент (список, опционально)</option>
                 {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
               </select>
               <input value={editPayload?.primary_client || ""} onChange={(e) => setEditPayload((p) => ({ ...p, primary_client: e.target.value }))} placeholder="Клиент 1 порядка" style={mobileInputStyle} />
               <input value={editPayload?.city || ""} onChange={(e) => setEditPayload((p) => ({ ...p, city: e.target.value }))} placeholder="Город" style={mobileInputStyle} />
               <select value={editPayload?.branch_id || ""} onChange={(e) => setEditPayload((p) => ({ ...p, branch_id: e.target.value }))} style={mobileInputStyle}>
                 <option value="">Филиал (опционально)</option>
                 {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
               </select>
               <input type="datetime-local" value={editPayload?.due_date || ""} onChange={(e) => setEditPayload((p) => ({ ...p, due_date: e.target.value }))} style={mobileInputStyle} />
               <select value={editPayload?.status || "В работе"} onChange={(e) => setEditPayload((p) => ({ ...p, status: e.target.value }))} style={mobileInputStyle}>
                 {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
               </select>
               <select value={editPayload?.assigner_telegram_id || ""} onChange={(e) => setEditPayload((p) => ({ ...p, assigner_telegram_id: e.target.value }))} style={mobileInputStyle}>
                 <option value="">Постановщик</option>
                 {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
               </select>
               <select value={editPayload?.assignee_telegram_id || ""} onChange={(e) => setEditPayload((p) => ({ ...p, assignee_telegram_id: e.target.value }))} style={mobileInputStyle}>
                 <option value="">Исполнитель</option>
                 {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
               </select>
               <textarea value={editPayload?.description || ""} onChange={(e) => setEditPayload((p) => ({ ...p, description: e.target.value }))} placeholder="Описание" style={{ ...mobileInputStyle, minHeight: 72 }} />
               <button onClick={() => openTextEditor("edit", "description", "Описание")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
               <textarea value={editPayload?.result || ""} onChange={(e) => setEditPayload((p) => ({ ...p, result: e.target.value }))} placeholder="Результат" style={{ ...mobileInputStyle, minHeight: 72 }} />
               <button onClick={() => openTextEditor("edit", "result", "Результат")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
               <textarea value={editPayload?.comments || ""} onChange={(e) => setEditPayload((p) => ({ ...p, comments: e.target.value }))} placeholder="Комментарии" style={{ ...mobileInputStyle, minHeight: 72 }} />
               <button onClick={() => openTextEditor("edit", "comments", "Комментарии")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
             </div>
             <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))", gap: 8 }}>
               <button onClick={() => onQuickStatus(activeTask.id, "В работе")} style={quickActionStyle}>В работу</button>
               <button onClick={() => onQuickStatus(activeTask.id, "Пауза")} style={quickActionStyle}>Пауза</button>
               <button onClick={() => onQuickStatus(activeTask.id, "Завершено")} style={quickActionStyle}>Готово</button>
             </div>
             <button
               onClick={async () => {
                 if (!activeTask?.id || !editPayload) return;
                 setSavingTask(true);
                 const ok = await onSaveTask(activeTask.id, {
                   ...editPayload,
                   due_date: toIsoOrNull(editPayload.due_date),
                   assigner_telegram_id: editPayload.assigner_telegram_id ? Number(editPayload.assigner_telegram_id) : null,
                   assignee_telegram_id: editPayload.assignee_telegram_id ? Number(editPayload.assignee_telegram_id) : null,
                   branch_id: editPayload.branch_id || null,
                   client_id: editPayload.client_id || null,
                 });
                 setSavingTask(false);
                 if (ok) setActiveTask(null);
               }}
               disabled={savingTask}
               style={{ ...quickActionStyle, marginTop: 10 }}
             >
               {savingTask ? "Сохранение..." : "Сохранить"}
             </button>
             <button
               onClick={async () => {
                 if (!activeTask?.id) return;
                 if (!window.confirm("Удалить задачу?")) return;
                 const ok = await onDeleteTask(activeTask.id);
                 if (ok) setActiveTask(null);
               }}
               style={{ ...quickActionStyle, marginTop: 8, background: "#0f151b", color: "#eaf1f4" }}
             >
               Удалить задачу
             </button>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setFabOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(86px + env(safe-area-inset-bottom, 0px))",
          zIndex: 35,
          width: "clamp(48px, 14vw, 56px)",
          height: "clamp(48px, 14vw, 56px)",
          borderRadius: 999,
          border: "none",
          fontSize: "clamp(24px, 7vw, 30px)",
          lineHeight: "clamp(48px, 14vw, 56px)",
          textAlign: "center",
          color: "#fff",
          background: MOBILE_THEME.ctaGradient,
          boxShadow: MOBILE_THEME.ctaShadow,
          cursor: "pointer",
        }}
      >
        +
      </button>

      {fabOpen ? (
        <div
          onClick={() => setFabOpen(false)}
          style={{ position: "fixed", inset: 0, background: MOBILE_THEME.overlay, zIndex: 45, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: MOBILE_THEME.surfaceSoft,
              borderTop: `1px solid ${MOBILE_THEME.border}`,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Новая задача</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                value={createPayload.title}
                onChange={(e) => setCreatePayload((p) => ({ ...p, title: e.target.value }))}
                placeholder="Название"
                style={mobileInputStyle}
              />
              <input
                value={createPayload.client}
                onChange={(e) => setCreatePayload((p) => ({ ...p, client: e.target.value }))}
                placeholder="Клиент"
                style={mobileInputStyle}
              />
              <input
                value={createPayload.primary_client}
                onChange={(e) => setCreatePayload((p) => ({ ...p, primary_client: e.target.value }))}
                placeholder="Клиент 1 порядка"
                style={mobileInputStyle}
              />
              <input
                value={createPayload.city}
                onChange={(e) => setCreatePayload((p) => ({ ...p, city: e.target.value }))}
                placeholder="Город"
                style={mobileInputStyle}
              />
              <select
                value={createPayload.branch_id}
                onChange={(e) => setCreatePayload((p) => ({ ...p, branch_id: e.target.value }))}
                style={mobileInputStyle}
              >
                <option value="">Филиал</option>
                {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
              </select>
              <select
                value={createPayload.client_id}
                onChange={(e) => setCreatePayload((p) => ({ ...p, client_id: e.target.value }))}
                style={mobileInputStyle}
              >
                <option value="">Клиент (из справочника)</option>
                {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
              <select
                value={createPayload.status}
                onChange={(e) => setCreatePayload((p) => ({ ...p, status: e.target.value }))}
                style={mobileInputStyle}
              >
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                type="datetime-local"
                value={createPayload.due_date}
                onChange={(e) => setCreatePayload((p) => ({ ...p, due_date: e.target.value }))}
                style={mobileInputStyle}
              />
              <select
                value={createPayload.assigner_telegram_id}
                onChange={(e) => setCreatePayload((p) => ({ ...p, assigner_telegram_id: e.target.value }))}
                style={mobileInputStyle}
              >
                <option value="">Постановщик</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <select
                value={createPayload.assignee_telegram_id}
                onChange={(e) => setCreatePayload((p) => ({ ...p, assignee_telegram_id: e.target.value }))}
                style={mobileInputStyle}
              >
                <option value="">Исполнитель</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <textarea value={createPayload.description} onChange={(e) => setCreatePayload((p) => ({ ...p, description: e.target.value }))} placeholder="Описание" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "description", "Описание")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={createPayload.result} onChange={(e) => setCreatePayload((p) => ({ ...p, result: e.target.value }))} placeholder="Результат" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "result", "Результат")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={createPayload.comments} onChange={(e) => setCreatePayload((p) => ({ ...p, comments: e.target.value }))} placeholder="Комментарии" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "comments", "Комментарии")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <button
                onClick={async () => {
                  const ok = await onCreateTask({
                    ...createPayload,
                    due_date: toIsoOrNull(createPayload.due_date),
                    assigner_telegram_id: createPayload.assigner_telegram_id ? Number(createPayload.assigner_telegram_id) : null,
                    assignee_telegram_id: createPayload.assignee_telegram_id ? Number(createPayload.assignee_telegram_id) : null,
                    client_id: createPayload.client_id || null,
                    branch_id: createPayload.branch_id || null,
                  });
                  if (ok) {
                    setFabOpen(false);
                    setCreatePayload({
                      title: "",
                      client: "",
                      primary_client: "",
                      due_date: "",
                      status: "В работе",
                      description: "",
                      result: "",
                      comments: "",
                      city: "",
                      assigner_telegram_id: "",
                      assignee_telegram_id: "",
                      branch_id: "",
                      client_id: "",
                    });
                  }
                }}
                style={quickActionStyle}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <MobileFullscreenTextEditor
        open={textEditor.open}
        label={textEditor.label}
        value={getTextEditorValue()}
        onChange={setTextEditorValue}
        onClose={closeTextEditor}
      />
    </div>
  );
}

function MobileClientsPage({ clients, loading, onRefresh, onCreateClient, onSaveClient, onDeleteClient, users, branches }) {
  const MOBILE_CLIENT_EDIT_DRAFT_KEY = "crm_mobile_clients_edit_draft_v1";
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [activeClient, setActiveClient] = useState(null);
  const [editPayload, setEditPayload] = useState(null);
  const [savingClient, setSavingClient] = useState(false);
  const [textEditor, setTextEditor] = useState({ open: false, target: "", field: "", label: "" });
  const [fabOpen, setFabOpen] = useState(false);
  const [createPayload, setCreatePayload] = useState({
    name: "",
    status: "active",
    city: "",
    primary_client: "",
    responsible: "",
    inn: "",
    manager_contact: "",
    sales_channel: "",
    info: "",
    clients_responsible_manager: "",
    development_plan: "",
    client_work: "",
    visit_date: "",
    branch_id: "",
  });

  useEffect(() => undefined, []);

  useEffect(() => {
    if (activeClient) return;
    if (!Array.isArray(clients) || clients.length === 0) return;
    try {
      const raw = localStorage.getItem(MOBILE_CLIENT_EDIT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const draftClientId = parsed?.clientId;
      const draftPayload = parsed?.payload;
      if (!draftClientId || !draftPayload || typeof draftPayload !== "object") return;
      const found = clients.find((c) => String(c.id) === String(draftClientId));
      if (!found) return;
      setActiveClient(found);
      setEditPayload({
        name: found.name || "",
        status: found.status || "active",
        city: found.city || "",
        primary_client: found.primary_client || "",
        responsible: found.responsible || "",
        inn: found.inn || "",
        manager_contact: found.manager_contact || "",
        sales_channel: found.sales_channel || "",
        info: found.info || "",
        clients_responsible_manager: found.clients_responsible_manager || "",
        development_plan: found.development_plan || "",
        client_work: found.client_work || "",
        visit_date: found.visit_date || "",
        branch_id: found.branch_id || "",
        ...draftPayload,
      });
    } catch {
      // ignore malformed draft
    }
  }, [clients, activeClient]);

  useEffect(() => {
    try {
      if (activeClient?.id && editPayload) {
        localStorage.setItem(
          MOBILE_CLIENT_EDIT_DRAFT_KEY,
          JSON.stringify({
            clientId: activeClient.id,
            payload: editPayload,
          })
        );
      } else {
        localStorage.removeItem(MOBILE_CLIENT_EDIT_DRAFT_KEY);
      }
    } catch {
      // ignore localStorage errors
    }
  }, [activeClient, editPayload]);

  const cityOptions = useMemo(() => {
    const values = Array.from(new Set((clients || []).map((c) => String(c.city || "").trim()).filter(Boolean)));
    return ["all", ...values];
  }, [clients]);

  const filtered = useMemo(() => {
    return (clients || []).filter((c) => {
      const hay = `${c.name || ""} ${c.primary_client || ""} ${c.city || ""} ${c.responsible || ""}`.toLowerCase();
      if (search.trim() && !hay.includes(search.trim().toLowerCase())) return false;
      if (city !== "all" && String(c.city || "") !== city) return false;
      return true;
    });
  }, [clients, search, city]);

  const card = {
    background: MOBILE_THEME.surface,
    border: `1px solid ${MOBILE_THEME.border}`,
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 10px 26px rgba(0,0,0,.28)",
  };

  function openTextEditor(target, field, label) {
    setTextEditor({ open: true, target, field, label });
  }

  function closeTextEditor() {
    setTextEditor({ open: false, target: "", field: "", label: "" });
  }

  function getTextEditorValue() {
    if (!textEditor.open) return "";
    if (textEditor.target === "edit") return editPayload?.[textEditor.field] || "";
    return createPayload?.[textEditor.field] || "";
  }

  function setTextEditorValue(nextValue) {
    if (textEditor.target === "edit") {
      setEditPayload((p) => ({ ...(p || {}), [textEditor.field]: nextValue }));
      return;
    }
    setCreatePayload((p) => ({ ...p, [textEditor.field]: nextValue }));
  }

  return (
    <div style={{ padding: "clamp(8px, 3vw, 14px) clamp(8px, 3vw, 14px) 0" }}>
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск клиента"
            style={{
              flex: 1,
              background: MOBILE_THEME.surfaceStrong,
              color: MOBILE_THEME.text,
              border: `1px solid ${MOBILE_THEME.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          />
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              appearance: "none",
              border: `1px solid ${MOBILE_THEME.borderSoft}`,
              background: MOBILE_THEME.surfaceStrong,
              color: MOBILE_THEME.text,
              borderRadius: 10,
              padding: "9px 10px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "..." : "?"}
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{
              width: "100%",
              background: MOBILE_THEME.surfaceStrong,
              color: MOBILE_THEME.text,
              border: `1px solid ${MOBILE_THEME.borderSoft}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <option value="all">Все города</option>
            {cityOptions.filter((c) => c !== "all").map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={card}>Клиенты не найдены</div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveClient(c);
                setEditPayload({
                  name: c.name || "",
                  status: c.status || "active",
                  city: c.city || "",
                  primary_client: c.primary_client || "",
                  responsible: c.responsible || "",
                  inn: c.inn || "",
                  manager_contact: c.manager_contact || "",
                  sales_channel: c.sales_channel || "",
                  info: c.info || "",
                  clients_responsible_manager: c.clients_responsible_manager || "",
                  development_plan: c.development_plan || "",
                  client_work: c.client_work || "",
                  visit_date: c.visit_date || "",
                  branch_id: c.branch_id || "",
                });
              }}
              style={{ ...card, textAlign: "left", cursor: "pointer", appearance: "none", width: "100%" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{c.name || "Без названия"}</div>
              <div style={{ fontSize: 12, color: "#9fb1bb", marginBottom: 6 }}>
                {c.primary_client || "—"} · {c.city || "Город не указан"}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{c.status || "active"}</span>
                <span>{c.responsible || "Без ответственного"}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {activeClient ? (
        <div
          onClick={() => {
            setActiveClient(null);
            setEditPayload(null);
            localStorage.removeItem(MOBILE_CLIENT_EDIT_DRAFT_KEY);
          }}
          style={{ position: "fixed", inset: 0, background: MOBILE_THEME.overlay, zIndex: 40, display: "flex", alignItems: "flex-end" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxHeight: "80dvh",
              overflowY: "auto",
              background: MOBILE_THEME.surfaceSoft,
              borderTop: `1px solid ${MOBILE_THEME.border}`,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Редактирование клиента</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={editPayload?.name || ""} onChange={(e) => setEditPayload((p) => ({ ...p, name: e.target.value }))} placeholder="Название" style={mobileInputStyle} />
              <select value={editPayload?.status || "active"} onChange={(e) => setEditPayload((p) => ({ ...p, status: e.target.value }))} style={mobileInputStyle}>
                <option value="active">active</option>
                <option value="archived">archived</option>
                <option value="Просрочена">Просрочена</option>
                <option value="Результат на согласовании">Результат на согласовании</option>
                <option value="Завершено">Завершено</option>
              </select>
              <input value={editPayload?.city || ""} onChange={(e) => setEditPayload((p) => ({ ...p, city: e.target.value }))} placeholder="Город" style={mobileInputStyle} />
              <input value={editPayload?.primary_client || ""} onChange={(e) => setEditPayload((p) => ({ ...p, primary_client: e.target.value }))} placeholder="Клиент 1 порядка" style={mobileInputStyle} />
              <select value={editPayload?.responsible || ""} onChange={(e) => setEditPayload((p) => ({ ...p, responsible: e.target.value }))} style={mobileInputStyle}>
                <option value="">Ответственный</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <select value={editPayload?.branch_id || ""} onChange={(e) => setEditPayload((p) => ({ ...p, branch_id: e.target.value }))} style={mobileInputStyle}>
                <option value="">Филиал</option>
                {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
              </select>
              <input value={editPayload?.inn || ""} onChange={(e) => setEditPayload((p) => ({ ...p, inn: String(e.target.value || "").replace(/\D/g, "") }))} placeholder="ИНН" style={mobileInputStyle} />
              <input value={editPayload?.manager_contact || ""} onChange={(e) => setEditPayload((p) => ({ ...p, manager_contact: e.target.value }))} placeholder="Контакт менеджера" style={mobileInputStyle} />
              <input value={editPayload?.sales_channel || ""} onChange={(e) => setEditPayload((p) => ({ ...p, sales_channel: e.target.value }))} placeholder="Канал продаж" style={mobileInputStyle} />
              <input type="date" value={editPayload?.visit_date || ""} onChange={(e) => setEditPayload((p) => ({ ...p, visit_date: e.target.value }))} style={mobileInputStyle} />
              <textarea value={editPayload?.info || ""} onChange={(e) => setEditPayload((p) => ({ ...p, info: e.target.value }))} placeholder="Информация" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("edit", "info", "Информация")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={editPayload?.clients_responsible_manager || ""} onChange={(e) => setEditPayload((p) => ({ ...p, clients_responsible_manager: e.target.value }))} placeholder="Ответственный менеджер клиента" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("edit", "clients_responsible_manager", "Ответственный менеджер клиента")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={editPayload?.development_plan || ""} onChange={(e) => setEditPayload((p) => ({ ...p, development_plan: e.target.value }))} placeholder="План развития" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("edit", "development_plan", "План развития")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={editPayload?.client_work || ""} onChange={(e) => setEditPayload((p) => ({ ...p, client_work: e.target.value }))} placeholder="Работа по клиенту" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("edit", "client_work", "Работа по клиенту")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
            </div>
            <button
              onClick={async () => {
                if (!activeClient?.id || !editPayload) return;
                setSavingClient(true);
                const ok = await onSaveClient(activeClient.id, editPayload);
                setSavingClient(false);
                if (ok) {
                  setActiveClient(null);
                  setEditPayload(null);
                  localStorage.removeItem(MOBILE_CLIENT_EDIT_DRAFT_KEY);
                }
              }}
              disabled={savingClient}
              style={{ ...quickActionStyle, marginTop: 10 }}
            >
              {savingClient ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              onClick={async () => {
                if (!activeClient?.id) return;
                if (!window.confirm("Удалить клиента?")) return;
                const ok = await onDeleteClient(activeClient.id);
                if (ok) {
                  setActiveClient(null);
                  setEditPayload(null);
                  localStorage.removeItem(MOBILE_CLIENT_EDIT_DRAFT_KEY);
                }
              }}
              style={{ ...quickActionStyle, marginTop: 8, background: "#0f151b", color: "#eaf1f4" }}
            >
              Удалить клиента
            </button>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setFabOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(86px + env(safe-area-inset-bottom, 0px))",
          zIndex: 35,
          width: "clamp(48px, 14vw, 56px)",
          height: "clamp(48px, 14vw, 56px)",
          borderRadius: 999,
          border: "none",
          fontSize: "clamp(24px, 7vw, 30px)",
          lineHeight: "clamp(48px, 14vw, 56px)",
          textAlign: "center",
          color: "#fff",
          background: MOBILE_THEME.ctaGradient,
          boxShadow: MOBILE_THEME.ctaShadow,
          cursor: "pointer",
        }}
      >
        +
      </button>

      {fabOpen ? (
        <div onClick={() => setFabOpen(false)} style={{ position: "fixed", inset: 0, background: MOBILE_THEME.overlay, zIndex: 45, display: "flex", alignItems: "flex-end" }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: MOBILE_THEME.surfaceSoft,
              borderTop: `1px solid ${MOBILE_THEME.border}`,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
              maxHeight: "82dvh",
              overflowY: "auto",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Новый клиент</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={createPayload.name} onChange={(e) => setCreatePayload((p) => ({ ...p, name: e.target.value }))} placeholder="Название" style={mobileInputStyle} />
              <input value={createPayload.city} onChange={(e) => setCreatePayload((p) => ({ ...p, city: e.target.value }))} placeholder="Город" style={mobileInputStyle} />
              <input value={createPayload.primary_client} onChange={(e) => setCreatePayload((p) => ({ ...p, primary_client: e.target.value }))} placeholder="Клиент 1 порядка" style={mobileInputStyle} />
              <select value={createPayload.status} onChange={(e) => setCreatePayload((p) => ({ ...p, status: e.target.value }))} style={mobileInputStyle}>
                <option value="active">active</option>
                <option value="archived">archived</option>
                <option value="Просрочена">Просрочена</option>
                <option value="Результат на согласовании">Результат на согласовании</option>
                <option value="Завершено">Завершено</option>
              </select>
              <select value={createPayload.responsible} onChange={(e) => setCreatePayload((p) => ({ ...p, responsible: e.target.value }))} style={mobileInputStyle}>
                <option value="">Ответственный</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <select value={createPayload.branch_id} onChange={(e) => setCreatePayload((p) => ({ ...p, branch_id: e.target.value }))} style={mobileInputStyle}>
                <option value="">Филиал</option>
                {(branches || []).map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
              </select>
              <input value={createPayload.inn} onChange={(e) => setCreatePayload((p) => ({ ...p, inn: String(e.target.value || "").replace(/\D/g, "") }))} placeholder="ИНН" style={mobileInputStyle} />
              <input value={createPayload.manager_contact} onChange={(e) => setCreatePayload((p) => ({ ...p, manager_contact: e.target.value }))} placeholder="Контакт менеджера" style={mobileInputStyle} />
              <input value={createPayload.sales_channel} onChange={(e) => setCreatePayload((p) => ({ ...p, sales_channel: e.target.value }))} placeholder="Канал продаж" style={mobileInputStyle} />
              <input type="date" value={createPayload.visit_date} onChange={(e) => setCreatePayload((p) => ({ ...p, visit_date: e.target.value }))} style={mobileInputStyle} />
              <textarea value={createPayload.info} onChange={(e) => setCreatePayload((p) => ({ ...p, info: e.target.value }))} placeholder="Информация" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "info", "Информация")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={createPayload.clients_responsible_manager} onChange={(e) => setCreatePayload((p) => ({ ...p, clients_responsible_manager: e.target.value }))} placeholder="Ответственный менеджер клиента" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "clients_responsible_manager", "Ответственный менеджер клиента")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={createPayload.development_plan} onChange={(e) => setCreatePayload((p) => ({ ...p, development_plan: e.target.value }))} placeholder="План развития" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "development_plan", "План развития")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <textarea value={createPayload.client_work} onChange={(e) => setCreatePayload((p) => ({ ...p, client_work: e.target.value }))} placeholder="Работа по клиенту" style={{ ...mobileInputStyle, minHeight: 72 }} />
              <button onClick={() => openTextEditor("create", "client_work", "Работа по клиенту")} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
              <button
                onClick={async () => {
                  const ok = await onCreateClient(createPayload);
                  if (!ok) return;
                  setFabOpen(false);
                  setCreatePayload({
                    name: "",
                    status: "active",
                    city: "",
                    primary_client: "",
                    responsible: "",
                    inn: "",
                    manager_contact: "",
                    sales_channel: "",
                    info: "",
                    clients_responsible_manager: "",
                    development_plan: "",
                    client_work: "",
                    visit_date: "",
                    branch_id: "",
                  });
                }}
                style={quickActionStyle}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <MobileFullscreenTextEditor
        open={textEditor.open}
        label={textEditor.label}
        value={getTextEditorValue()}
        onChange={setTextEditorValue}
        onClose={closeTextEditor}
      />
    </div>
  );
}

function MobileBranchesPage({ branches, clients, loading, onRefresh, onCreateBranch, onSaveBranch, onDeleteBranch, users }) {
  const emptyBranchPayload = () => ({
    name: "",
    primary_client: "",
    city: "",
    responsible: "",
    strategy_plan: "",
    branch_birthday: "",
    visit_date: "",
    trading_hall: "",
    training: "",
    director: "",
    ns_rp: "",
    ns_op: "",
    ns_kp: "",
    ns_smo: "",
    mpp: "",
    top_clients_sds: "",
    top_clients_branch: "",
    upcoming_events: "",
    new_products: "",
    catalogs_samples: "",
    comments: "",
    task_info: "",
  });

  const [search, setSearch] = useState("");
  const [city, setCity] = useState("all");
  const [activeBranch, setActiveBranch] = useState(null);
  const [editPayload, setEditPayload] = useState(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [textEditor, setTextEditor] = useState({ open: false, target: "", field: "", label: "" });
  const [fabOpen, setFabOpen] = useState(false);
  const [createPayload, setCreatePayload] = useState(emptyBranchPayload);

  useEffect(() => undefined, []);

  const getResponsibleUser = (branch) => {
    if (!branch) return null;
    if (branch.responsible_id) {
      const byId = (users || []).find((u) => String(u.id || "") === String(branch.responsible_id));
      if (byId) return byId;
    }
    if (branch.responsible) {
      return (users || []).find((u) => String(u.telegram_id || "") === String(branch.responsible));
    }
    return null;
  };

  const getResponsibleDisplay = (branch) => {
    const user = getResponsibleUser(branch);
    if (!user) return branch?.responsible || "Без ответственного";
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return fullName || user.username || user.telegram_id || "Без ответственного";
  };

  const getResponsibleSelectValue = (branch) => {
    const user = getResponsibleUser(branch);
    if (!user) return branch?.responsible || "";
    return user.telegram_id ? String(user.telegram_id) : "";
  };

  const cityOptions = useMemo(() => {
    const values = Array.from(new Set((branches || []).map((b) => String(b.city || "").trim()).filter(Boolean)));
    return ["all", ...values];
  }, [branches]);

  const filtered = useMemo(() => {
    return (branches || []).filter((b) => {
      const hay = `${b.name || ""} ${b.primary_client || ""} ${b.city || ""} ${getResponsibleDisplay(b)}`.toLowerCase();
      if (search.trim() && !hay.includes(search.trim().toLowerCase())) return false;
      if (city !== "all" && String(b.city || "") !== city) return false;
      return true;
    });
  }, [branches, search, city, users]);

  const card = {
    background: MOBILE_THEME.surface,
    border: `1px solid ${MOBILE_THEME.border}`,
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 10px 26px rgba(0,0,0,.28)",
  };

  const yesNoOptions = ["Да", "Нет"];
  const longFields = [
    { key: "strategy_plan", label: "Стратегический план" },
    { key: "director", label: "Директор" },
    { key: "ns_rp", label: "НС РП" },
    { key: "ns_op", label: "НС ОП" },
    { key: "ns_kp", label: "НС КП" },
    { key: "ns_smo", label: "НС СМО" },
    { key: "mpp", label: "МПП" },
    { key: "top_clients_sds", label: "ТОП клиенты SDS" },
    { key: "top_clients_branch", label: "ТОП клиенты филиала" },
    { key: "upcoming_events", label: "Мероприятия" },
    { key: "new_products", label: "Новинки" },
    { key: "catalogs_samples", label: "Каталоги/образцы" },
    { key: "comments", label: "Комментарии" },
    { key: "task_info", label: "Информация к задаче" },
  ];

  function openTextEditor(target, field, label) {
    setTextEditor({ open: true, target, field, label });
  }

  function closeTextEditor() {
    setTextEditor({ open: false, target: "", field: "", label: "" });
  }

  function getTextEditorValue() {
    if (!textEditor.open) return "";
    if (textEditor.target === "edit") return editPayload?.[textEditor.field] || "";
    return createPayload?.[textEditor.field] || "";
  }

  function setTextEditorValue(nextValue) {
    if (textEditor.target === "edit") {
      setEditPayload((p) => ({ ...(p || {}), [textEditor.field]: nextValue }));
      return;
    }
    setCreatePayload((p) => ({ ...p, [textEditor.field]: nextValue }));
  }

  function clientsCount(branchId) {
    return (clients || []).filter((c) => c.branch_id === branchId).length;
  }

  return (
    <div style={{ padding: "clamp(8px, 3vw, 14px) clamp(8px, 3vw, 14px) 0" }}>
      <div style={{ ...card, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск филиала"
            style={{ flex: 1, background: MOBILE_THEME.surfaceStrong, color: MOBILE_THEME.text, border: `1px solid ${MOBILE_THEME.borderSoft}`, borderRadius: 10, padding: "10px 12px" }}
          />
          <button onClick={onRefresh} disabled={loading} style={{ appearance: "none", border: `1px solid ${MOBILE_THEME.borderSoft}`, background: MOBILE_THEME.surfaceStrong, color: MOBILE_THEME.text, borderRadius: 10, padding: "9px 10px", fontWeight: 700, cursor: "pointer" }}>
            {loading ? "..." : "?"}
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <select value={city} onChange={(e) => setCity(e.target.value)} style={{ width: "100%", background: MOBILE_THEME.surfaceStrong, color: MOBILE_THEME.text, border: `1px solid ${MOBILE_THEME.borderSoft}`, borderRadius: 10, padding: "10px 12px" }}>
            <option value="all">Все города</option>
            {cityOptions.filter((c) => c !== "all").map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={card}>Филиалы не найдены</div>
        ) : (
          filtered.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setActiveBranch(b);
                setEditPayload({
                  name: b.name || "",
                  primary_client: b.primary_client || "",
                  city: b.city || "",
                  responsible: getResponsibleSelectValue(b),
                  strategy_plan: b.strategy_plan || "",
                  branch_birthday: b.branch_birthday || "",
                  visit_date: b.visit_date || "",
                  trading_hall: b.trading_hall || "",
                  training: b.training || "",
                  director: b.director || "",
                  ns_rp: b.ns_rp || "",
                  ns_op: b.ns_op || "",
                  ns_kp: b.ns_kp || "",
                  ns_smo: b.ns_smo || "",
                  mpp: b.mpp || "",
                  top_clients_sds: b.top_clients_sds || "",
                  top_clients_branch: b.top_clients_branch || "",
                  upcoming_events: b.upcoming_events || "",
                  new_products: b.new_products || "",
                  catalogs_samples: b.catalogs_samples || "",
                  comments: b.comments || "",
                  task_info: b.task_info || "",
                });
              }}
              style={{ ...card, textAlign: "left", cursor: "pointer", appearance: "none", width: "100%" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{b.name || "Без названия"}</div>
              <div style={{ fontSize: 12, color: "#9fb1bb", marginBottom: 6 }}>{b.primary_client || "—"} · {b.city || "Город не указан"}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>{getResponsibleDisplay(b)}</span>
                <span>Клиентов: {clientsCount(b.id)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {activeBranch ? (
        <div onClick={() => setActiveBranch(null)} style={{ position: "fixed", inset: 0, background: MOBILE_THEME.overlay, zIndex: 40, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "82dvh", overflowY: "auto", background: MOBILE_THEME.surfaceSoft, borderTop: `1px solid ${MOBILE_THEME.border}`, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))" }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Редактирование филиала</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={editPayload?.name || ""} onChange={(e) => setEditPayload((p) => ({ ...p, name: e.target.value }))} placeholder="Название филиала" style={mobileInputStyle} />
              <input value={editPayload?.primary_client || ""} onChange={(e) => setEditPayload((p) => ({ ...p, primary_client: e.target.value }))} placeholder="Клиент 1 порядка" style={mobileInputStyle} />
              <input value={editPayload?.city || ""} onChange={(e) => setEditPayload((p) => ({ ...p, city: e.target.value }))} placeholder="Город" style={mobileInputStyle} />
              <select value={editPayload?.responsible || ""} onChange={(e) => setEditPayload((p) => ({ ...p, responsible: e.target.value }))} style={mobileInputStyle}>
                <option value="">Ответственный</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <input type="date" value={editPayload?.branch_birthday || ""} onChange={(e) => setEditPayload((p) => ({ ...p, branch_birthday: e.target.value }))} style={mobileInputStyle} />
              <input type="date" value={editPayload?.visit_date || ""} onChange={(e) => setEditPayload((p) => ({ ...p, visit_date: e.target.value }))} style={mobileInputStyle} />
              <select value={editPayload?.trading_hall || ""} onChange={(e) => setEditPayload((p) => ({ ...p, trading_hall: e.target.value }))} style={mobileInputStyle}>
                <option value="">Торговый зал</option>
                {yesNoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={editPayload?.training || ""} onChange={(e) => setEditPayload((p) => ({ ...p, training: e.target.value }))} style={mobileInputStyle}>
                <option value="">Обучение</option>
                {yesNoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {longFields.map((f) => (
                <div key={f.key} style={{ display: "grid", gap: 6 }}>
                  <textarea value={editPayload?.[f.key] || ""} onChange={(e) => setEditPayload((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.label} style={{ ...mobileInputStyle, minHeight: 72 }} />
                  <button onClick={() => openTextEditor("edit", f.key, f.label)} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                if (!activeBranch?.id || !editPayload) return;
                setSavingBranch(true);
                const ok = await onSaveBranch(activeBranch.id, editPayload);
                setSavingBranch(false);
                if (ok) setActiveBranch(null);
              }}
              disabled={savingBranch}
              style={{ ...quickActionStyle, marginTop: 10 }}
            >
              {savingBranch ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              onClick={async () => {
                if (!activeBranch?.id) return;
                if (!window.confirm("Удалить филиал?")) return;
                const ok = await onDeleteBranch(activeBranch.id);
                if (ok) setActiveBranch(null);
              }}
              style={{ ...quickActionStyle, marginTop: 8, background: "#0f151b", color: "#eaf1f4" }}
            >
              Удалить филиал
            </button>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setFabOpen(true)}
        style={{ position: "fixed", right: 16, bottom: "calc(86px + env(safe-area-inset-bottom, 0px))", zIndex: 35, width: "clamp(48px, 14vw, 56px)", height: "clamp(48px, 14vw, 56px)", borderRadius: 999, border: "none", fontSize: "clamp(24px, 7vw, 30px)", lineHeight: "clamp(48px, 14vw, 56px)", textAlign: "center", color: "#fff", background: MOBILE_THEME.ctaGradient, boxShadow: MOBILE_THEME.ctaShadow, cursor: "pointer" }}
      >
        +
      </button>

      {fabOpen ? (
        <div onClick={() => setFabOpen(false)} style={{ position: "fixed", inset: 0, background: MOBILE_THEME.overlay, zIndex: 45, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: MOBILE_THEME.surfaceSoft, borderTop: `1px solid ${MOBILE_THEME.border}`, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: "14px 12px calc(14px + env(safe-area-inset-bottom, 0px))", maxHeight: "82dvh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Новый филиал</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input value={createPayload.name} onChange={(e) => setCreatePayload((p) => ({ ...p, name: e.target.value }))} placeholder="Название филиала" style={mobileInputStyle} />
              <input value={createPayload.primary_client} onChange={(e) => setCreatePayload((p) => ({ ...p, primary_client: e.target.value }))} placeholder="Клиент 1 порядка" style={mobileInputStyle} />
              <input value={createPayload.city} onChange={(e) => setCreatePayload((p) => ({ ...p, city: e.target.value }))} placeholder="Город" style={mobileInputStyle} />
              <select value={createPayload.responsible} onChange={(e) => setCreatePayload((p) => ({ ...p, responsible: e.target.value }))} style={mobileInputStyle}>
                <option value="">Ответственный</option>
                {(users || []).map((u) => <option key={u.id} value={u.telegram_id || ""}>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username || u.telegram_id || u.id}</option>)}
              </select>
              <input type="date" value={createPayload.branch_birthday} onChange={(e) => setCreatePayload((p) => ({ ...p, branch_birthday: e.target.value }))} style={mobileInputStyle} />
              <input type="date" value={createPayload.visit_date} onChange={(e) => setCreatePayload((p) => ({ ...p, visit_date: e.target.value }))} style={mobileInputStyle} />
              <select value={createPayload.trading_hall} onChange={(e) => setCreatePayload((p) => ({ ...p, trading_hall: e.target.value }))} style={mobileInputStyle}>
                <option value="">Торговый зал</option>
                {yesNoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={createPayload.training} onChange={(e) => setCreatePayload((p) => ({ ...p, training: e.target.value }))} style={mobileInputStyle}>
                <option value="">Обучение</option>
                {yesNoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {longFields.map((f) => (
                <div key={f.key} style={{ display: "grid", gap: 6 }}>
                  <textarea value={createPayload?.[f.key] || ""} onChange={(e) => setCreatePayload((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.label} style={{ ...mobileInputStyle, minHeight: 72 }} />
                  <button onClick={() => openTextEditor("create", f.key, f.label)} style={{ ...quickActionStyle, background: "#0f151b", color: "#eaf1f4" }}>Во весь экран</button>
                </div>
              ))}
              <button
                onClick={async () => {
                  const ok = await onCreateBranch(createPayload);
                  if (!ok) return;
                  setFabOpen(false);
                  setCreatePayload(emptyBranchPayload());
                }}
                style={quickActionStyle}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MobileFullscreenTextEditor
        open={textEditor.open}
        label={textEditor.label}
        value={getTextEditorValue()}
        onChange={setTextEditorValue}
        onClose={closeTextEditor}
      />
    </div>
  );
}

const quickActionStyle = {
  appearance: "none",
  border: `1px solid ${MOBILE_THEME.borderSoft}`,
  background: MOBILE_THEME.ctaGradient,
  color: "#fff",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: MOBILE_THEME.ctaShadow,
};

const mobileInputStyle = {
  width: "100%",
  background: MOBILE_THEME.surfaceStrong,
  color: MOBILE_THEME.text,
  border: `1px solid ${MOBILE_THEME.borderSoft}`,
  borderRadius: 10,
  padding: "10px 12px",
};

function AppShell({ onLogout }) {
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return "tasks";
    return window.matchMedia("(max-width: 900px)").matches ? "today" : "tasks";
  });
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(max-width: 900px)").matches;
  });
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [todayStats, setTodayStats] = useState({ overdue: 0, today: 0 });
  const [mobileTasks, setMobileTasks] = useState([]);
  const [mobileClients, setMobileClients] = useState([]);
  const [mobileUsers, setMobileUsers] = useState([]);
  const [mobileBranches, setMobileBranches] = useState([]);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobile(media.matches);
    sync();

    if (media.addEventListener) media.addEventListener("change", sync);
    else media.addListener(sync);

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };
    const onAppInstalled = () => setInstallPromptEvent(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      if (media.removeEventListener) media.removeEventListener("change", sync);
      else media.removeListener(sync);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  // NOTE:
  // Keep tab-switch behavior side-effect free for editor screens.
  // Supabase JS handles token refresh automatically (autoRefreshToken=true).

  async function installApp() {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    try {
      await installPromptEvent.userChoice;
    } finally {
      setInstallPromptEvent(null);
    }
  }

  const desktopNavItems = [
    { key: "tasks", label: "Задачи" },
    { key: "clients", label: "Клиенты" },
    { key: "branches", label: "Филиалы" },
    { key: "sellout", label: "SELL-OUT" },
  ];
  const mobileNavItems = [
    { key: "today", label: "Сегодня" },
    { key: "tasks", label: "Задачи" },
    { key: "clients", label: "Клиенты" },
    { key: "branches", label: "Филиалы" },
    { key: "sellout", label: "SELL-OUT" },
    { key: "inbox", label: "Уведомл." },
  ];

  useEffect(() => {
    if (!isMobile) return;
    if (!["today", "tasks", "clients", "branches", "sellout", "inbox"].includes(page)) {
      setPage("today");
    }
  }, [isMobile, page]);


  async function refreshMobileData() {
    if (!isMobile) return;
    setInboxLoading(true);
    try {
      const [eventsRes, tasksRes, clientsRes, usersRes, branchesRes, profileRes] = await Promise.all([
        supabase
          .from("task_events")
          .select("id, event_type, payload, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("tasks")
          .select("id, title, description, due_date, status, result, comments, assigner_name, assignee_name, client, city, primary_client, created_at, updated_at, assigner_telegram_id, assignee_telegram_id, client_id, branch_id")
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("clients")
          .select("id, name, city, primary_client, status, responsible, inn, manager_contact, sales_channel, info, clients_responsible_manager, development_plan, client_work, visit_date, created_at, updated_at, branch_id")
          .order("updated_at", { ascending: false })
          .limit(80),
        supabase
          .from("users")
          .select("id, telegram_id, role, primary_client, first_name, last_name, username")
          .order("first_name", { ascending: true })
          .limit(200),
        supabase
          .from("branches")
          .select("id, name, primary_client, city, responsible, responsible_id, strategy_plan, branch_birthday, visit_date, trading_hall, training, director, ns_rp, ns_op, ns_kp, ns_smo, mpp, top_clients_sds, top_clients_branch, upcoming_events, new_products, catalogs_samples, comments, task_info, created_at, updated_at")
          .order("name", { ascending: true })
          .limit(200),
        supabase
          .from("users")
          .select("id, telegram_id, role, primary_client, first_name, last_name, username")
          .eq("id", localStorage.getItem("currentUserId") || "")
          .maybeSingle(),
      ]);

      if (!eventsRes.error) setInboxItems(eventsRes.data || []);
      if (!tasksRes.error) setMobileTasks(tasksRes.data || []);
      if (!clientsRes.error) setMobileClients(clientsRes.data || []);
      if (!usersRes.error) setMobileUsers(usersRes.data || []);
      if (!branchesRes.error) setMobileBranches(branchesRes.data || []);
      if (!profileRes.error) setCurrentUserProfile(profileRes.data || null);

      if (!tasksRes.error) {
        const now = new Date();
        const todayEnd = new Date(now);
        todayEnd.setHours(23, 59, 59, 999);
        const normalize = (v) => String(v || "").trim().toLowerCase();
        const isClosed = (s) => ["завершено", "archived", "completed"].includes(normalize(s));

        let overdue = 0;
        let today = 0;
        (tasksRes.data || []).forEach((t) => {
          if (!t?.due_date || isClosed(t.status)) return;
          const due = new Date(t.due_date);
          if (Number.isNaN(due.getTime())) return;
          if (due < now) overdue += 1;
          else if (due <= todayEnd) today += 1;
        });
        setTodayStats({ overdue, today });
      }
    } catch (error) {
      console.error("refreshMobileData failed:", error);
    } finally {
      setInboxLoading(false);
    }
  }

  const EDGE_NOTIFICATIONS_ENABLED = false;

  async function sendInAppTaskNotification({ recipientUserId, message, taskId = null }) {
    if (!EDGE_NOTIFICATIONS_ENABLED) return;
    if (!recipientUserId || !message) return;
    try {
      const { error } = await supabase.functions.invoke("notify-task", {
        body: {
          channel: "in_app",
          type: "task_reminder",
          assignee_user_id: String(recipientUserId),
          message,
          task_id: taskId,
        },
      });
      if (error) {
        console.error("notify-task invoke failed:", error);
      }
    } catch (error) {
      console.error("sendInAppTaskNotification failed:", error);
    }
  }

  async function notifyTaskCommentParticipantsMobile({ originalTask, nextComment }) {
    if (!originalTask) return;

    const authorUserId = String(localStorage.getItem("currentUserId") || "").trim();
    const findUserByTelegramId = (telegramId) =>
      (mobileUsers || []).find((user) => String(user?.telegram_id || "") === String(telegramId || ""));

    const assignerUser = findUserByTelegramId(originalTask.assigner_telegram_id);
    const assigneeUser = findUserByTelegramId(originalTask.assignee_telegram_id);
    const recipients = [assignerUser, assigneeUser]
      .filter(Boolean)
      .filter((user, index, arr) => arr.findIndex((u) => String(u.id) === String(user.id)) === index)
      .filter((user) => String(user.id || "") !== authorUserId);

    if (!recipients.length) return;

    const commentPreview = String(nextComment || "").replace(/\s+/g, " ").trim();
    const clippedComment = commentPreview.length > 120
      ? `${commentPreview.slice(0, 120)}...`
      : commentPreview;
    const message = `?? Новый комментарий к задаче «${originalTask.title || "Без названия"}»: ${clippedComment || "без текста"}`;

    await Promise.all(
      recipients.map((recipient) =>
        sendInAppTaskNotification({
          recipientUserId: recipient.id,
          message,
          taskId: originalTask.id,
        }),
      ),
    );
  }

  async function quickUpdateTaskStatus(taskId, nextStatus) {
    if (!taskId || !nextStatus) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) {
        console.error("quickUpdateTaskStatus failed:", error);
        return;
      }
      await refreshMobileData();
    } catch (error) {
      console.error("quickUpdateTaskStatus exception:", error);
    }
  }

  async function createTaskFromMobile(payload) {
    const title = String(payload?.title || "").trim();
    if (!title) return false;

    const client = String(payload?.client || "").trim();
    const currentRole = String(localStorage.getItem("currentUserRole") || "").toLowerCase();
    const currentPrimaryClient = String(localStorage.getItem("currentUserPrimaryClient") || "").trim();
    const base = {
      title,
      client: client || null,
      due_date: payload?.due_date || null,
      status: payload?.status || "В работе",
      primary_client: payload?.primary_client || currentPrimaryClient || currentUserProfile?.primary_client || null,
      city: payload?.city || null,
      description: payload?.description || null,
      result: payload?.result || null,
      comments: payload?.comments || null,
      branch_id: payload?.branch_id || null,
      client_id: payload?.client_id || null,
      assigner_name:
        [currentUserProfile?.first_name, currentUserProfile?.last_name].filter(Boolean).join(" ").trim() ||
        currentUserProfile?.username ||
        null,
      assigner_telegram_id: payload?.assigner_telegram_id || currentUserProfile?.telegram_id || null,
      assignee_telegram_id: payload?.assignee_telegram_id || null,
      updated_at: new Date().toISOString(),
    };

    // For jkam insert policy requires matching telegram-based ownership, so we mirror assigner to assignee.
    if (currentRole === "jkam" && currentUserProfile?.telegram_id) {
      base.assignee_telegram_id = currentUserProfile.telegram_id;
      base.assignee_name = base.assigner_name;
    }

    try {
      const { error } = await supabase.from("tasks").insert(base);
      if (error) {
        console.error("createTaskFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("createTaskFromMobile exception:", error);
      return false;
    }
  }

  async function saveTaskFromMobile(taskId, payload) {
    if (!taskId) return false;
    const originalTask = (mobileTasks || []).find((task) => String(task.id) === String(taskId));
    const oldComment = String(originalTask?.comments || "").trim();
    const nextComment = String(payload?.comments || "").trim();
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: payload?.title || null,
          client: payload?.client || null,
          primary_client: payload?.primary_client || null,
          due_date: payload?.due_date || null,
          status: payload?.status || "В работе",
          description: payload?.description || null,
          result: payload?.result || null,
          comments: payload?.comments || null,
          city: payload?.city || null,
          assigner_telegram_id: payload?.assigner_telegram_id || null,
          assignee_telegram_id: payload?.assignee_telegram_id || null,
          branch_id: payload?.branch_id || null,
          client_id: payload?.client_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId);
      if (error) {
        console.error("saveTaskFromMobile failed:", error);
        return false;
      }
      if (nextComment && nextComment !== oldComment) {
        await notifyTaskCommentParticipantsMobile({ originalTask, nextComment });
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("saveTaskFromMobile exception:", error);
      return false;
    }
  }

  async function deleteTaskFromMobile(taskId) {
    if (!taskId) return false;
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) {
        console.error("deleteTaskFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("deleteTaskFromMobile exception:", error);
      return false;
    }
  }

  async function createClientFromMobile(payload) {
    const name = String(payload?.name || "").trim();
    if (!name) return false;
    const currentRole = String(localStorage.getItem("currentUserRole") || "").toLowerCase();
    const isGlobal = currentRole === "admin" || currentRole === "rkp";
    const isJKAM = currentRole === "jkam";
    const resolvedPrimaryClient = String(
      payload?.primary_client ||
      localStorage.getItem("currentUserPrimaryClient") ||
      currentUserProfile?.primary_client ||
      ""
    ).trim();
    const responsibleAssignment = resolveResponsibleAssignment(mobileUsers, payload?.responsible);
    const fallbackCurrentUserId = String(localStorage.getItem("currentUserId") || "").trim() || null;
    const resolvedResponsibleId =
      responsibleAssignment.responsible_id || (isJKAM ? (currentUserProfile?.id || fallbackCurrentUserId) : null);

    if (!isGlobal && !isJKAM && !resolvedPrimaryClient) {
      console.error("createClientFromMobile skipped: primary_client is required for scoped role");
      return false;
    }
    if (isJKAM && !resolvedResponsibleId && !responsibleAssignment.responsible) {
      console.error("createClientFromMobile skipped: responsible is required for JKAM");
      return false;
    }

    try {
      const { error } = await supabase.from("clients").insert({
        name,
        status: payload?.status || "active",
        status_text: payload?.status || "active",
        city: payload?.city || null,
        primary_client: resolvedPrimaryClient || null,
        responsible: responsibleAssignment.responsible,
        responsible_id: resolvedResponsibleId,
        inn: payload?.inn ? String(payload.inn).replace(/\D/g, "") : null,
        manager_contact: payload?.manager_contact || null,
        sales_channel: payload?.sales_channel || null,
        info: payload?.info || null,
        clients_responsible_manager: payload?.clients_responsible_manager || null,
        development_plan: payload?.development_plan || null,
        client_work: payload?.client_work || null,
        visit_date: payload?.visit_date || null,
        branch_id: payload?.branch_id || null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error("createClientFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("createClientFromMobile exception:", error);
      return false;
    }
  }

  async function saveClientFromMobile(clientId, payload) {
    if (!clientId) return false;
    const responsibleAssignment = resolveResponsibleAssignment(mobileUsers, payload?.responsible);
    try {
      const { error } = await withTimeout(
        supabase
          .from("clients")
          .update({
            name: payload?.name || null,
            status: payload?.status || "active",
            status_text: payload?.status || "active",
            city: payload?.city || null,
            primary_client: payload?.primary_client || null,
            responsible: responsibleAssignment.responsible,
            responsible_id: responsibleAssignment.responsible_id,
            inn: payload?.inn ? String(payload.inn).replace(/\D/g, "") : null,
            manager_contact: payload?.manager_contact || null,
            sales_channel: payload?.sales_channel || null,
            info: payload?.info || null,
            clients_responsible_manager: payload?.clients_responsible_manager || null,
            development_plan: payload?.development_plan || null,
            client_work: payload?.client_work || null,
            visit_date: payload?.visit_date || null,
            branch_id: payload?.branch_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", clientId),
        15000,
        "Таймаут сохранения клиента."
      );
      if (error) {
        console.error("saveClientFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("saveClientFromMobile exception:", error);
      return false;
    }
  }

  async function deleteClientFromMobile(clientId) {
    if (!clientId) return false;
    try {
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) {
        console.error("deleteClientFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("deleteClientFromMobile exception:", error);
      return false;
    }
  }

  async function createBranchFromMobile(payload) {
    const name = String(payload?.name || "").trim();
    const primaryClient = String(payload?.primary_client || "").trim();
    if (!name || !primaryClient) return false;
    const responsibleAssignment = resolveResponsibleAssignment(mobileUsers, payload?.responsible);
    try {
      const { error } = await supabase.from("branches").insert({
        name,
        primary_client: primaryClient,
        city: payload?.city || null,
        responsible: responsibleAssignment.responsible,
        responsible_id: responsibleAssignment.responsible_id,
        strategy_plan: payload?.strategy_plan || null,
        branch_birthday: payload?.branch_birthday || null,
        visit_date: payload?.visit_date || null,
        trading_hall: payload?.trading_hall || null,
        training: payload?.training || null,
        director: payload?.director || null,
        ns_rp: payload?.ns_rp || null,
        ns_op: payload?.ns_op || null,
        ns_kp: payload?.ns_kp || null,
        ns_smo: payload?.ns_smo || null,
        mpp: payload?.mpp || null,
        top_clients_sds: payload?.top_clients_sds || null,
        top_clients_branch: payload?.top_clients_branch || null,
        upcoming_events: payload?.upcoming_events || null,
        new_products: payload?.new_products || null,
        catalogs_samples: payload?.catalogs_samples || null,
        comments: payload?.comments || null,
        task_info: payload?.task_info || null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.error("createBranchFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("createBranchFromMobile exception:", error);
      return false;
    }
  }

  async function saveBranchFromMobile(branchId, payload) {
    if (!branchId) return false;
    const responsibleAssignment = resolveResponsibleAssignment(mobileUsers, payload?.responsible);
    try {
      const { error } = await supabase
        .from("branches")
        .update({
          name: payload?.name || null,
          primary_client: payload?.primary_client || null,
          city: payload?.city || null,
          responsible: responsibleAssignment.responsible,
          responsible_id: responsibleAssignment.responsible_id,
          strategy_plan: payload?.strategy_plan || null,
          branch_birthday: payload?.branch_birthday || null,
          visit_date: payload?.visit_date || null,
          trading_hall: payload?.trading_hall || null,
          training: payload?.training || null,
          director: payload?.director || null,
          ns_rp: payload?.ns_rp || null,
          ns_op: payload?.ns_op || null,
          ns_kp: payload?.ns_kp || null,
          ns_smo: payload?.ns_smo || null,
          mpp: payload?.mpp || null,
          top_clients_sds: payload?.top_clients_sds || null,
          top_clients_branch: payload?.top_clients_branch || null,
          upcoming_events: payload?.upcoming_events || null,
          new_products: payload?.new_products || null,
          catalogs_samples: payload?.catalogs_samples || null,
          comments: payload?.comments || null,
          task_info: payload?.task_info || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", branchId);
      if (error) {
        console.error("saveBranchFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("saveBranchFromMobile exception:", error);
      return false;
    }
  }

  async function deleteBranchFromMobile(branchId) {
    if (!branchId) return false;
    try {
      // Best-effort cleanup for related clients.
      await supabase.from("clients").update({ branch_id: null }).eq("branch_id", branchId);
      const { error } = await supabase.from("branches").delete().eq("id", branchId);
      if (error) {
        console.error("deleteBranchFromMobile failed:", error);
        return false;
      }
      await refreshMobileData();
      return true;
    } catch (error) {
      console.error("deleteBranchFromMobile exception:", error);
      return false;
    }
  }

  useEffect(() => {
    if (!isMobile) return;
    refreshMobileData();
  }, [isMobile]);

  function renderPage() {
    switch (page) {
      case "today":
        return (
          <MobileTodayPage
            stats={todayStats}
            onOpenTasks={() => setPage("tasks")}
            onOpenClients={() => setPage("clients")}
          />
        );
      case "inbox":
        return <MobileInboxPage items={inboxItems} loading={inboxLoading} onRefresh={refreshMobileData} />;
      case "clients":
        return isMobile ? (
          <MobileClientsPage
            clients={mobileClients}
            loading={inboxLoading}
            onRefresh={refreshMobileData}
            onCreateClient={createClientFromMobile}
            onSaveClient={saveClientFromMobile}
            onDeleteClient={deleteClientFromMobile}
            users={mobileUsers}
            branches={mobileBranches}
          />
        ) : <Clients />;
      case "branches":
        return isMobile ? (
          <MobileBranchesPage
            branches={mobileBranches}
            clients={mobileClients}
            loading={inboxLoading}
            onRefresh={refreshMobileData}
            onCreateBranch={createBranchFromMobile}
            onSaveBranch={saveBranchFromMobile}
            onDeleteBranch={deleteBranchFromMobile}
            users={mobileUsers}
          />
        ) : <Branches />;
      case "sellout":
        return <SellOut />;
      case "tasks":
      default:
        return isMobile ? (
          <MobileTasksPage
            tasks={mobileTasks}
            loading={inboxLoading}
            onRefresh={refreshMobileData}
            onQuickStatus={quickUpdateTaskStatus}
            onCreateTask={createTaskFromMobile}
            onSaveTask={saveTaskFromMobile}
            onDeleteTask={deleteTaskFromMobile}
            users={mobileUsers}
            clients={mobileClients}
            branches={mobileBranches}
          />
        ) : <Tasks />;
    }
  }

  const tabStyle = (key, active) => ({
    appearance: "none",
    border: `1px solid ${active ? "transparent" : MOBILE_THEME.border}`,
    cursor: "pointer",
    padding: isMobile ? "clamp(8px, 2.6vw, 11px) clamp(10px, 3vw, 14px)" : "10px 14px",
    borderRadius: 12,
    fontWeight: 700,
    margin: isMobile ? "0" : "4px",
    width: "auto",
    minWidth: isMobile ? "clamp(74px, 20vw, 96px)" : undefined,
    flex: isMobile ? "0 0 auto" : undefined,
    background: active ? (MOBILE_THEME.activeByTab[key] || MOBILE_THEME.ctaGradient) : MOBILE_THEME.surface,
    color: "#fff",
    fontSize: isMobile ? "clamp(11px, 3vw, 13px)" : 14,
    boxShadow: active
      ? "0 8px 22px rgba(17,24,39,.35), inset 0 0 0 1px rgba(255,255,255,.18)"
      : "0 4px 12px rgba(0,0,0,.2)",
  });

  const secondaryButton = {
    appearance: "none",
    border: `1px solid ${MOBILE_THEME.border}`,
    background: MOBILE_THEME.surface,
    color: MOBILE_THEME.text,
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const desktopBtnStyle = (active) => ({
    appearance: "none",
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 10,
    fontWeight: 700,
    margin: "4px",
    background: active ? "linear-gradient(180deg,#f97316,#ea580c)" : "#182129",
    color: "#fff",
    boxShadow: active
      ? "0 8px 22px rgba(227,27,35,.28), inset 0 0 0 1px rgba(255,255,255,.2)"
      : "0 4px 12px rgba(0,0,0,.2)",
  });

  if (!isMobile) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b1014", color: "#eaf1f4" }}>
        <nav style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", padding: "16px 8px" }}>
          {desktopNavItems.map((item) => (
            <button key={item.key} onClick={() => setPage(item.key)} style={desktopBtnStyle(page === item.key)}>
              {item.label}
            </button>
          ))}
          <button onClick={onLogout} style={desktopBtnStyle(false)}>Выйти</button>
        </nav>
        <div>{renderPage()}</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: MOBILE_THEME.appBackground, color: MOBILE_THEME.text }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(12,18,22,.9)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${MOBILE_THEME.border}`,
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 700, letterSpacing: ".2px" }}>CRM</div>
          <div style={{ display: "flex", gap: 8 }}>
            {installPromptEvent ? (
              <button onClick={installApp} style={secondaryButton}>Установить</button>
            ) : null}
            <button onClick={onLogout} style={secondaryButton}>Выйти</button>
          </div>
        </div>
      </header>

      <main style={{ paddingBottom: "calc(clamp(78px, 16vw, 96px) + env(safe-area-inset-bottom, 0px))" }}>
        {renderPage()}
      </main>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 30,
          padding: "clamp(6px, 2vw, 10px) clamp(8px, 2.8vw, 12px) calc(clamp(6px, 2vw, 10px) + env(safe-area-inset-bottom, 0px))",
          borderTop: `1px solid ${MOBILE_THEME.border}`,
          background: "rgba(12,18,22,.94)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {mobileNavItems.map((item) => (
            <button key={item.key} onClick={() => setPage(item.key)} style={tabStyle(item.key, page === item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);
  const authHost = useMemo(() => {
    try {
      return new URL(String(import.meta.env.VITE_SUPABASE_URL || "")).host || "Supabase";
    } catch {
      return "Supabase";
    }
  }, []);

  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingLogin, setCheckingLogin] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [busyAction, setBusyAction] = useState(false);
  const loggedInRef = useRef(false);

  const isPublicAuthRoute = useMemo(
    () => ["/login", "/signup", "/register", "/forgot-password", "/reset-password"].includes(location.pathname),
    [location.pathname]
  );

  useEffect(() => {
    loggedInRef.current = loggedIn;
  }, [loggedIn]);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!checkingLogin) return undefined;

    const timer = setTimeout(() => {
      if (loggedInRef.current) return;
      console.error("Auth check watchdog timeout: forcing exit from checking state");
      setCheckingLogin(false);
      setLoginError((prev) => prev || "Проверка доступа заняла слишком много времени. Попробуйте войти снова.");
    }, 25000);

    return () => clearTimeout(timer);
  }, [checkingLogin]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          12000,
          `Таймаут проверки сессии (${authHost}).`
        );
        if (error) {
          console.error("getSession failed:", error);
          setLoginError("Не удалось проверить сессию.");
          setLoggedIn(false);
          setCheckingLogin(false);
          return;
        }

        const sessionUser = data?.session?.user || null;

        if (!sessionUser) {
          setCheckingLogin(false);
          return;
        }

        if (pathnameRef.current === "/reset-password") {
          setCheckingLogin(false);
          return;
        }

        await loadAccessProfile(sessionUser.id, { strict: true });
      } catch (error) {
        console.error("Auth init failed:", error);
        setLoginError("Ошибка проверки доступа.");
        setLoggedIn(false);
        setCheckingLogin(false);
      }
    };

    init();

    const handleAuthStateChange = async (event, session) => {
      try {
        const authUser = session?.user || null;

        if (!authUser) {
          if (event !== "SIGNED_OUT" && loggedInRef.current) {
            // Transient auth-state blips (background tab/token refresh race)
            // must not force logout while user is actively logged in.
            setCheckingLogin(false);
            return;
          }
          clearLocalAccessContext();
          setLoggedIn(false);
          setCheckingLogin(false);
          return;
        }

        if (event === "PASSWORD_RECOVERY" || pathnameRef.current === "/reset-password") {
          setCheckingLogin(false);
          return;
        }

        const shouldReloadProfile =
          event === "SIGNED_IN" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION";

        if (!shouldReloadProfile) {
          setCheckingLogin(false);
          return;
        }

        const strict = !loggedInRef.current;
        await loadAccessProfile(authUser.id, { strict });
      } catch (error) {
        console.error("onAuthStateChange failed:", error);
        setCheckingLogin(false);
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Avoid awaiting Supabase calls inside auth callback itself:
      // this can deadlock internal auth locks after tab switches.
      setTimeout(() => {
        void handleAuthStateChange(event, session);
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [authHost]);

  async function loadAccessProfile(authUserId, { strict = true } = {}) {
    // For already logged-in users keep background refresh non-blocking:
    // don't switch app into "Проверка доступа..." overlay.
    if (strict || !loggedInRef.current) {
      setCheckingLogin(true);
    }
    setLoginError("");

    try {
      function isNoRowsLookupError(err) {
        const code = String(err?.code || "").toUpperCase();
        const message = String(err?.message || "").toLowerCase();
        const details = String(err?.details || "").toLowerCase();
        return (
          code === "PGRST116" ||
          message.includes("0 rows") ||
          message.includes("no rows") ||
          details.includes("0 rows")
        );
      }

      function isAbortSignalError(err) {
        const code = String(err?.code || "");
        const name = String(err?.name || "");
        const message = String(err?.message || "").toLowerCase();
        const details = String(err?.details || "").toLowerCase();
        return (
          code === "20" ||
          name === "AbortError" ||
          message.includes("aborterror") ||
          message.includes("signal is aborted") ||
          details.includes("aborterror")
        );
      }

      function readProfileByAuthId(controller = null) {
        let query = supabase
          .from("users")
          .select("id, auth_user_id, branch_id, is_admin, role, primary_client")
          .eq("auth_user_id", authUserId)
          .maybeSingle();
        if (controller) {
          query = query.abortSignal(controller.signal);
        }
        return query;
      }

      async function runWithAbortFallback(buildRequest, { label, abortMs = 20000, timeoutMs = 22000 }) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), abortMs);
        try {
          const result = await withTimeout(
            buildRequest(controller),
            timeoutMs,
            `${label} (таймаут).`
          );

          if (result?.error && isAbortSignalError(result.error)) {
            console.warn(`${label}: abort detected, retrying without abortSignal`);
            return await withTimeout(
              buildRequest(null),
              timeoutMs,
              `${label} (повторный таймаут).`
            );
          }
          return result;
        } catch (error) {
          if (isAbortSignalError(error)) {
            console.warn(`${label}: abort exception, retrying without abortSignal`);
            return await withTimeout(
              buildRequest(null),
              timeoutMs,
              `${label} (повторный таймаут).`
            );
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }

      async function ensureAndReloadProfile() {
        let ensureResult;
        try {
          ensureResult = await runWithAbortFallback(
            (controller) => {
              let query = supabase.rpc("crm_ensure_user_profile", { p_auth_user_id: authUserId });
              if (controller) query = query.abortSignal(controller.signal);
              return query;
            },
            { label: "Авто-привязка профиля" }
          );
        } catch (timeoutError) {
          return { data: null, error: timeoutError };
        }

        if (ensureResult.error) {
          return { data: null, error: ensureResult.error };
        }

        let retryResult;
        try {
          retryResult = await runWithAbortFallback(
            (controller) => readProfileByAuthId(controller),
            { label: "Повторное чтение профиля" }
          );
        } catch (timeoutError) {
          return { data: null, error: timeoutError };
        }
        return retryResult;
      }

      let profileLookupResult;
      try {
        profileLookupResult = await runWithAbortFallback(
          (controller) => readProfileByAuthId(controller),
          { label: "Загрузка профиля доступа" }
        );
      } catch (timeoutError) {
        profileLookupResult = { data: null, error: timeoutError };
      }
      let { data, error } = profileLookupResult;

      if (error && isNoRowsLookupError(error)) {
        error = null;
        data = null;
      }

      if (error) {
        const recovered = await ensureAndReloadProfile();
        if (recovered.error || !recovered.data) {
          console.error("Profile lookup failed:", error);
          if (recovered.error) console.error("Profile ensure failed:", recovered.error);
          if (strict) {
            setLoginError("Не удалось загрузить профиль доступа.");
            setLoggedIn(false);
          }
          setCheckingLogin(false);
          return false;
        }
        data = recovered.data;
      }

      if (!data) {
        const recovered = await ensureAndReloadProfile();
        if (recovered.error || !recovered.data) {
          if (recovered.error) console.error("Profile ensure failed:", recovered.error);
          if (strict) {
            setLoginError("Профиль доступа не найден после авто-привязки. Проверьте SQL-миграции в Supabase.");
            setLoggedIn(false);
          }
          setCheckingLogin(false);
          return false;
        }
        data = recovered.data;
      }

      const role = normalizeRole(data.role) || (data.is_admin ? "admin" : "");
      localStorage.setItem("currentAuthUserId", authUserId);
      localStorage.setItem("currentUserRole", role);

      if (data.id) localStorage.setItem("currentUserId", data.id);
      else localStorage.removeItem("currentUserId");

      if (data.branch_id) localStorage.setItem("currentUserBranchId", data.branch_id);
      else localStorage.removeItem("currentUserBranchId");

      if (data.primary_client) {
        localStorage.setItem("currentUserPrimaryClient", data.primary_client);
      } else {
        localStorage.removeItem("currentUserPrimaryClient");
      }

      setLoggedIn(true);
      setCheckingLogin(false);
      return true;
    } catch (error) {
      console.error("loadAccessProfile failed:", error);
      if (strict) {
        setLoginError("Ошибка инициализации доступа. Проверьте сеть и настройки Supabase.");
        setLoggedIn(false);
      }
      setCheckingLogin(false);
      return false;
    }
  }

  async function login(email, password) {
    setBusyAction(true);
    setLoginError("");

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        15000,
        `Таймаут входа (${authHost}). Проверьте интернет и доступ к Supabase.`
      );

      if (error || !data?.user) {
        setLoginError(mapLoginErrorMessage(error, authHost));
        return;
      }

      const ok = await loadAccessProfile(data.user.id);
      if (ok) navigate("/");
    } catch (error) {
      console.error("Login failed:", error);
      setLoginError(mapLoginErrorMessage(error, authHost));
    } finally {
      setBusyAction(false);
    }
  }

  async function signup(email, password) {
    setBusyAction(true);

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: email.trim(),
          password,
        }),
        15000,
        "Таймаут регистрации. Попробуйте снова."
      );

      if (error) {
        console.error("Signup failed:", error);
        return { ok: false, message: error.message || "Не удалось зарегистрироваться." };
      }

      // If email confirmation is disabled, user may receive an immediate session.
      // In this case, create/link profile now and enter CRM right away.
      if (data?.session && data?.user?.id) {
        const ok = await loadAccessProfile(data.user.id);
        if (ok) {
          navigate("/");
          return { ok: true, message: "Регистрация завершена. Профиль создан и привязан автоматически." };
        }
      }

      return {
        ok: true,
        message:
          "Запрос на регистрацию принят. Подтвердите email (если включено подтверждение). Профиль CRM создается и привязывается автоматически.",
      };
    } catch (error) {
      console.error("Signup exception:", error);
      return { ok: false, message: "Ошибка регистрации." };
    } finally {
      setBusyAction(false);
    }
  }

  async function forgotPassword(email) {
    setBusyAction(true);

    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        15000,
        "Таймаут отправки письма восстановления."
      );

      if (error) {
        console.error("Password recovery failed:", error);
        return { ok: false, message: error.message || "Не удалось отправить письмо." };
      }

      return { ok: true, message: "Если email существует, письмо отправлено." };
    } catch (error) {
      console.error("Password recovery exception:", error);
      return { ok: false, message: "Ошибка отправки письма." };
    } finally {
      setBusyAction(false);
    }
  }

  async function resetPassword(nextPassword) {
    setBusyAction(true);

    try {
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password: nextPassword }),
        15000,
        "Таймаут обновления пароля."
      );

      if (error) {
        console.error("Password update failed:", error);
        return { ok: false, message: error.message || "Не удалось обновить пароль." };
      }

      return { ok: true, message: "Пароль обновлен. Теперь можно войти с новым паролем." };
    } catch (error) {
      console.error("Password update exception:", error);
      return { ok: false, message: "Ошибка обновления пароля." };
    } finally {
      setBusyAction(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    clearLocalAccessContext();
    setLoggedIn(false);
    setLoginError("");
    navigate("/login");
  }

  if (checkingLogin && !isPublicAuthRoute && !loggedIn) {
    return (
      <div style={pageShellStyle}>
        <p>Проверка доступа...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loggedIn ? <Navigate to="/" replace /> : <LoginPage onLogin={login} loading={busyAction} error={loginError} />
        }
      />
      <Route
        path="/signup"
        element={loggedIn ? <Navigate to="/" replace /> : <SignupPage onSignup={signup} loading={busyAction} />}
      />
      <Route
        path="/register"
        element={loggedIn ? <Navigate to="/" replace /> : <SignupPage onSignup={signup} loading={busyAction} />}
      />
      <Route
        path="/forgot-password"
        element={loggedIn ? <Navigate to="/" replace /> : <ForgotPasswordPage onForgot={forgotPassword} loading={busyAction} />}
      />
      <Route path="/reset-password" element={<ResetPasswordPage onReset={resetPassword} loading={busyAction} />} />
      <Route path="*" element={loggedIn ? <AppShell onLogout={logout} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}

async function prepareRuntime() {
  if (!("serviceWorker" in navigator)) return;

  if (!import.meta.env.PROD) {
    // Important: clear stale prod service workers before app boot in dev,
    // otherwise auth/network requests can hang due to old cache handlers.
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    return;
  }

  navigator.serviceWorker.register("/sw.js").catch((error) => {
    console.error("Service Worker registration failed:", error);
  });
}

async function bootstrap() {
  try {
    await prepareRuntime();
  } catch (error) {
    console.error("Runtime preparation failed:", error);
  }

  const rootElement = document.getElementById("root");
  if (!rootElement) return;

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

bootstrap();


