// src/Clients.jsx
// Страница управления клиентами. Позволяет просматривать существующих клиентов,
// добавлять новых и смотреть основную информацию. Структура таблицы
// соответствует новой схеме БД с колонками primary_client и branch_id.

import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { normalizeSearchText, normalizedIncludes } from "./searchUtils";

const CLIENT_DRAFT_KEY = "crm_clients_new_draft_v1";
const CLIENTS_UI_STATE_KEY = "crm_clients_ui_state_v1";
const CLIENT_EDIT_MODAL_DRAFT_PREFIX = "crm_clients_edit_modal_draft_v1:";
const EMPTY_NEW_CLIENT = {
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
  branch_id: "",
  visit_date: "",
};

// Локальные компоненты UI. Копируются из Tasks.jsx для единообразия.
function Wrap({ children }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        gap: 12,
        padding: 16,
        background: "#0b1014",
        color: "#eaf1f4",
      }}
    >
      {children}
    </main>
  );
}
function Card({ children, style }) {
  return (
    <section
      style={{
        background: "#182129",
        border: "1px solid #2f3d49",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}
function H1({ children }) {
  return <h1 style={{ margin: 0 }}>{children}</h1>;
}
function Input(props) {
  return (
    <input
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#0f151b",
        border: "1px solid #334756",
        color: "#eaf1f4",
        ...(props.style || {}),
      }}
    />
  );
}
function Textarea(props) {
  return (
    <textarea
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#0f151b",
        border: "1px solid #334756",
        color: "#eaf1f4",
        minHeight: 80,
        resize: "vertical",
        ...(props.style || {}),
      }}
    />
  );
}
function Btn({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        appearance: "none",
        border: "none",
        cursor: "pointer",
        padding: "10px 14px",
        borderRadius: 10,
        fontWeight: 700,
        background: "linear-gradient(180deg,#f97316,#ea580c)",
        color: "#fff",
        boxShadow: "0 8px 22px rgba(227,27,35,.28), inset 0 0 0 1px rgba(255,255,255,.2)",
        opacity: rest.disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

// Компонент кнопки для действий
function ActionButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px 12px",
        borderRadius: 6,
        background: "linear-gradient(180deg,#3b82f6,#1d4ed8)",
        color: "#fff",
        fontSize: "12px",
        fontWeight: 600,
        margin: "0 4px",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Модальное окно для редактирования полей
function EditModal({ field, value, label, type = "text", onSave, onClose, multiline = false, options = null, isUserSelect = false, users = [], isPrimaryClientSelect = false, primaryClients = [], draftKey = null }) {
  const [tempValue, setTempValue] = useState(value || "");
  const [isSaving, setIsSaving] = useState(false);
  const modalRef = useRef(null);

  // Определяем размер модального окна в зависимости от типа поля
  const getModalSize = () => {
    if (multiline) {
      return { width: "90%", maxWidth: "800px", maxHeight: "85vh" };
    } else if (isPrimaryClientSelect || isUserSelect || (options && type === "select")) {
      return { width: "90%", maxWidth: "500px", maxHeight: "70vh" };
    } else {
      return { width: "90%", maxWidth: "500px", maxHeight: "60vh" };
    }
  };

  const modalSize = getModalSize();

  // Обработчик горячих клавиш
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tempValue, isSaving, onClose, onSave]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw === null) return;
      const parsed = JSON.parse(raw);
      setTempValue(parsed ?? "");
    } catch {
      // ignore malformed draft
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(tempValue ?? ""));
    } catch {
      // ignore sessionStorage errors
    }
  }, [draftKey, tempValue]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const SAVE_TIMEOUT_TOKEN = "__save_timeout__";
      const result = await Promise.race([
        Promise.resolve(onSave(tempValue)),
        new Promise((resolve) => setTimeout(() => resolve(SAVE_TIMEOUT_TOKEN), 16000)),
      ]);
      if (result === SAVE_TIMEOUT_TOKEN) {
        alert("Сохранение заняло слишком много времени. Проверьте подключение и попробуйте еще раз.");
        return;
      }
      if (result === false) return;
      if (draftKey) {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
      }
      onClose();
    } catch (err) {
      console.error("Client edit save failed:", err);
      alert("Не удалось сохранить изменения. Попробуйте еще раз.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = () => {
    if (isPrimaryClientSelect) {
      return (
        <div style={{ marginTop: 8 }}>
          <Input
            type="text"
            placeholder="Поиск клиента..."
            style={{ width: "100%", marginBottom: 12 }}
            onChange={(e) => {
              // Фильтрация будет реализована при вводе
              // В реальном приложении здесь может быть поиск по API
            }}
          />
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {primaryClients.map((client) => (
              <div
                key={client}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #2f3d49",
                  cursor: "pointer",
                  background: tempValue === client ? "#334756" : "transparent",
                  borderRadius: 6,
                  transition: "background 0.2s ease",
                }}
                onClick={() => setTempValue(client)}
                onMouseEnter={(e) => {
                  if (tempValue !== client) {
                    e.currentTarget.style.background = "#121920";
                  }
                }}
                onMouseLeave={(e) => {
                  if (tempValue !== client) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                {client}
              </div>
            ))}
          </div>
        </div>
      );
    } else if (isUserSelect) {
      return (
        <div style={{ marginTop: 8 }}>
          <Input
            type="text"
            placeholder="Поиск пользователя..."
            style={{ width: "100%", marginBottom: 12 }}
            onChange={(e) => {
              // Фильтрация будет реализована при вводе
              // В реальном приложении здесь может быть поиск по API
            }}
          />
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            <select
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 8,
                background: "#0f151b",
                border: "1px solid #334756",
                color: "#eaf1f4",
                fontSize: "14px",
              }}
              size={Math.min(10, users.length)}
              autoFocus
            >
              <option value="">Выберите ответственного...</option>
              {users
                .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                .map((user) => (
                <option key={String(user.id || user.telegram_id)} value={user.telegram_id}>
                  {formatUserName(user)}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    } else if (options && type === "select") {
      return (
        <select
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 8,
            background: "#0f151b",
            border: "1px solid #334756",
            color: "#eaf1f4",
            fontSize: "14px",
            marginTop: 8,
          }}
          autoFocus
        >
          <option value="">Выберите...</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    } else if (multiline) {
      return (
        <Textarea
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%", 
            minHeight: 200,
            fontSize: "14px",
            lineHeight: "1.5",
            marginTop: 8,
          }}
          autoFocus
        />
      );
    } else if (type === "date") {
      return (
        <Input
          type="date"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%",
            padding: "12px 16px",
            fontSize: "14px",
            marginTop: 8,
          }}
          autoFocus
        />
      );
    } else if (field === "inn") {
      return (
        <Input
          type="text"
          value={tempValue}
          onChange={(e) => {
            // Разрешаем только цифры
            const numericValue = e.target.value.replace(/\D/g, "");
            setTempValue(numericValue);
          }}
          placeholder="Введите 10 или 12 цифр"
          style={{ 
            width: "100%",
            padding: "12px 16px",
            fontSize: "14px",
            marginTop: 8,
          }}
          autoFocus
          maxLength={12}
        />
      );
    } else {
      return (
        <Input
          type="text"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%",
            padding: "12px 16px",
            fontSize: "14px",
            marginTop: 8,
          }}
          autoFocus
        />
      );
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        style={{
          background: "#182129",
          border: "1px solid #334756",
          borderRadius: 12,
          padding: 24,
          width: modalSize.width,
          maxWidth: modalSize.maxWidth,
          maxHeight: modalSize.maxHeight,
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#3b82f6", fontSize: "18px" }}>Редактирование: {label}</h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9fb1bb",
              fontSize: "20px",
              cursor: "pointer",
              padding: "0 8px",
            }}
          >
            ×
          </button>
        </div>
        
        {renderField()}
        
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Btn onClick={handleSave} disabled={isSaving} style={{ flex: 1, fontSize: "14px", padding: "12px 16px" }}>
            {isSaving ? "Сохранение..." : "Сохранить (Ctrl+Enter)"}
          </Btn>
          <Btn
            onClick={onClose}
            style={{
              flex: 1,
              background: "linear-gradient(180deg,#6b7280,#4b5563)",
              fontSize: "14px",
              padding: "12px 16px",
            }}
          >
            Отмена (Esc)
          </Btn>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: "#9fb1bb", textAlign: "center" }}>
          Используйте Ctrl+Enter для сохранения, Esc для отмены
        </div>
      </div>
    </div>
  );
}

// Компонент для отображения поля в режиме просмотра с возможностью клика для редактирования
function EditableField({ label, value, field, onEdit, type = "text", multiline = false, options = null, isUserSelect = false, users = [], isPrimaryClientSelect = false }) {
  const displayValue = () => {
    if (field === "inn") {
      return value ? String(value).replace(/\D/g, "") : "";
    }
    if (isUserSelect) {
      const user = users.find(u => String(u.telegram_id) === String(value));
      return user ? formatUserName(user) : value || "";
    }
    if (options && type === "select") {
      const option = options.find(opt => opt.value === value);
      return option ? option.label : value || "";
    }
    return value || "";
  };

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        background: "#0f151b",
        borderRadius: 8,
        border: "1px solid #2f3d49",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onClick={() => onEdit(field, value, label, type, multiline, options, isUserSelect, isPrimaryClientSelect)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#3b82f6";
        e.currentTarget.style.background = "#0f151b";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2f3d49";
        e.currentTarget.style.background = "#0f151b";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ fontSize: "12px", color: "#9fb1bb", marginBottom: 6, fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          whiteSpace: multiline ? "pre-wrap" : "normal",
          wordBreak: "break-word",
          overflow: "hidden",
          minHeight: multiline ? 40 : "auto",
          color: value ? "#eaf1f4" : "#6b7280",
          fontSize: "14px",
          lineHeight: "1.4",
        }}
      >
        {displayValue() || <span style={{ fontStyle: "italic" }}>Не указано</span>}
      </div>
      <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 6, textAlign: "right", opacity: 0.8 }}>
        Кликните для редактирования
      </div>
    </div>
  );
}

// Фильтры
function Filters({ filters, onFilterChange, branches, statusOptions, users, primaryClients }) {
  return (
    <Card style={{ width: "100%", maxWidth: 1200, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Фильтры</h3>
      <div style={{ marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Поиск по названию
          </label>
          <Input
            placeholder="Например, Техмех"
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Статус
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange('status', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="">Все статусы</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{getStatusText(status)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Город
          </label>
          <Input
            placeholder="Фильтр по городу"
            value={filters.city}
            onChange={(e) => onFilterChange('city', e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Клиент 1 порядка
          </label>
          <select
            value={filters.primary_client}
            onChange={(e) => onFilterChange('primary_client', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="">Все клиенты</option>
            {primaryClients.map((client) => (
              <option key={client} value={client}>{client}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Филиал
          </label>
          <select
            value={filters.branch_id}
            onChange={(e) => onFilterChange('branch_id', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="">Все филиалы</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Ответственный
          </label>
          <select
            value={filters.responsible}
            onChange={(e) => onFilterChange('responsible', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="">Все ответственные</option>
            {users
              .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
              .map((user) => (
              <option key={String(user.id || user.telegram_id)} value={user.telegram_id}>
                {formatUserName(user)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn onClick={() => onFilterChange('reset', null)} style={{ background: "linear-gradient(180deg,#6b7280,#4b5563)" }}>
          Сбросить фильтры
        </Btn>
      </div>
    </Card>
  );
}

// Вспомогательная функция для форматирования имени пользователя
function formatUserName(user) {
  if (!user) return "";
  const parts = [];
  if (user.first_name) parts.push(user.first_name);
  if (user.last_name) parts.push(user.last_name);
  if (user.username) parts.push(`(@${user.username})`);
  if (user.role) parts.push(`[${getRoleText(user.role)}]`);
  return parts.join(' ') || `Telegram ID: ${user.telegram_id}`;
}

// Вспомогательная функция для получения текста роли
function getRoleText(role) {
  const roleMap = {
    'admin': 'Администратор',
    'RKP': 'Руководитель клиентского портфеля',
    'KAM': 'Ключевой аккаунт менеджер',
    'JKAM': 'Младший KAM',
    'regional_manager': 'Региональный менеджер'
  };
  return roleMap[role] || role;
}

// Вспомогательная функция для получения текста статуса
function getStatusText(status) {
  const statusMap = {
    'active': 'В работе',
    'archived': 'Архив',
    'pending': 'Результат на согласовании',
    'completed': 'Завершено',
    'В работе': 'В работе',
    'Архив': 'Архив',
    'выполняется': 'В работе',
    'Выполняется': 'В работе',
    'Просрочена': 'Просрочена',
    'Ожидание': 'Результат на согласовании',
    'Результат на согласовании': 'Результат на согласовании',
    'Завершен': 'Завершено',
    'Завершено': 'Завершено',
    'Завершена': 'Завершено'
  };
  return statusMap[status] || status;
}

function normalizeClientStatus(status) {
  const raw = String(status || "").trim();
  if (!raw) return raw;

  const normalized = raw.toLowerCase();

  if (normalized === "active" || normalized === "в работе" || normalized === "выполняется") {
    return "active";
  }
  if (normalized === "archived" || normalized === "архив" || normalized === "архива") {
    return "archived";
  }
  if (normalized === "pending" || normalized === "ожидание") {
    return "Результат на согласовании";
  }
  if (normalized === "completed" || normalized === "завершен" || normalized === "завершена" || normalized === "завершено") {
    return "Завершено";
  }

  return raw;
}

function normalizeClientSearch(value) {
  return normalizeSearchText(value, {
    stripQuotes: true,
    stripLegalForms: true,
  });
}

function normalizeTaskRole(role) {
  const v = String(role || "").toLowerCase();
  if (v === "admin") return "admin";
  if (v === "rkp") return "rkp";
  if (v === "kam") return "kam";
  if (v === "jkam") return "jkam";
  if (v === "regional_manager" || v === "regional manager" || v === "regional") return "regional_manager";
  return v;
}

function normalizeDueDateForTask(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(`${raw}T23:59:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function shouldClearTaskDueDate(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return normalized === "пауза" || normalized === "завершено" || normalized === "завершена" || normalized === "завершен";
}

function CreateTaskForClientModal({ client, users = [], branches = [], onClose, onCreated }) {
  const statusOptions = [
    { value: "Выполняется", label: "В работе" },
    { value: "Просрочена", label: "Просрочена" },
    { value: "Результат на согласовании", label: "Результат на согласовании" },
    { value: "Завершено", label: "Завершено" },
  ];

  const SELF_ASSIGNMENT_ROLES = ["admin", "rkp", "kam", "jkam", "regional_manager"];
  const ROLE_ASSIGNMENT_MAP = {
    admin: ["rkp", "kam", "jkam", "regional_manager"],
    rkp: ["kam", "jkam", "regional_manager"],
    kam: ["jkam", "regional_manager"],
    jkam: ["regional_manager"],
    regional_manager: [],
  };

  const [taskData, setTaskData] = useState({
    title: "",
    due_date: "",
    description: "",
    status: "Выполняется",
    assigner_telegram_id: "",
    assignee_telegram_id: "",
    branch_id: client?.branch_id || "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const getCurrentUser = () => {
    const currentUserId = String(localStorage.getItem("currentUserId") || "");
    if (currentUserId) {
      const byId = users.find((u) => String(u.id) === currentUserId);
      if (byId) return byId;
    }
    return null;
  };

  const getAvailableAssignees = (assignerUser) => {
    if (!assignerUser) return [];
    const assignerRole = normalizeTaskRole(assignerUser.role);
    const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
    let availableUsers = [];

    if (assignerRole === "admin") {
      availableUsers = users.filter((u) => u.telegram_id && String(u.telegram_id) !== String(assignerUser.telegram_id));
    } else {
      availableUsers = users.filter((u) => {
        const role = normalizeTaskRole(u.role);
        return u.telegram_id && allowedRoles.includes(role) && u.primary_client === assignerUser.primary_client;
      });
    }

    if (SELF_ASSIGNMENT_ROLES.includes(assignerRole) && !availableUsers.some((u) => u.id === assignerUser.id)) {
      availableUsers.unshift(assignerUser);
    }

    if (client?.responsible) {
      const responsibleUser = users.find((u) => String(u.telegram_id) === String(client.responsible));
      if (responsibleUser && !availableUsers.some((u) => u.id === responsibleUser.id)) {
        availableUsers.push(responsibleUser);
      }
    }

    return availableUsers;
  };

  useEffect(() => {
    const currentUser = getCurrentUser();
    const assignerTelegram = currentUser?.telegram_id ? String(currentUser.telegram_id) : "";
    const available = getAvailableAssignees(currentUser);
    const preferredAssignee = client?.responsible
      ? available.find((u) => String(u.telegram_id) === String(client.responsible))
      : null;

    setTaskData((prev) => ({
      ...prev,
      assigner_telegram_id: assignerTelegram,
      assignee_telegram_id: preferredAssignee?.telegram_id ? String(preferredAssignee.telegram_id) : (available[0]?.telegram_id ? String(available[0].telegram_id) : ""),
      branch_id: client?.branch_id || prev.branch_id || "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, users.length]);

  const currentAssigner = users.find((u) => String(u.telegram_id) === String(taskData.assigner_telegram_id));
  const availableAssignees = getAvailableAssignees(currentAssigner);

  const handleSave = async () => {
    if (!taskData.title || (!taskData.due_date && !shouldClearTaskDueDate(taskData.status)) || !taskData.assigner_telegram_id || !taskData.assignee_telegram_id) {
      alert("Заполните обязательные поля: название, дедлайн, постановщик и исполнитель.");
      return;
    }

    const assigner = users.find((u) => String(u.telegram_id) === String(taskData.assigner_telegram_id));
    const payload = {
      title: taskData.title,
      client: client?.name || null,
      client_id: client?.id || null,
      branch_id: taskData.branch_id || client?.branch_id || assigner?.branch_id || null,
      city: client?.city || assigner?.city || null,
      primary_client: client?.primary_client || assigner?.primary_client || null,
      due_date: shouldClearTaskDueDate(taskData.status) ? null : normalizeDueDateForTask(taskData.due_date),
      description: taskData.description || null,
      status: taskData.status || "Выполняется",
      assigner_telegram_id: Number(taskData.assigner_telegram_id),
      assignee_telegram_id: Number(taskData.assignee_telegram_id),
      comments: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setIsSaving(true);
    const { error } = await supabase.from("tasks").insert(payload);
    setIsSaving(false);

    if (error) {
      console.error("Ошибка при создании задачи из карточки клиента:", error);
      alert("Ошибка при создании задачи: " + error.message);
      return;
    }

    alert("Задача успешно создана.");
    onCreated?.();
    onClose?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "90%",
          maxWidth: 700,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#182129",
          border: "1px solid #334756",
          borderRadius: 12,
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, color: "#3b82f6" }}>Новая задача по клиенту: {client?.name}</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Название задачи *</label>
            <Input
              value={taskData.title}
              onChange={(e) => setTaskData((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Введите название задачи"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Клиент</label>
            <Input value={client?.name || ""} disabled style={{ width: "100%", opacity: 0.75 }} />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Постановщик</label>
            <Input value={formatUserName(currentAssigner) || String(taskData.assigner_telegram_id || "")} disabled style={{ width: "100%", opacity: 0.75 }} />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Дедлайн *</label>
            <Input
              type="date"
              value={taskData.due_date}
              onChange={(e) => setTaskData((prev) => ({ ...prev, due_date: e.target.value }))}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Статус</label>
            <select
              value={taskData.status}
              onChange={(e) => {
                const nextStatus = e.target.value;
                setTaskData((prev) => ({
                  ...prev,
                  status: nextStatus,
                  due_date: shouldClearTaskDueDate(nextStatus) ? "" : prev.due_date,
                }));
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0f151b", border: "1px solid #334756", color: "#eaf1f4" }}
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Филиал</label>
            <select
              value={taskData.branch_id || ""}
              onChange={(e) => setTaskData((prev) => ({ ...prev, branch_id: e.target.value }))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0f151b", border: "1px solid #334756", color: "#eaf1f4" }}
            >
              <option value="">Не указан</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Исполнитель *</label>
            <select
              value={taskData.assignee_telegram_id}
              onChange={(e) => setTaskData((prev) => ({ ...prev, assignee_telegram_id: e.target.value }))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "#0f151b", border: "1px solid #334756", color: "#eaf1f4" }}
            >
              <option value="">Выберите исполнителя</option>
              {availableAssignees
                .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                .map((user) => (
                <option key={String(user.id || user.telegram_id)} value={user.telegram_id}>
                  {formatUserName(user)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 12, color: "#9fb1bb" }}>Описание</label>
            <Textarea
              value={taskData.description}
              onChange={(e) => setTaskData((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Описание задачи"
              style={{ width: "100%", minHeight: 120 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Btn onClick={handleSave} disabled={isSaving} style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}>
            {isSaving ? "Сохранение..." : "Создать задачу"}
          </Btn>
          <Btn onClick={onClose} style={{ background: "linear-gradient(180deg,#6b7280,#4b5563)" }}>
            Отмена
          </Btn>
        </div>
      </div>
    </div>
  );
}

function TaskArchiveModal({ client, users = [], branches = [], onClose }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [errorText, setErrorText] = useState("");

  const getUserNameByTelegramId = (telegramId) => {
    const user = users.find((u) => String(u.telegram_id) === String(telegramId));
    return user ? formatUserName(user) : (telegramId || "Не указан");
  };

  const getBranchName = (branchId, branchFromJoin) => {
    if (branchFromJoin?.name) return branchFromJoin.name;
    const branch = branches.find((b) => String(b.id) === String(branchId));
    return branch?.name || "Не указан";
  };

  useEffect(() => {
    let active = true;

    const loadArchive = async () => {
      setLoading(true);
      setErrorText("");
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, client, client_id, primary_client, branch_id, city,
          due_date, status, description, result, comments, created_at, updated_at,
          assigner_telegram_id, assignee_telegram_id,
          branches!tasks_branch_id_fkey(name)
        `)
        .eq("client_id", client.id)
        .in("status", ["Завершено", "Завершена", "Завершен", "completed"])
        .order("updated_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Ошибка при загрузке архива задач клиента:", error);
        setErrorText(error.message || "Не удалось загрузить архив задач");
        setTasks([]);
      } else {
        setTasks(data || []);
      }
      setLoading(false);
    };

    if (client?.id) {
      loadArchive();
    }

    return () => {
      active = false;
    };
  }, [client?.id]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "94%",
          maxWidth: 980,
          maxHeight: "86vh",
          overflowY: "auto",
          background: "#182129",
          border: "1px solid #334756",
          borderRadius: 12,
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: "#3b82f6" }}>Архив задач клиента: {client?.name}</h3>
          <Btn onClick={onClose} style={{ background: "linear-gradient(180deg,#6b7280,#4b5563)" }}>Закрыть</Btn>
        </div>

        {loading && <div style={{ padding: 12, color: "#9fb1bb" }}>Загрузка задач...</div>}
        {!loading && errorText && <div style={{ padding: 12, color: "#ef4444" }}>Ошибка: {errorText}</div>}

        {!loading && !errorText && tasks.length === 0 && (
          <div style={{ padding: 12, color: "#9fb1bb" }}>В архиве нет завершенных задач по этому клиенту.</div>
        )}

        {!loading && !errorText && tasks.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {tasks.map((task) => {
              const isExpanded = expandedTaskId === task.id;
              return (
                <div key={task.id} style={{ border: "1px solid #2f3d49", borderRadius: 8, background: "#0f151b" }}>
                  <button
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      color: "#eaf1f4",
                      padding: "12px 14px",
                      cursor: "pointer",
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={task.title || ""}>
                      {task.title || "Без названия"}
                    </span>
                    <span style={{ fontSize: 12, color: "#9fb1bb" }}>
                      {task.due_date ? new Date(task.due_date).toLocaleDateString("ru-RU") : "Без дедлайна"}
                    </span>
                    <span style={{ fontSize: 12, color: "#3b82f6" }}>{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #2f3d49", padding: "12px 14px", display: "grid", gap: 8 }}>
                      <div><strong>ID:</strong> {task.id}</div>
                      <div><strong>Статус:</strong> {getStatusText(task.status) || task.status}</div>
                      <div><strong>Клиент:</strong> {task.client || client?.name || "Не указан"}</div>
                      <div><strong>Клиент 1 порядка:</strong> {task.primary_client || client?.primary_client || "Не указан"}</div>
                      <div><strong>Филиал:</strong> {getBranchName(task.branch_id, task.branches)}</div>
                      <div><strong>Город:</strong> {task.city || client?.city || "Не указан"}</div>
                      <div><strong>Постановщик:</strong> {getUserNameByTelegramId(task.assigner_telegram_id)}</div>
                      <div><strong>Исполнитель:</strong> {getUserNameByTelegramId(task.assignee_telegram_id)}</div>
                      <div><strong>Дедлайн:</strong> {task.due_date ? new Date(task.due_date).toLocaleString("ru-RU") : "Не указан"}</div>
                      <div><strong>Создана:</strong> {task.created_at ? new Date(task.created_at).toLocaleString("ru-RU") : "Не указано"}</div>
                      <div><strong>Обновлена:</strong> {task.updated_at ? new Date(task.updated_at).toLocaleString("ru-RU") : "Не указано"}</div>
                      <div><strong>Описание:</strong> {task.description || "Не указано"}</div>
                      <div><strong>Результат:</strong> {task.result || "Не указан"}</div>
                      <div><strong>Комментарии:</strong> {task.comments || "Не указаны"}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [branches, setBranches] = useState([]);
  const [users, setUsers] = useState([]);
  const [primaryClients, setPrimaryClients] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [editingClientId, setEditingClientId] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    city: "",
    primary_client: "",
    branch_id: "",
    responsible: "",
  });
  const [newClient, setNewClient] = useState(EMPTY_NEW_CLIENT);
  const [editModal, setEditModal] = useState({
    isOpen: false,
    field: null,
    value: null,
    label: null,
    type: "text",
    multiline: false,
    options: null,
    isUserSelect: false,
    isPrimaryClientSelect: false,
    clientId: null,
  });
  const [taskModal, setTaskModal] = useState({
    isOpen: false,
    client: null,
  });
  const [archiveModal, setArchiveModal] = useState({
    isOpen: false,
    client: null,
  });
  const [isSavingNewClient, setIsSavingNewClient] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLIENT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const draft = { ...EMPTY_NEW_CLIENT, ...parsed };
      const hasMeaningfulData = Object.entries(draft).some(([key, value]) => {
        if (key === "status") return false;
        return String(value || "").trim() !== "";
      });
      if (!hasMeaningfulData) return;
      setNewClient(draft);
      setIsAdding(true);
    } catch {
      // ignore malformed draft
    }
  }, []);

  useEffect(() => {
    try {
      const hasMeaningfulData = Object.entries(newClient).some(([key, value]) => {
        if (key === "status") return false;
        return String(value || "").trim() !== "";
      });
      if (isAdding || hasMeaningfulData) {
        localStorage.setItem(CLIENT_DRAFT_KEY, JSON.stringify(newClient));
      } else {
        localStorage.removeItem(CLIENT_DRAFT_KEY);
      }
    } catch {
      // ignore localStorage errors
    }
  }, [isAdding, newClient]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLIENTS_UI_STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      if (typeof parsed.isAdding === "boolean") setIsAdding(parsed.isAdding);
      if (parsed.expandedClientId) setExpandedClientId(parsed.expandedClientId);
      if (parsed.editingClientId) setEditingClientId(parsed.editingClientId);
      if (parsed.filters && typeof parsed.filters === "object") {
        setFilters((prev) => ({ ...prev, ...parsed.filters }));
      }
    } catch {
      // ignore malformed state
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CLIENTS_UI_STATE_KEY,
        JSON.stringify({
          isAdding,
          expandedClientId,
          editingClientId,
          filters,
        })
      );
    } catch {
      // ignore localStorage errors
    }
  }, [isAdding, expandedClientId, editingClientId, filters]);

  const statusOptions = ["active", "archived", "Просрочена", "Результат на согласовании", "Завершено"];

  const getAccessScope = () => {
    const storedRole = String(localStorage.getItem('currentUserRole') || "");
    const rawRole = storedRole.replace(/^"+|"+$/g, "").trim();
    const roleLc = rawRole.toLowerCase();
    const role = roleLc === "admin" ? "admin"
      : roleLc === "rkp" ? "RKP"
      : roleLc === "kam" ? "KAM"
      : roleLc === "jkam" ? "JKAM"
      : (roleLc === "regional_manager" || roleLc === "regional" || roleLc === "regional manager") ? "regional_manager"
      : rawRole;
    const pc = localStorage.getItem('currentUserPrimaryClient') || localStorage.getItem('adminPrimaryClient');
    const userDbId = localStorage.getItem('currentUserId') || "";
    const isGlobal = roleLc === 'admin' || roleLc === 'rkp';
    const isJKAM = roleLc === 'jkam';
    return { role, pc, isGlobal, isJKAM, userDbId };
  };

  const applyResponsibleScope = (query, { isJKAM, userDbId, pc }) => {
    if (!isJKAM) return query;
    const conditions = [];
    if (userDbId) conditions.push(`responsible_id.eq.${userDbId}`);
    // Fallback for legacy sessions where localStorage ids are temporarily missing.
    if (!conditions.length) return pc ? query.eq("primary_client", pc) : query;
    return query.or(conditions.join(","));
  };

  async function runWithSupabaseTimeout(buildRequest, timeoutMs = 15000, label = "операции") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await buildRequest(controller.signal);
    } catch (error) {
      if (error?.name === "AbortError") {
        return {
          data: null,
          error: { message: `Превышено время ожидания ${label}.` },
        };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Функция экспорта списка клиентов в Excel
  async function exportToExcel() {
    try {
      const exportBtn = document.querySelector('[data-clients-export-btn]');
      const originalText = exportBtn ? exportBtn.textContent : '';
      if (exportBtn) {
        exportBtn.textContent = 'Выгрузка...';
        exportBtn.disabled = true;
      }
      
      // Загружаем полные данные клиентов для экспорта
      const scope = getAccessScope();
      const { pc, isGlobal } = scope;
      if (!isGlobal && !scope.isJKAM && !pc) {
        throw new Error("Недостаточно данных доступа для выгрузки");
      }
      let query = supabase
        .from('clients')
        .select(`
          id, name, city, primary_client, branch_id, 
          development_plan, client_work, status, status_text,
          responsible, responsible_id, inn, manager_contact, sales_channel, info, clients_responsible_manager,
          visit_date, created_at, updated_at,
          branches!clients_branch_id_fkey(name)
      `)
        .order('created_at', { ascending: false });
      
      if (scope.isJKAM) {
        query = applyResponsibleScope(query, scope);
      } else if (!isGlobal && pc) {
        query = query.eq('primary_client', pc);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error('Ошибка при загрузке данных: ' + error.message);
      }
      
      const list = data || [];
      if (!list.length) {
        alert('Нет данных для экспорта');
        if (exportBtn) {
          exportBtn.textContent = originalText;
          exportBtn.disabled = false;
        }
        return;
      }
      
      // Загружаем пользователей для получения информации об ответственных
      let usersQuery = supabase
        .from('users')
        .select('telegram_id, first_name, last_name, username, role')
        .order('first_name', { ascending: true });
      if (scope.isJKAM) {
        if (scope.userDbId) {
          usersQuery = usersQuery.eq('id', scope.userDbId);
        } else {
          usersQuery = pc ? usersQuery.eq('primary_client', pc) : usersQuery;
        }
      } else if (!isGlobal && pc) {
        usersQuery = usersQuery.eq('primary_client', pc);
      }
      const { data: usersData } = await usersQuery;
      
      const usersMap = {};
      if (usersData) {
        usersData.forEach(user => {
          usersMap[user.telegram_id] = user;
        });
      }
      
      // Подготавливаем данные для Excel
      const excelData = list.map((cl) => {
        // Получаем информацию об ответственном
        let responsibleInfo = '';
        if (cl.responsible && usersMap[cl.responsible]) {
          responsibleInfo = formatUserName(usersMap[cl.responsible]);
        } else if (cl.responsible) {
          responsibleInfo = `Telegram ID: ${cl.responsible}`;
        }
        
        return {
          ID: cl.id,
          Название: cl.name || '',
          Город: cl.city || '',
          'Клиент 1 порядка': cl.primary_client || '',
          Филиал: cl.branches?.name || '',
          'План развития': cl.development_plan || '',
          'Работа по клиенту': cl.client_work || '',
          Статус: cl.status_text || getStatusText(cl.status) || '',
          'Статус (код)': cl.status || '',
          'Ответственный (Telegram ID)': cl.responsible || '',
          'Ответственный': responsibleInfo || '',
          ИНН: cl.inn ? String(cl.inn).replace(/\D/g, "") : '',
          'Номера телефонов': cl.manager_contact || '',
          'Канал продаж': cl.sales_channel || '',
          'Информация': cl.info || '',
          'Ответственный менеджер клиента': cl.clients_responsible_manager || '',
          'Дата посещения': cl.visit_date || '',
          'Дата создания': cl.created_at ? formatDateTime(cl.created_at) : '',
          'Дата обновления': cl.updated_at ? formatDateTime(cl.updated_at) : '',
        };
      });
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 5 },   // ID
        { wch: 30 },  // Название
        { wch: 20 },  // Город
        { wch: 15 },  // Клиент 1 порядка
        { wch: 20 },  // Филиал
        { wch: 40 },  // План развития
        { wch: 50 },  // Работа по клиенту
        { wch: 15 },  // Статус
        { wch: 15 },  // Статус (код)
        { wch: 20 },  // Ответственный (Telegram ID)
        { wch: 25 },  // Ответственный
        { wch: 15 },  // ИНН
        { wch: 25 },  // Номера телефонов
        { wch: 20 },  // Канал продаж
        { wch: 40 },  // Информация
        { wch: 15 },  // Дата посещения
        { wch: 15 },  // Дата создания
        { wch: 15 },  // Дата обновления
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Клиенты');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Клиенты_${dateStr}_${new Date().getHours()}${new Date().getMinutes()}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      if (exportBtn) {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
      }
    } catch (err) {
      console.error('Ошибка при экспорте клиентов:', err);
      alert('Ошибка при экспорте: ' + err.message);
      const exportBtn = document.querySelector('[data-clients-export-btn]');
      if (exportBtn) {
        exportBtn.textContent = '📥 Выгрузить в Excel';
        exportBtn.disabled = false;
      }
    }
  }

  // Загрузка списка клиентов, филиалов, пользователей и клиентов первого порядка
  useEffect(() => {
    fetchClients();
    fetchBranches();
    fetchUsers();
    fetchPrimaryClients();
  }, []);

  async function fetchClients() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setClients([]);
      return;
    }
    let query = supabase
      .from("clients")
      .select(`
        id, name, city, primary_client, branch_id, 
        development_plan, client_work, status, status_text,
        responsible, responsible_id, inn, manager_contact, sales_channel, info, clients_responsible_manager,
        visit_date, created_at, updated_at,
        branches!clients_branch_id_fkey(name)
      `)
      .order("created_at", { ascending: false });
    
    if (scope.isJKAM) {
      query = applyResponsibleScope(query, scope);
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    const { data, error } = await query;
    if (!error) {
      setClients(data || []);
    } else {
      console.error("Ошибка при загрузке клиентов", error);
    }
  }

  async function fetchBranches() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setBranches([]);
      return;
    }
    let query = supabase
      .from("branches")
      .select("id, name, primary_client");
    if (scope.isJKAM) {
      query = applyResponsibleScope(query, scope);
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    const { data, error } = await query;
    if (!error) {
      setBranches(data || []);
    } else {
      console.error("Ошибка при загрузке филиалов", error);
    }
  }

  async function fetchUsers() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setUsers([]);
      return;
    }
    let query = supabase
      .from("users")
      .select("id, telegram_id, username, first_name, last_name, role, primary_client, branch_id, city")
      .order("first_name", { ascending: true });
    
    if (scope.isJKAM) {
      if (scope.userDbId) {
        query = query.eq('id', scope.userDbId);
      } else {
        query = pc ? query.eq('primary_client', pc) : query;
      }
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    const { data, error } = await query;
    if (!error) {
      setUsers(data || []);
    } else {
      console.error("Ошибка при загрузке пользователей", error);
    }
  }

  async function fetchPrimaryClients() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setPrimaryClients([]);
      return;
    }
    let query = supabase
      .from("clients")
      .select("primary_client")
      .not("primary_client", "is", null);
    
    if (scope.isJKAM) {
      query = applyResponsibleScope(query, scope);
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    const { data, error } = await query;
    
    if (!error) {
      const uniqueClients = [...new Set(data.map(item => item.primary_client))];
      setPrimaryClients(uniqueClients);
    }
  }

  async function addClient() {
    if (isSavingNewClient) {
      return;
    }

    if (!newClient.name) {
      alert("Пожалуйста, введите название клиента");
      return;
    }

    const scope = getAccessScope();
    const currentUser = users.find((u) => String(u.id) === String(scope.userDbId || ""));
    const selectedResponsible = users.find((u) => String(u.telegram_id) === String(newClient.responsible || ""));

    // Для не-глобальных ролей подставляем область доступа по умолчанию,
    // иначе вставка может быть отклонена RLS (WITH CHECK).
    const resolvedPrimaryClient = (newClient.primary_client || "").trim() || (!scope.isGlobal ? (scope.pc || "") : "");
    const resolvedResponsible = String(newClient.responsible || "").trim() || (scope.isJKAM && currentUser?.telegram_id ? String(currentUser.telegram_id) : "");
    const resolvedResponsibleId = selectedResponsible?.id || (scope.isJKAM ? (scope.userDbId || currentUser?.id || null) : null);

    if (!scope.isGlobal && !scope.isJKAM && !resolvedPrimaryClient) {
      alert("Не удалось определить Клиент 1 порядка для вашей роли. Выберите его вручную.");
      return;
    }
    if (scope.isJKAM && !resolvedResponsibleId && !resolvedResponsible) {
      alert("Не удалось определить ответственного для вашей роли. Обновите страницу и попробуйте снова.");
      return;
    }

    // Очистка ИНН от нечисловых символов
    const cleanedInn = newClient.inn ? newClient.inn.replace(/\D/g, "") : null;

    const insertData = {
      name: newClient.name,
      status: normalizeClientStatus(newClient.status),
      status_text: getStatusText(normalizeClientStatus(newClient.status)),
      primary_client: resolvedPrimaryClient || null,
      city: newClient.city || null,
      responsible: resolvedResponsible || null,
      responsible_id: resolvedResponsibleId,
      inn: cleanedInn,
      manager_contact: newClient.manager_contact || null,
      sales_channel: newClient.sales_channel || null,
      info: newClient.info || null,
      clients_responsible_manager: newClient.clients_responsible_manager || null,
      development_plan: newClient.development_plan || null,
      client_work: newClient.client_work || null,
      branch_id: newClient.branch_id || null,
      visit_date: newClient.visit_date || null,
    };

    setIsSavingNewClient(true);
    try {
      const { data: insertedClient, error } = await runWithSupabaseTimeout(
        (signal) =>
          supabase
            .from("clients")
            .insert(insertData)
            .select("id")
            .single()
            .abortSignal(signal),
        15000,
        "сохранения клиента"
      );

      if (!error && insertedClient?.id) {
        setNewClient(EMPTY_NEW_CLIENT);
        localStorage.removeItem(CLIENT_DRAFT_KEY);
        setIsAdding(false);
        fetchClients();
        fetchPrimaryClients();
      } else {
        if (!error && !insertedClient?.id) {
          alert("Клиент не создан: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
          return;
        }
        console.error("Ошибка при добавлении клиента", error);
        alert("Ошибка при добавлении клиента: " + error.message);
      }
    } catch (error) {
      console.error("Критическая ошибка при добавлении клиента", error);
      alert("Не удалось сохранить клиента. Проверьте соединение и попробуйте еще раз.");
    } finally {
      setIsSavingNewClient(false);
    }
  }

  async function updateClient(clientId, field, value) {
    try {
      // Очистка ИНН от нечисловых символов если поле inn
      const cleanedValue = field === "inn" && value ? value.replace(/\D/g, "") : value;

      const updateData = {
        [field]: cleanedValue || null,
        updated_at: new Date().toISOString(),
      };

      // Если обновляется статус, обновляем также status_text
      if (field === 'status') {
        updateData.status = normalizeClientStatus(cleanedValue);
        updateData.status_text = getStatusText(updateData.status);
      }

      // Если обновляется responsible, используем telegram_id напрямую
      if (field === 'responsible') {
        updateData.responsible = cleanedValue || null;
      }

      const { data: updatedClient, error } = await runWithSupabaseTimeout(
        (signal) =>
          supabase
            .from("clients")
            .update(updateData)
            .eq("id", clientId)
            .select("id")
            .maybeSingle()
            .abortSignal(signal),
        15000,
        "обновления клиента"
      );

      if (!error && updatedClient?.id) {
        fetchClients();
        if (field === "primary_client") {
          fetchPrimaryClients();
        }
        return true;
      }
      if (!error && !updatedClient?.id) {
        alert("Клиент не обновлен: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
        return false;
      }
      console.error("Ошибка при обновлении клиента", error);
      alert("Ошибка при обновлении: " + error.message);
      return false;
    } catch (error) {
      console.error("Критическая ошибка при обновлении клиента", error);
      alert("Не удалось обновить клиента. Проверьте соединение и попробуйте еще раз.");
      return false;
    }
  }

  const handleFieldEdit = useCallback((clientId, field, currentValue, label, type = "text", multiline = false, options = null, isUserSelect = false, isPrimaryClientSelect = false) => {
    setEditModal({
      isOpen: true,
      field,
      value: currentValue,
      label,
      type,
      multiline,
      options,
      isUserSelect,
      isPrimaryClientSelect,
      clientId,
    });
  }, []);

  const handleModalSave = useCallback(async (newValue) => {
    if (editModal.clientId && editModal.field) {
      const ok = await updateClient(editModal.clientId, editModal.field, newValue);
      if (!ok) return;
      try {
        sessionStorage.removeItem(`${CLIENT_EDIT_MODAL_DRAFT_PREFIX}${editModal.clientId}:${editModal.field}`);
      } catch {
        // ignore
      }
    }
    setEditModal({ isOpen: false, field: null, value: null, label: null, clientId: null });
    return true;
  }, [editModal]);

  const handleModalClose = useCallback(() => {
    if (editModal.clientId && editModal.field) {
      try {
        sessionStorage.removeItem(`${CLIENT_EDIT_MODAL_DRAFT_PREFIX}${editModal.clientId}:${editModal.field}`);
      } catch {
        // ignore
      }
    }
    setEditModal({ isOpen: false, field: null, value: null, label: null, clientId: null });
  }, [editModal.clientId, editModal.field]);

  async function deleteClient(clientId) {
    if (!window.confirm("Вы уверены, что хотите удалить этого клиента? Это действие нельзя отменить.")) {
      return;
    }
    
    const { data: deletedClient, error } = await runWithSupabaseTimeout(
      (signal) =>
        supabase
          .from("clients")
          .delete()
          .eq("id", clientId)
          .select("id")
          .maybeSingle()
          .abortSignal(signal),
      15000,
      "удаления клиента"
    );
    
    if (!error && deletedClient?.id) {
      fetchClients();
      if (editingClientId === clientId) {
        setEditingClientId(null);
      }
      if (expandedClientId === clientId) {
        setExpandedClientId(null);
      }
    } else {
      if (!error && !deletedClient?.id) {
        alert("Клиент не удален: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
        return;
      }
      console.error("Ошибка при удалении клиента", error);
      alert("Ошибка при удалении клиента: " + error.message);
    }
  }

  function toggleClientDetails(clientId) {
    setEditingClientId(null);
    setExpandedClientId(expandedClientId === clientId ? null : clientId);
  }

  function openTaskCreateModal(client) {
    setTaskModal({
      isOpen: true,
      client,
    });
  }

  function openTaskArchiveModal(client) {
    setArchiveModal({
      isOpen: true,
      client,
    });
  }

  function getStatusStyle(status) {
    const styleMap = {
      'active': { background: '#059669', color: 'white' },
      'archived': { background: '#6b7280', color: 'white' },
      'В работе': { background: '#059669', color: 'white' },
      'Архив': { background: '#6b7280', color: 'white' },
      'выполняется': { background: '#059669', color: 'white' },
      'Выполняется': { background: '#059669', color: 'white' },
      'Просрочена': { background: '#ef4444', color: 'white' },
      'Результат на согласовании': { background: '#8b5cf6', color: 'white' },
      'Завершено': { background: '#3b82f6', color: 'white' },
      'Завершена': { background: '#3b82f6', color: 'white' }
    };
    return styleMap[status] || { background: '#6b7280', color: 'white' };
  }

  function handleFilterChange(filterName, value) {
    if (filterName === 'reset') {
      setFilters({
        search: "",
        status: "",
        city: "",
        primary_client: "",
        branch_id: "",
        responsible: "",
      });
    } else {
      setFilters(prev => ({
        ...prev,
        [filterName]: value
      }));
    }
  }

  const findResponsibleUser = (responsibleId, responsibleValue) => {
    if (!users.length) return null;
    const fullName = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return (
      users.find(u => String(u.id) === String(responsibleId)) ||
      users.find(u => String(u.telegram_id) === String(responsibleValue)) ||
      users.find(u => fullName(u) && fullName(u) === String(responsibleValue)) ||
      users.find(u => formatUserName(u) === String(responsibleValue))
    );
  };

  const matchesResponsibleFilter = (client) => {
    if (!filters.responsible) return true;
    const filterTg = String(filters.responsible);

    if (client.responsible && String(client.responsible) === filterTg) {
      return true;
    }

    const responsibleUser = findResponsibleUser(client.responsible_id, client.responsible);
    return responsibleUser ? String(responsibleUser.telegram_id) === filterTg : false;
  };

  const filteredClients = clients
    .filter(client => {
      const normalizedQuery = normalizeClientSearch(filters.search);
      const normalizedClientName = normalizeClientSearch(client.name);

      return (
        (!normalizedQuery || normalizedClientName.includes(normalizedQuery)) &&
        (!filters.status || normalizeClientStatus(client.status) === normalizeClientStatus(filters.status)) &&
        (!filters.city || normalizedIncludes(client.city, filters.city)) &&
        (!filters.primary_client || client.primary_client === filters.primary_client) &&
        (!filters.branch_id || String(client.branch_id || "") === String(filters.branch_id)) &&
        matchesResponsibleFilter(client)
      );
    })
    .sort((a, b) => {
      const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

  function renderAddForm() {
    return (
      <Card style={{ width: "100%", maxWidth: 800 }}>
        <h2>Новый клиент</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Название клиента *
              </label>
              <Input
                placeholder="Название клиента"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                style={{ width: "100%" }}
                required
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Статус
              </label>
              <select
                value={newClient.status}
                onChange={(e) => setNewClient({ ...newClient, status: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{getStatusText(status)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Город
              </label>
              <Input
                placeholder="Город"
                value={newClient.city}
                onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Клиент 1 порядка
              </label>
              <select
                value={newClient.primary_client}
                onChange={(e) => setNewClient({ ...newClient, primary_client: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите клиента...</option>
                {primaryClients.map((client) => (
                  <option key={client} value={client}>{client}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Ответственный
              </label>
              <select
                value={newClient.responsible}
                onChange={(e) => setNewClient({ ...newClient, responsible: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите ответственного...</option>
                {users
                  .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                  .map((user) => (
                  <option key={String(user.id || user.telegram_id)} value={user.telegram_id}>
                    {formatUserName(user)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                ИНН (только цифры)
              </label>
              <Input
                placeholder="Введите 10 или 12 цифр"
                value={newClient.inn}
                onChange={(e) => {
                  // Разрешаем только цифры
                  const numericValue = e.target.value.replace(/\D/g, "");
                  setNewClient({ ...newClient, inn: numericValue });
                }}
                style={{ width: "100%" }}
                maxLength={12}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Номера телефонов
              </label>
              <Textarea
                placeholder="Номера телефонов"
                value={newClient.manager_contact}
                onChange={(e) => setNewClient({ ...newClient, manager_contact: e.target.value })}
                style={{ width: "100%", minHeight: 90 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Канал продаж
              </label>
              <Input
                placeholder="Канал продаж"
                value={newClient.sales_channel}
                onChange={(e) => setNewClient({ ...newClient, sales_channel: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Филиал
            </label>
            <select
              value={newClient.branch_id}
              onChange={(e) => setNewClient({ ...newClient, branch_id: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                background: "#0f151b",
                border: "1px solid #334756",
                color: "#eaf1f4",
              }}
            >
              <option value="">Выберите филиал</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Дата посещения
            </label>
            <Input
              type="date"
              value={newClient.visit_date}
              onChange={(e) => setNewClient({ ...newClient, visit_date: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Информация по клиенту
            </label>
            <Textarea
              placeholder="Информация по клиенту"
              value={newClient.info}
              onChange={(e) => setNewClient({ ...newClient, info: e.target.value })}
              style={{ width: "100%", minHeight: 120 }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Ответственный менеджер клиента
            </label>
            <Textarea
              placeholder="Ответственный менеджер клиента"
              value={newClient.clients_responsible_manager}
              onChange={(e) => setNewClient({ ...newClient, clients_responsible_manager: e.target.value })}
              style={{ width: "100%", minHeight: 100 }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              План развития
            </label>
            <Textarea
              placeholder="План развития клиента"
              value={newClient.development_plan}
              onChange={(e) => setNewClient({ ...newClient, development_plan: e.target.value })}
              style={{ width: "100%", minHeight: 120 }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Работа по клиенту
            </label>
            <Textarea
              placeholder="Работа по клиенту"
              value={newClient.client_work}
              onChange={(e) => setNewClient({ ...newClient, client_work: e.target.value })}
              style={{ width: "100%", minHeight: 120 }}
            />
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <Btn onClick={addClient} disabled={isSavingNewClient}>
            {isSavingNewClient ? "Сохранение..." : "Сохранить клиента"}
          </Btn>
          <Btn
            onClick={() => {
              setIsAdding(false);
              setNewClient(EMPTY_NEW_CLIENT);
              localStorage.removeItem(CLIENT_DRAFT_KEY);
            }}
            disabled={isSavingNewClient}
            style={{ background: "linear-gradient(180deg,#121920,#0f151b)" }}
          >
            Отмена
          </Btn>
        </div>
      </Card>
    );
  }

  function renderClientDetails(client) {
    const isEditing = editingClientId === client.id;
    // Находим пользователя по telegram_id
    const responsibleUser = findResponsibleUser(client.responsible_id, client.responsible);
    const rowStyle = { marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #26231f" };
    const emptyValueStyle = { color: "#8b8372" };
    const renderValue = (value, emptyText = "Не указано") => {
      if (value === null || value === undefined) return <span style={emptyValueStyle}>{emptyText}</span>;
      if (typeof value === "string" && value.trim() === "") return <span style={emptyValueStyle}>{emptyText}</span>;
      return value;
    };
    const responsibleValue = responsibleUser
      ? formatUserName(responsibleUser)
      : (client.responsible ? `Telegram ID: ${client.responsible}` : null);

    return (
      <tr key={`${client.id}-details`}>
        <td colSpan="7" style={{ padding: "16px", background: "#0f151b", borderBottom: "1px solid #2f3d49" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: "#e31b23" }}>Детальная информация</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <ActionButton
                    onClick={() => openTaskCreateModal(client)}
                    style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}
                  >
                    + Добавить задачу по клиенту
                  </ActionButton>
                  <ActionButton
                    onClick={() => openTaskArchiveModal(client)}
                    style={{ background: "linear-gradient(180deg,#f59e0b,#d97706)" }}
                  >
                    Архив задач
                  </ActionButton>
                  <ActionButton onClick={() => {
                    setEditingClientId(isEditing ? null : client.id);
                  }}>
                    {isEditing ? "✖️ Отменить редактирование" : "✏️ Редактировать все"}
                  </ActionButton>
                </div>
              </div>
              
              <h4 style={{ color: "#3b82f6", marginTop: 0, marginBottom: 16 }}>Основная информация:</h4>
              
              <div style={{ 
                padding: 12, 
                background: "#182129", 
                borderRadius: 8,
                marginBottom: 16,
              }}>
                {isEditing ? (
                  <>
                    <EditableField
                      label="Ответственный"
                      value={client.responsible}
                      field="responsible"
                      isUserSelect={true}
                      users={users}
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Ответственный", "text", false, null, true)}
                    />
                    
                    <EditableField
                      label="Название клиента"
                      value={client.name}
                      field="name"
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Название клиента")}
                    />
                    
                    <EditableField
                      label="ИНН"
                      value={client.inn}
                      field="inn"
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "ИНН")}
                    />
                    
                    <EditableField
                      label="Филиал"
                      value={client.branch_id}
                      field="branch_id"
                      type="select"
                      options={branches.map(branch => ({
                        value: branch.id,
                        label: branch.name
                      }))}
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Филиал", "select", false, branches.map(b => ({value: b.id, label: b.name})))}
                    />
                    
                    <EditableField
                      label="Город"
                      value={client.city}
                      field="city"
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Город")}
                    />
                    
                    <EditableField
                      label="Канал продаж"
                      value={client.sales_channel}
                      field="sales_channel"
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Канал продаж")}
                    />
                    
                    <EditableField
                      label="Дата посещения"
                      value={client.visit_date}
                      field="visit_date"
                      type="date"
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Дата посещения", "date")}
                    />
                  </>
                ) : (
                  <>
                    <div style={rowStyle}>
                      <strong>Ответственный:</strong> {renderValue(responsibleValue)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Название:</strong> {renderValue(client.name)}
                    </div>
                    <div style={rowStyle}>
                      <strong>ИНН:</strong> {renderValue(client.inn ? String(client.inn).replace(/\D/g, "") : null)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Филиал:</strong> {renderValue(client.branches?.name)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Город:</strong> {renderValue(client.city)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Канал продаж:</strong> {renderValue(client.sales_channel)}
                    </div>
                    <div>
                      <strong>Дата посещения:</strong> {renderValue(client.visit_date)}
                    </div>
                  </>
                )}
              </div>

              <h4 style={{ color: "#8b5cf6", marginTop: 0, marginBottom: 16 }}>Контактная информация:</h4>
              <div style={{ 
                padding: 12, 
                background: "#182129", 
                borderRadius: 8,
                marginBottom: 16,
              }}>
                {isEditing ? (
                  <>
                    <EditableField
                      label="Контактная информация"
                      value={client.manager_contact}
                      field="manager_contact"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Контактная информация", "text", true)}
                    />
                    
                    <EditableField
                      label="Ответственный менеджер клиента"
                      value={client.clients_responsible_manager}
                      field="clients_responsible_manager"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Ответственный менеджер клиента", "text", true)}
                    />
                  </>
                ) : (
                  <>
                    <div style={rowStyle}>
                      <strong>Контактная информация:</strong> {renderValue(client.manager_contact)}
                    </div>
                    <div>
                      <strong>Ответственный менеджер клиента:</strong> {renderValue(client.clients_responsible_manager)}
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div>
              <h4 style={{ color: "#ec4899", marginBottom: 16 }}>Дополнительная информация:</h4>
              
              {isEditing ? (
                <>
                  <EditableField
                    label="Информация по клиенту"
                    value={client.info}
                    field="info"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Информация по клиенту", "text", true)}
                  />

                  <EditableField
                    label="План развития"
                    value={client.development_plan}
                    field="development_plan"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(client.id, field, value, "План развития", "text", true)}
                  />
                  
                  <EditableField
                    label="Работа по клиенту"
                    value={client.client_work}
                    field="client_work"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(client.id, field, value, "Работа по клиенту", "text", true)}
                  />
                </>
              ) : (
                <>
                  <div style={{ 
                    padding: 12, 
                    background: "#182129", 
                    borderRadius: 8,
                    marginBottom: 16,
                  }}>
                    <div style={rowStyle}>
                      <strong>Информация по клиенту:</strong>
                      <div style={{ 
                        marginTop: 4,
                        padding: 8,
                        background: "#0f151b",
                        borderRadius: 4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        minHeight: 60,
                      }}>
                        {renderValue(client.info)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    padding: 12, 
                    background: "#182129", 
                    borderRadius: 8,
                    marginBottom: 16,
                  }}>
                    <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #26231f" }}>
                      <strong>План развития:</strong>
                      <div style={{ 
                        marginTop: 4,
                        padding: 8,
                        background: "#0f151b",
                        borderRadius: 4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        minHeight: 60,
                      }}>
                        {renderValue(client.development_plan)}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    padding: 12, 
                    background: "#182129", 
                    borderRadius: 8,
                  }}>
                    <div>
                      <strong>Работа по клиенту:</strong>
                      <div style={{ 
                        marginTop: 4,
                        padding: 8,
                        background: "#0f151b",
                        borderRadius: 4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        minHeight: 60,
                      }}>
                        {renderValue(client.client_work)}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const formatDateTime = (dateString) => {
    if (!dateString) return "не указан";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  return (
    <Wrap>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 1200 }}>
        <H1>Клиенты (всего: {filteredClients.length})</H1>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn data-clients-export-btn onClick={exportToExcel} style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}>
            📥 Выгрузить в Excel
          </Btn>
          <Btn onClick={() => setIsAdding(true)}>+ Добавить клиента</Btn>
        </div>
      </div>
      
      <Filters 
        filters={filters} 
        onFilterChange={handleFilterChange} 
        branches={branches} 
        statusOptions={statusOptions}
        users={users}
        primaryClients={primaryClients}
      />
      
      {isAdding && renderAddForm()}
      
      <Card style={{ width: "100%", maxWidth: 1200, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Название</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left", minWidth: 100 }}>Статус</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Город</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Клиент 1 порядка</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Филиал</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Ответственный</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left", minWidth: 180 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((c) => {
              const responsibleUser = findResponsibleUser(c.responsible_id, c.responsible);
              return (
                <Fragment key={c.id}>
                  <tr style={{ borderBottom: "1px solid #2f3d49", cursor: "pointer" }} onClick={() => toggleClientDetails(c.id)}>
                    <td style={{ padding: 12 }}>{c.name}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: "12px",
                        fontWeight: "bold",
                        display: "inline-block",
                        whiteSpace: "nowrap",
                        minWidth: 80,
                        textAlign: "center",
                        ...getStatusStyle(normalizeClientStatus(c.status))
                      }}>
                        {c.status_text || getStatusText(normalizeClientStatus(c.status))}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>{c.city || "-"}</td>
                    <td style={{ padding: 12 }}>{c.primary_client || "-"}</td>
                    <td style={{ padding: 12 }}>{c.branches?.name || "-"}</td>
                    <td style={{ padding: 12 }}>
                      {responsibleUser ? formatUserName(responsibleUser) : (c.responsible ? `ID: ${c.responsible}` : "-")}
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <ActionButton onClick={(e) => {
                          e.stopPropagation();
                          setEditingClientId(c.id);
                          setExpandedClientId(c.id);
                        }}>
                          ✏️ Редакт.
                        </ActionButton>
                        <ActionButton onClick={(e) => {
                          e.stopPropagation();
                          deleteClient(c.id);
                        }} style={{ background: "linear-gradient(180deg,#ef4444,#dc2626)" }}>
                          🗑️ Удалить
                        </ActionButton>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClientDetails(c.id);
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: "12px",
                            background: "linear-gradient(180deg,#6b7280,#4b5563)",
                            border: "none",
                            borderRadius: "6px",
                            color: "white",
                            cursor: "pointer",
                            minWidth: 40,
                          }}
                        >
                          {expandedClientId === c.id ? "▲" : "▼"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedClientId === c.id && renderClientDetails(c)}
                </Fragment>
              );
            })}
            {!filteredClients.length && (
              <tr>
                <td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#9fb1bb" }}>
                  Клиенты не найдены. {filters.status || filters.city || filters.primary_client || filters.branch_id || filters.responsible ? "Попробуйте изменить фильтры." : "Добавьте первого клиента."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editModal.isOpen && (
        <EditModal
          field={editModal.field}
          value={editModal.value}
          label={editModal.label}
          type={editModal.type}
          multiline={editModal.multiline}
          options={editModal.options}
          isUserSelect={editModal.isUserSelect}
          users={users}
          isPrimaryClientSelect={editModal.isPrimaryClientSelect}
          primaryClients={primaryClients}
          draftKey={
            editModal.clientId && editModal.field
              ? `${CLIENT_EDIT_MODAL_DRAFT_PREFIX}${editModal.clientId}:${editModal.field}`
              : null
          }
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}

      {taskModal.isOpen && taskModal.client && (
        <CreateTaskForClientModal
          client={taskModal.client}
          users={users}
          branches={branches}
          onClose={() => setTaskModal({ isOpen: false, client: null })}
          onCreated={() => {
            setTaskModal({ isOpen: false, client: null });
          }}
        />
      )}

      {archiveModal.isOpen && archiveModal.client && (
        <TaskArchiveModal
          client={archiveModal.client}
          users={users}
          branches={branches}
          onClose={() => setArchiveModal({ isOpen: false, client: null })}
        />
      )}
    </Wrap>
  );
}
