// src/Tasks.jsx
// Страница управления задачами. Позволяет просматривать, создавать и выгружать задачи CRM.
// Обновлено для совместимости с новой структурой БД (primary_client, branch_id, client_id)
// Добавлена раскрывающаяся область с подробной информацией по задачам
// Все поля редактируются по нажатию с расширяющимися окнами
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import * as XLSX from "xlsx";
import { normalizeSearchText, normalizedIncludes } from "./searchUtils";

// Количество записей на странице
const PAGE_SIZE = 20;

function matchesWordStart(value, query) {
  const normalize = (s) =>
    normalizeSearchText(s, {
      stripQuotes: true,
      collapseWhitespace: false,
    }).replace(/\s+/g, " ");

  const q = normalize(query).trim();
  if (!q) return true;
  const normalizedValue = normalize(value);
  const words = normalizedValue
    .split(/[\s\[\]\(\)\-_,.;:/\\]+/)
    .filter(Boolean);

  // Приоритет: совпадение по началу слова, fallback: вхождение в любом месте.
  return words.some((w) => w.startsWith(q)) || normalizedValue.includes(q);
}

function SmartAutocomplete({
  value,
  onSelect,
  options = [],
  placeholder = "Начните ввод...",
  disabled = false,
  noOptionsText = "Ничего не найдено",
}) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  useEffect(() => {
    setInputValue(selectedOption?.label || "");
  }, [selectedOption?.label, value]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => undefined, []);

  const filteredOptions = options.filter((opt) =>
    matchesWordStart(opt.searchText || opt.label, inputValue)
  );

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={inputValue}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => !disabled && setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={() => !disabled && setIsOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setInputValue(next);
          setIsOpen(true);
          if (!next) onSelect("");
        }}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 8,
          background: disabled ? "#121920" : "#0f151b",
          border: "1px solid #334756",
          color: disabled ? "#6b7280" : "#eaf1f4",
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      {isOpen && !disabled && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            width: "100%",
            marginTop: 6,
            maxHeight: 220,
            overflowY: "auto",
            background: "#0f151b",
            border: "1px solid #334756",
            borderRadius: 8,
            boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)",
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#9fb1bb" }}>{noOptionsText}</div>
          ) : (
            filteredOptions.map((opt, index) => (
              <div
                key={`${String(opt.value ?? "")}-${index}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(opt.value);
                  setInputValue(opt.label);
                  setIsOpen(false);
                }}
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #2f3d49",
                  cursor: "pointer",
                  background: String(value) === String(opt.value) ? "#334756" : "transparent",
                  color: "#eaf1f4",
                }}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Вспомогательная функция для получения текста статуса клиента
function getStatusText(status) {
  const statusMap = {
    'В работе': 'В работе',
    'Выполняется': 'В работе',
    'выполняется': 'В работе',
    'Пауза': 'Пауза',
    'пауза': 'Пауза',
    'pause': 'Пауза',
    'paused': 'Пауза',
    'Просрочена': 'Просрочена',
    'Результат на согласовании': 'Результат на согласовании',
    'Ожидание': 'Результат на согласовании',
    'Завершено': 'Завершено',
    'Завершен': 'Завершено',
    'Завершена': 'Завершено',
  };
  return statusMap[status] || status;
}

function normalizeTaskStatus(status) {
  const raw = String(status || "").trim();
  if (!raw) return raw;
  const normalized = raw.toLowerCase();

  if (normalized === "выполняется" || normalized === "выполляется" || normalized === "в работе") {
    return "В работе";
  }
  if (normalized === "пауза" || normalized === "pause" || normalized === "paused") {
    return "Пауза";
  }
  if (normalized === "ожидание" || normalized === "результат на согласовании") {
    return "Результат на согласовании";
  }
  if (normalized === "завершен" || normalized === "завершена" || normalized === "завершено") {
    return "Завершено";
  }
  return raw;
}

function shouldClearTaskDueDate(status) {
  const normalizedStatus = normalizeTaskStatus(status);
  return normalizedStatus === "Пауза" || normalizedStatus === "Завершено";
}

// Вспомогательная функция для форматирования даты
function formatDateTime(dateString) {
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
}

function formatDateOnly(dateString) {
  if (!dateString) return "не указан";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (e) {
    return dateString;
  }
}

function extractDatePart(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}

function normalizeDueDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const datePart = extractDatePart(raw);
  if (datePart) {
    const localDate = new Date(`${datePart}T23:59:00`);
    if (!Number.isNaN(localDate.getTime())) {
      return localDate.toISOString();
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDayStart(value) {
  const datePart = extractDatePart(value);
  if (!datePart) return null;
  const start = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(start.getTime()) ? null : start.toISOString();
}

function isDueDateWithinRange(dueDate, fromDate, toDate) {
  if (!dueDate) return false;
  const dueTime = new Date(dueDate).getTime();
  if (Number.isNaN(dueTime)) return false;

  const from = normalizeDayStart(fromDate);
  if (from && dueTime < new Date(from).getTime()) return false;

  const to = normalizeDueDate(toDate);
  if (to && dueTime > new Date(to).getTime()) return false;

  return true;
}

// Компонент модального окна для редактирования полей
function EditModal({ 
  field, 
  value, 
  label, 
  type = "text", 
  multiline = false, 
  options = null, 
  isUserSelect = false, 
  users = [], 
  clients = [],
  isClientSelect = false,
  branches = [],
  isBranchSelect = false,
  primaryClients = [],
  isPrimaryClientSelect = false,
  onSave, 
  onClose,
  taskData = null,
  currentTaskId = null
}) {
  const [tempValue, setTempValue] = useState(value || "");
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [availableClients, setAvailableClients] = useState([]);
  const [availableAssignees, setAvailableAssignees] = useState([]);
  
  // Роли, которые могут назначать задачи себе
  const SELF_ASSIGNMENT_ROLES = ["admin", "RKP", "KAM", "JKAM", "regional_manager"];
  
  // Маппинг ролей постановщика на допустимые роли исполнителя
  const ROLE_ASSIGNMENT_MAP = {
    admin: ['RKP', 'KAM', 'JKAM', 'regional_manager'],
    RKP: ['KAM', 'JKAM', 'regional_manager'],
    KAM: ['JKAM', 'regional_manager'],
    JKAM: ['regional_manager'],
    regional_manager: []
  };

  // Получение полного имени пользователя
  const getUserFullName = (user) => {
    if (!user) return "";
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.username) {
      return `@${user.username}`;
    } else if (user.role) {
      return user.role;
    } else {
      return user.telegram_id || "Неизвестный";
    }
  };

  // Получение клиента по id
  const getClientById = (clientId) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId);
  };

  // Получение primary_client постановщика
  const getAssignerPrimaryClient = (assignerTelegramId) => {
    if (!assignerTelegramId) return "";
    const assigner = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
    return assigner?.primary_client || "";
  };

  // Получение списка доступных исполнителей
  const getAvailableAssigneesList = (assignerTelegramId, clientId = null) => {
    if (!assignerTelegramId) return [];
    
    const assigner = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
    if (!assigner) return [];
    
    const assignerRole = assigner.role;
    const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
    
    let availableUsers = [];
    
    // Если admin - показываем всех пользователей
    if (assignerRole === "admin") {
      availableUsers = users.filter(u => 
        u.telegram_id && String(u.telegram_id) !== String(assigner.telegram_id)
      );
    } else {
      // Для других ролей - показываем пользователей с допустимыми ролями И тем же primary_client
      availableUsers = users.filter(u => 
        u.telegram_id && 
        allowedRoles.includes(u.role) &&
        u.primary_client === assigner.primary_client
      );
    }
    
    // Если постановщик может назначать задачи себе, добавляем его в список
    if (SELF_ASSIGNMENT_ROLES.includes(assignerRole)) {
      const assignerUser = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
      if (assignerUser && !availableUsers.some(u => u.id === assignerUser.id)) {
        availableUsers.unshift(assignerUser);
      }
    }
    
    // Если выбран клиент, добавляем ответственного клиента
    if (clientId) {
      const client = getClientById(clientId);
      const getUserById = (userId) => users.find(u => u.id === userId);
      
      if (client?.responsible_id) {
        const responsibleUser = getUserById(client.responsible_id);
        if (responsibleUser && !availableUsers.some(u => u.id === responsibleUser.id)) {
          availableUsers.push(responsibleUser);
        }
      }
    }
    
    return availableUsers;
  };

  // При изменении постановщика обновляем доступных клиентов и исполнителей
  useEffect(() => {
    if (field === 'assigner_telegram_id' && tempValue) {
      const assignerPrimaryClient = getAssignerPrimaryClient(tempValue);
      const assignerClientsList = clients.filter(c => c.primary_client === assignerPrimaryClient);
      setAvailableClients(assignerClientsList);
      
      // Если есть текущий клиент в задаче, обновляем доступных исполнителей
      if (taskData?.client_id) {
        const assignees = getAvailableAssigneesList(tempValue, taskData.client_id);
        setAvailableAssignees(assignees);
      }
    }
  }, [tempValue, field]);

  // При изменении клиента обновляем доступных исполнителей
  useEffect(() => {
    if (field === 'client_id' && tempValue && taskData?.assigner_telegram_id) {
      const assignees = getAvailableAssigneesList(taskData.assigner_telegram_id, tempValue);
      setAvailableAssignees(assignees);
    }
  }, [tempValue, field]);

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
      onClose();
    } catch (err) {
      console.error("Task edit save failed:", err);
      alert("Не удалось сохранить изменения. Попробуйте еще раз.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = () => {
    if (isUserSelect) {
      let userList = users;
      if (field === "assignee_telegram_id" && taskData?.assigner_telegram_id) {
        userList = getAvailableAssigneesList(taskData.assigner_telegram_id, taskData?.client_id);
      }
      const userOptions = userList
        .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
        .map((user) => ({
        value: String(user.telegram_id),
        label: `${getUserFullName(user)} (${user.role || "без роли"})${user.primary_client ? ` [${user.primary_client}]` : ""}${field === "assignee_telegram_id" && String(user.telegram_id) === String(taskData?.assigner_telegram_id) ? " (постановщик)" : ""}`,
        searchText: `${user.first_name || ""} ${user.last_name || ""} ${user.username || ""} ${user.role || ""} ${user.primary_client || ""}`,
      }));
      return (
        <SmartAutocomplete
          value={String(tempValue || "")}
          onSelect={(v) => setTempValue(String(v || ""))}
          options={userOptions}
          placeholder="Начните вводить пользователя..."
          noOptionsText="Пользователи не найдены"
        />
      );
    }

    if (isClientSelect) {
      let clientList = clients;
      if (field === "client_id" && taskData?.assigner_telegram_id) {
        const assignerPrimaryClient = getAssignerPrimaryClient(taskData.assigner_telegram_id);
        clientList = clients.filter((c) => c.primary_client === assignerPrimaryClient);
      }
      const clientOptions = clientList.map((client) => ({
        value: client.id,
        label: `${client.name}${client.city ? ` [${client.city}]` : ""}${client.status_text ? ` - ${client.status_text}` : ""}`,
        searchText: `${client.name || ""} ${client.city || ""} ${client.status_text || ""}`,
      }));
      return (
        <SmartAutocomplete
          value={tempValue || ""}
          onSelect={(v) => setTempValue(v)}
          options={clientOptions}
          placeholder="Начните вводить клиента..."
          noOptionsText={field === "client_id" && taskData?.assigner_telegram_id ? "Нет доступных клиентов для выбранного постановщика" : "Клиенты не найдены"}
        />
      );
    }

    if (isBranchSelect) {
      const branchOptions = branches.map((branch) => ({
        value: branch.id,
        label: `${branch.name}${branch.primary_client ? ` [${branch.primary_client}]` : ""}`,
        searchText: `${branch.name || ""} ${branch.primary_client || ""}`,
      }));
      return (
        <SmartAutocomplete
          value={tempValue || ""}
          onSelect={(v) => setTempValue(v)}
          options={branchOptions}
          placeholder="Начните вводить филиал..."
          noOptionsText="Филиалы не найдены"
        />
      );
    }

    if (isPrimaryClientSelect) {
      const primaryClientOptions = primaryClients.map((pc) => ({
        value: pc,
        label: pc,
        searchText: pc,
      }));
      return (
        <SmartAutocomplete
          value={tempValue || ""}
          onSelect={(v) => setTempValue(v)}
          options={primaryClientOptions}
          placeholder="Начните вводить клиента 1 порядка..."
          noOptionsText="Клиенты не найдены"
        />
      );
    }

    if (isUserSelect) {
      let userList = users;
      
      // Если это поле исполнителя и есть постановщик, фильтруем доступных
      if (field === 'assignee_telegram_id' && taskData?.assigner_telegram_id) {
        userList = getAvailableAssigneesList(taskData.assigner_telegram_id, taskData?.client_id);
      }
      
      const filteredUsers = userList.filter((u) =>
        matchesWordStart(
          `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.role || ""}`,
          search
        )
      );
      
      return (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="Поиск пользователя..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: "100%", 
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filteredUsers.map((user) => (
              <div
                key={user.telegram_id || user.id}
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #2f3d49",
                  cursor: "pointer",
                  background: tempValue === String(user.telegram_id) ? "#334756" : "transparent",
                  borderRadius: 4,
                }}
                onClick={() => setTempValue(String(user.telegram_id))}
              >
                {getUserFullName(user)} ({user.role || "без роли"})
                {user.primary_client && ` [${user.primary_client}]`}
                {field === 'assignee_telegram_id' && String(user.telegram_id) === String(taskData?.assigner_telegram_id) ? " (постановщик)" : ""}
              </div>
            ))}
          </div>
        </div>
      );
    } else if (isClientSelect) {
      let clientList = clients;
      
      // Если это поле клиента и есть постановщик, фильтруем доступных
      if (field === 'client_id' && taskData?.assigner_telegram_id) {
        const assignerPrimaryClient = getAssignerPrimaryClient(taskData.assigner_telegram_id);
        clientList = clients.filter(c => c.primary_client === assignerPrimaryClient);
        setAvailableClients(clientList);
      }
      
      const filteredClients = (field === 'client_id' && taskData?.assigner_telegram_id ? availableClients : clientList).filter((c) =>
        matchesWordStart(`${c.name || ""} ${c.city || ""}`, search)
      );
      
      return (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="Поиск клиента..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: "100%", 
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filteredClients.length === 0 ? (
              <div style={{ padding: "10px 12px", color: "#9fb1bb", textAlign: "center" }}>
                {field === 'client_id' && taskData?.assigner_telegram_id 
                  ? "Нет доступных клиентов для выбранного постановщика"
                  : "Клиенты не найдены"}
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #2f3d49",
                    cursor: "pointer",
                    background: tempValue === client.id ? "#334756" : "transparent",
                    borderRadius: 4,
                  }}
                  onClick={() => setTempValue(client.id)}
                >
                  {client.name} 
                  {client.city && ` [${client.city}]`}
                  {client.status_text && ` - ${client.status_text}`}
                </div>
              ))
            )}
          </div>
        </div>
      );
    } else if (isBranchSelect) {
      const filteredBranches = branches.filter((b) =>
        matchesWordStart(b.name, search)
      );
      
      return (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="Поиск филиала..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: "100%", 
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filteredBranches.map((branch) => (
              <div
                key={branch.id}
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #2f3d49",
                  cursor: "pointer",
                  background: tempValue === branch.id ? "#334756" : "transparent",
                  borderRadius: 4,
                }}
                onClick={() => setTempValue(branch.id)}
              >
                {branch.name}
                {branch.primary_client && ` [${branch.primary_client}]`}
              </div>
            ))}
          </div>
        </div>
      );
    } else if (isPrimaryClientSelect) {
      const filteredPrimaryClients = primaryClients.filter((pc) =>
        matchesWordStart(pc, search)
      );
      
      return (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="Поиск клиента 1 порядка..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ 
              width: "100%", 
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filteredPrimaryClients.map((pc) => (
              <div
                key={pc}
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #2f3d49",
                  cursor: "pointer",
                  background: tempValue === pc ? "#334756" : "transparent",
                  borderRadius: 4,
                }}
                onClick={() => setTempValue(pc)}
              >
                {pc}
              </div>
            ))}
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
            padding: "10px 12px",
            borderRadius: 8,
            background: "#0f151b",
            border: "1px solid #334756",
            color: "#eaf1f4",
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
        <textarea
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%", 
            minHeight: 150,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#0f151b",
            border: "1px solid #334756",
            color: "#eaf1f4",
            resize: "vertical",
          }}
          autoFocus
        />
      );
    } else if (type === "datetime-local") {
      return (
        <input
          type="datetime-local"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            background: "#0f151b",
            border: "1px solid #334756",
            color: "#eaf1f4",
          }}
          autoFocus
        />
      );
    } else if (type === "date") {
      const handleDateChange = (e) => {
        const dateValue = e.target.value;
        setTempValue(dateValue || "");
      };

      // Преобразуем значение для input[type="date"]
      const dateValue = extractDatePart(tempValue);
      
      return (
        <div>
          <input
            type="date"
            value={dateValue}
            onChange={handleDateChange}
            style={{ 
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
            autoFocus
          />
          <div style={{ fontSize: 12, color: "#8b6b2a", marginTop: 4 }}>
            Будет сохранено как 23:59 выбранной даты
          </div>
        </div>
      );
    } else {
      return (
        <input
          type="text"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          style={{ 
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            background: "#0f151b",
            border: "1px solid #334756",
            color: "#eaf1f4",
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
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#182129",
          border: "1px solid #334756",
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: multiline ? 800 : 500,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, color: "#3b82f6" }}>Редактирование: {label}</h3>
        
        {/* Информация о каскадных зависимостях */}
        {(field === 'client_id' && taskData?.assigner_telegram_id) && (
          <div style={{ 
            padding: "10px", 
            background: "#121920", 
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            color: "#9fb1bb"
          }}>
            Показаны только клиенты, доступные для выбранного постановщика
          </div>
        )}
        
        {(field === 'assignee_telegram_id' && taskData?.assigner_telegram_id) && (
          <div style={{ 
            padding: "10px", 
            background: "#121920", 
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            color: "#9fb1bb"
          }}>
            Показаны только исполнители, доступные для выбранного постановщика
            {taskData?.client_id && " и клиента"}
          </div>
        )}
        
        {renderField()}
        
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
              background: "linear-gradient(180deg,#10b981,#059669)",
              color: "#fff",
              flex: 1,
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? "Сохранение..." : "Сохранить (Ctrl+Enter)"}
          </button>
          <button
            onClick={onClose}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
              background: "linear-gradient(180deg,#6b7280,#4b5563)",
              color: "#fff",
              flex: 1,
            }}
          >
            Отмена (Esc)
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#9fb1bb", textAlign: "center" }}>
          Используйте Ctrl+Enter для сохранения, Esc для отмены
        </div>
      </div>
    </div>
  );
}

// Компонент модального окна для создания новой задачи
function CreateTaskModal({
  onSave,
  onClose,
  users = [],
  clients = [],
  branches = [],
  primaryClients = [],
  statusOptions = []
}) {
  const [newTask, setNewTask] = useState({
    title: "",
    client_id: "",
    primary_client: "",
    branch_id: "",
    due_date: "",
    description: "",
    assigner_telegram_id: "",
    assignee_telegram_id: "",
    status: "Выполняется",
  });

  const [assignerClients, setAssignerClients] = useState([]);
  const [availableAssignees, setAvailableAssignees] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [assignerSearch, setAssignerSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");

  // Роли, которые могут назначать задачи себе
  const SELF_ASSIGNMENT_ROLES = ["admin", "RKP", "KAM", "JKAM", "regional_manager"];
  
  // Маппинг ролей постановщика на допустимые роли исполнителя
  const ROLE_ASSIGNMENT_MAP = {
    admin: ['RKP', 'KAM', 'JKAM', 'regional_manager'],
    RKP: ['KAM', 'JKAM', 'regional_manager'],
    KAM: ['JKAM', 'regional_manager'],
    JKAM: ['regional_manager'],
    regional_manager: [],
    undefined: [],
    null: [],
  };

  // Обработчик горячих клавиш
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "Enter") {
        handleCreate();
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [newTask]);

  // Получение полного имени пользователя
  const getUserFullName = (user) => {
    if (!user) return "";
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.username) {
      return `@${user.username}`;
    } else if (user.role) {
      return user.role;
    } else {
      return user.telegram_id || "Неизвестный";
    }
  };

  // Получение клиента по id
  const getClientById = (clientId) => {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId);
  };

  // Получение primary_client постановщика
  const getAssignerPrimaryClient = (assignerTelegramId) => {
    if (!assignerTelegramId) return "";
    const assigner = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
    return assigner?.primary_client || "";
  };

  // Получение списка доступных исполнителей
  const getAvailableAssignees = (assignerTelegramId, clientId = null) => {
    if (!assignerTelegramId) return [];
    
    const assigner = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
    if (!assigner) return [];
    
    const assignerRole = assigner.role;
    const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
    
    let availableUsers = [];
    
    // Если admin - показываем всех пользователей
    if (assignerRole === "admin") {
      availableUsers = users.filter(u => 
        u.telegram_id && String(u.telegram_id) !== String(assigner.telegram_id)
      );
    } else {
      // Для других ролей - показываем пользователей с допустимыми ролями И тем же primary_client
      availableUsers = users.filter(u => 
        u.telegram_id && 
        allowedRoles.includes(u.role) &&
        u.primary_client === assigner.primary_client
      );
    }
    
    // Если постановщик может назначать задачи себе, добавляем его в список
    if (SELF_ASSIGNMENT_ROLES.includes(assignerRole)) {
      const assignerUser = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
      if (assignerUser && !availableUsers.some(u => u.id === assignerUser.id)) {
        availableUsers.unshift(assignerUser);
      }
    }
    
    // Если выбран клиент, добавляем ответственного клиента
    if (clientId) {
      const client = getClientById(clientId);
      const getUserById = (userId) => users.find(u => u.id === userId);
      
      if (client?.responsible_id) {
        const responsibleUser = getUserById(client.responsible_id);
        if (responsibleUser && !availableUsers.some(u => u.id === responsibleUser.id)) {
          availableUsers.push(responsibleUser);
        }
      }
    }
    
    return availableUsers;
  };

  // Обработчик изменения постановщика
  const handleAssignerChange = (assignerId) => {
    const assignerPrimaryClient = getAssignerPrimaryClient(assignerId);
    const assignerClientsList = clients.filter(c => c.primary_client === assignerPrimaryClient);
    
    setAssignerClients(assignerClientsList);
    setAvailableAssignees([]);
    
    setNewTask({
      ...newTask,
      assigner_telegram_id: assignerId,
      primary_client: assignerPrimaryClient,
      client_id: "",
      branch_id: "",
      assignee_telegram_id: ""
    });
    setSelectedClient(null);
  };

  // Обработчик изменения клиента
  const handleClientChange = (clientId) => {
    const client = getClientById(clientId);
    const assignees = getAvailableAssignees(newTask.assigner_telegram_id, clientId);
    
    setSelectedClient(client);
    setAvailableAssignees(assignees);
    
    setNewTask({
      ...newTask,
      client_id: clientId,
      branch_id: client?.branch_id || "",
      assignee_telegram_id: ""
    });
  };

  // Обработчик изменения даты дедлайна
  const handleDueDateChange = (dateValue) => {
    setNewTask({ ...newTask, due_date: dateValue || "" });
  };

  // Функция создания задачи
  const handleCreate = async () => {
    // Проверка обязательных полей
    if (!newTask.title || (!newTask.due_date && !shouldClearTaskDueDate(newTask.status)) || !newTask.assigner_telegram_id || 
        !newTask.client_id || !newTask.assignee_telegram_id) {
      alert("Заполните все обязательные поля: название, дедлайн, постановщика, клиента и ответственного");
      return;
    }

    // Проверка прав назначения для разных пользователей
    if (newTask.assigner_telegram_id !== newTask.assignee_telegram_id) {
      const assigner = users.find(u => String(u.telegram_id) === String(newTask.assigner_telegram_id));
      const assignee = users.find(u => String(u.telegram_id) === String(newTask.assignee_telegram_id));
      
      if (!assigner || !assignee) {
        alert("Не удалось найти пользователей");
        return;
      }
      
      const assignerRole = assigner.role;
      const assigneeRole = assignee.role;
      const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
      
      // Проверяем, может ли постановщик назначать задачи этому исполнителю
      // Если исполнитель - ответственный клиента, разрешаем назначение
      const client = getClientById(newTask.client_id);
      const getUserById = (userId) => users.find(u => u.id === userId);
      const isClientResponsible = client?.responsible_id && 
        users.some(u => u.id === client.responsible_id && String(u.telegram_id) === String(newTask.assignee_telegram_id));
      
      if (!isClientResponsible && assignerRole !== "admin" && !allowedRoles.includes(assigneeRole)) {
        alert(`Постановщик с ролью "${assignerRole}" не может назначать задачи исполнителю с ролью "${assigneeRole}"`);
        return;
      }
    }

    onSave(newTask);
    onClose();
  };

  // Форматирование значения для input[type="date"]
  const formatDateForInput = (dateString) => {
    return extractDatePart(dateString);
  };

  const filteredAssigners = users.filter((user) =>
    matchesWordStart(
      `${getUserFullName(user)} ${user.role || ""} ${user.primary_client || ""}`,
      assignerSearch
    )
  );
  const filteredClients = assignerClients.filter((client) =>
    matchesWordStart(
      `${client.name || ""} ${client.city || ""} ${client.status_text || ""}`,
      clientSearch
    )
  );
  const filteredBranches = branches.filter((branch) =>
    matchesWordStart(`${branch.name || ""} ${branch.primary_client || ""}`, branchSearch)
  );
  const filteredAssignees = availableAssignees.filter((user) =>
    matchesWordStart(
      `${getUserFullName(user)} ${user.role || ""} ${user.primary_client || ""}`,
      assigneeSearch
    )
  );
  const selectedClientDevelopmentPlan = selectedClient?.development_plan || "";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#182129",
          border: "1px solid #334756",
          borderRadius: 12,
          padding: 24,
          width: "90%",
          maxWidth: 800,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, color: "#3b82f6" }}>Создание новой задачи</h3>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            {/* Название задачи */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Название задачи*
              </div>
              <input
                type="text"
                placeholder="Введите название задачи"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
                autoFocus
              />
            </div>

            {/* Постановщик */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Постановщик*
              </div>
              <SmartAutocomplete
                value={newTask.assigner_telegram_id}
                onSelect={(v) => handleAssignerChange(String(v || ""))}
                options={users.filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "").map((user) => ({
                  value: String(user.telegram_id),
                  label: `${getUserFullName(user)} (${user.role || "без роли"})${user.primary_client ? ` [${user.primary_client}]` : ""}`,
                  searchText: `${user.first_name || ""} ${user.last_name || ""} ${user.username || ""} ${user.role || ""} ${user.primary_client || ""}`,
                }))}
                placeholder="Начните вводить постановщика..."
                noOptionsText="Постановщик не найден"
              />
              {false && (
              <>
              <input
                type="text"
                value={assignerSearch}
                onChange={(e) => setAssignerSearch(e.target.value)}
                placeholder="Поиск по началу слова..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 8,
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              />
              <select
                value={newTask.assigner_telegram_id}
                onChange={(e) => handleAssignerChange(e.target.value)}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите постановщика</option>
                {filteredAssigners
                  .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                  .map((user) => (
                  <option key={String(user.id || user.telegram_id)} value={String(user.telegram_id)}>
                    {getUserFullName(user)} ({user.role || "без роли"})
                    {user.primary_client ? ` [${user.primary_client}]` : ''}
                  </option>
                ))}
              </select>
              </>
              )}
            </div>

            {/* Клиент 1 порядка (автоматически заполняется) */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Клиент 1 порядка
              </div>
              <input
                type="text"
                value={newTask.primary_client}
                readOnly
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#121920",
                  border: "1px solid #334756",
                  color: "#9fb1bb",
                  cursor: "not-allowed",
                }}
              />
            </div>

            {/* Клиент 2 порядка */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Клиент 2 порядка*
              </div>
              <SmartAutocomplete
                value={newTask.client_id}
                onSelect={(v) => handleClientChange(v)}
                disabled={!newTask.assigner_telegram_id}
                options={assignerClients.map((client) => ({
                  value: client.id,
                  label: `${client.name}${client.city ? ` [${client.city}]` : ""}${client.status_text ? ` - ${client.status_text}` : ""}`,
                  searchText: `${client.name || ""} ${client.city || ""} ${client.status_text || ""}`,
                }))}
                placeholder={newTask.assigner_telegram_id ? "Начните вводить клиента..." : "Сначала выберите постановщика"}
                noOptionsText="Клиенты не найдены"
              />
              {false && (
              <>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Поиск по началу слова..."
                disabled={!newTask.assigner_telegram_id}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 8,
                  borderRadius: 8,
                  background: !newTask.assigner_telegram_id ? "#121920" : "#0f151b",
                  border: "1px solid #334756",
                  color: !newTask.assigner_telegram_id ? "#6b7280" : "#eaf1f4",
                }}
              />
              <select
                value={newTask.client_id}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={!newTask.assigner_telegram_id}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: !newTask.assigner_telegram_id ? "#121920" : "#0f151b",
                  border: "1px solid #334756",
                  color: !newTask.assigner_telegram_id ? "#6b7280" : "#eaf1f4",
                  cursor: !newTask.assigner_telegram_id ? "not-allowed" : "pointer",
                }}
              >
                <option value="">Выберите клиента</option>
                {assignerClients.length === 0 ? (
                  <option value="" disabled>
                    {!newTask.assigner_telegram_id 
                      ? "Сначала выберите постановщика" 
                      : "Нет доступных клиентов для выбранного постановщика"}
                  </option>
                ) : (
                  filteredClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} 
                      {client.city ? ` [${client.city}]` : ''}
                      {client.status_text ? ` - ${client.status_text}` : ''}
                    </option>
                  ))
                )}
              </select>
              </>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                План развития
              </div>
              <textarea
                value={selectedClientDevelopmentPlan}
                readOnly
                placeholder="Выберите клиента, чтобы увидеть план развития"
                style={{
                  width: "100%",
                  minHeight: 90,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#121920",
                  border: "1px solid #334756",
                  color: "#9fb1bb",
                  resize: "vertical",
                  cursor: "not-allowed",
                }}
              />
            </div>
          </div>

          <div>
            {/* Дедлайн */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Дедлайн*
              </div>
              <input
                type="date"
                value={formatDateForInput(newTask.due_date)}
                onChange={(e) => handleDueDateChange(e.target.value)}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              />
              <div style={{ fontSize: 12, color: "#8b6b2a", marginTop: 4 }}>
                Время автоматически установится на 23:59 выбранной даты
              </div>
            </div>

            {/* Филиал */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Филиал
              </div>
              <SmartAutocomplete
                value={newTask.branch_id}
                onSelect={(v) => setNewTask({ ...newTask, branch_id: v })}
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: `${branch.name}${branch.primary_client ? ` [${branch.primary_client}]` : ""}`,
                  searchText: `${branch.name || ""} ${branch.primary_client || ""}`,
                }))}
                placeholder="Начните вводить филиал..."
                noOptionsText="Филиалы не найдены"
              />
              {false && (
              <>
              <input
                type="text"
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                placeholder="Поиск по началу слова..."
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 8,
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              />
              <select
                value={newTask.branch_id}
                onChange={(e) => setNewTask({ ...newTask, branch_id: e.target.value })}
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
                {filteredBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                    {branch.primary_client && ` [${branch.primary_client}]`}
                  </option>
                ))}
              </select>
              </>
              )}
            </div>

            {/* Исполнитель */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Исполнитель*
              </div>
              <SmartAutocomplete
                value={newTask.assignee_telegram_id}
                onSelect={(v) => setNewTask({ ...newTask, assignee_telegram_id: String(v || "") })}
                disabled={!newTask.assigner_telegram_id || !newTask.client_id}
                options={availableAssignees.map((user) => ({
                  value: String(user.telegram_id),
                  label: `${getUserFullName(user)} (${user.role || "без роли"})${user.primary_client ? ` [${user.primary_client}]` : ""}${String(user.telegram_id) === String(newTask.assigner_telegram_id) ? " (постановщик)" : ""}`,
                  searchText: `${user.first_name || ""} ${user.last_name || ""} ${user.username || ""} ${user.role || ""} ${user.primary_client || ""}`,
                }))}
                placeholder={(!newTask.assigner_telegram_id || !newTask.client_id) ? "Сначала выберите постановщика и клиента" : "Начните вводить исполнителя..."}
                noOptionsText="Исполнители не найдены"
              />
              {false && (
              <>
              <input
                type="text"
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Поиск по началу слова..."
                disabled={!newTask.assigner_telegram_id || !newTask.client_id}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  marginBottom: 8,
                  borderRadius: 8,
                  background: (!newTask.assigner_telegram_id || !newTask.client_id) ? "#121920" : "#0f151b",
                  border: "1px solid #334756",
                  color: (!newTask.assigner_telegram_id || !newTask.client_id) ? "#6b7280" : "#eaf1f4",
                }}
              />
              <select
                value={newTask.assignee_telegram_id}
                onChange={(e) => setNewTask({ ...newTask, assignee_telegram_id: e.target.value })}
                disabled={!newTask.assigner_telegram_id || !newTask.client_id}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: (!newTask.assigner_telegram_id || !newTask.client_id) ? "#121920" : "#0f151b",
                  border: "1px solid #334756",
                  color: (!newTask.assigner_telegram_id || !newTask.client_id) ? "#6b7280" : "#eaf1f4",
                  cursor: (!newTask.assigner_telegram_id || !newTask.client_id) ? "not-allowed" : "pointer",
                }}
              >
                <option value="">Выберите исполнителя</option>
                {availableAssignees.length === 0 ? (
                  <option value="" disabled>
                    {!newTask.assigner_telegram_id || !newTask.client_id 
                      ? "Сначала выберите постановщика и клиента" 
                      : "Нет доступных исполнителей"}
                  </option>
                ) : (
                  filteredAssignees
                    .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                    .map((user) => (
                    <option key={String(user.id || user.telegram_id)} value={String(user.telegram_id)}>
                      {getUserFullName(user)} ({user.role || "без роли"})
                      {user.primary_client ? ` [${user.primary_client}]` : ''}
                      {String(user.telegram_id) === String(newTask.assigner_telegram_id) ? " (постановщик)" : ""}
                    </option>
                  ))
                )}
              </select>
              </>
              )}
            </div>

            {/* Статус */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                Статус
              </div>
              <select
                value={newTask.status}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setNewTask((prev) => ({
                    ...prev,
                    status: nextStatus,
                    due_date: shouldClearTaskDueDate(nextStatus) ? "" : prev.due_date,
                  }));
                }}
                style={{ 
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Описание задачи */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
            Описание задачи
          </div>
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            style={{ 
              width: "100%",
              minHeight: 100,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
              resize: "vertical",
            }}
            placeholder="Введите описание задачи"
          />
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            onClick={handleCreate}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
              background: "linear-gradient(180deg,#10b981,#059669)",
              color: "#fff",
              flex: 1,
            }}
          >
            Создать задачу (Ctrl+Enter)
          </button>
          <button
            onClick={onClose}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 700,
              background: "linear-gradient(180deg,#6b7280,#4b5563)",
              color: "#fff",
              flex: 1,
            }}
          >
            Отмена (Esc)
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#9fb1bb", textAlign: "center" }}>
          Используйте Ctrl+Enter для сохранения, Esc для отмены
        </div>
      </div>
    </div>
  );
}

// Компонент для отображения редактируемого поля
function EditableField({ 
  label, 
  value, 
  field, 
  onEdit, 
  type = "text", 
  multiline = false, 
  options = null, 
  isUserSelect = false, 
  isClientSelect = false,
  isBranchSelect = false,
  isPrimaryClientSelect = false,
  users = [],
  clients = [],
  branches = [],
  primaryClients = [],
  style = {},
  taskData = null
}) {
  const displayValue = () => {
    if (isUserSelect) {
      const user = users.find(u => String(u.telegram_id) === String(value));
      return user ? getUserFullName(user) : value || "";
    }
    if (isClientSelect) {
      const client = clients.find(c => c.id === value);
      return client ? `${client.name}${client.city ? ` [${client.city}]` : ''}` : value || "";
    }
    if (isBranchSelect) {
      const branch = branches.find(b => b.id === value);
      return branch ? branch.name : value || "";
    }
    if (options && type === "select") {
      const option = options.find(opt => opt.value === value);
      return option ? option.label : value || "";
    }
    if (type === "datetime-local" || type === "date") {
      return value ? formatDateTime(value) : "";
    }
    return value || "";
  };

  // Получение полного имени пользователя
  const getUserFullName = (user) => {
    if (!user) return "";
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.username) {
      return `@${user.username}`;
    } else if (user.role) {
      return user.role;
    } else {
      return user.telegram_id || "Неизвестный";
    }
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
        ...style,
      }}
      onClick={() => onEdit(field, value, label, type, multiline, options, 
        isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#3b82f6";
        e.currentTarget.style.background = "#0f151b";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2f3d49";
        e.currentTarget.style.background = "#0f151b";
      }}
    >
      <div style={{ fontSize: "12px", color: "#9fb1bb", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          whiteSpace: multiline ? "pre-wrap" : "nowrap",
          wordBreak: multiline ? "break-word" : "normal",
          overflow: multiline ? "visible" : "hidden",
          textOverflow: multiline ? "clip" : "ellipsis",
          minHeight: multiline ? 40 : "auto",
          color: value ? "#eaf1f4" : "#6b7280",
        }}
      >
        {displayValue() || <span style={{ fontStyle: "italic" }}>Не указано</span>}
      </div>
      <div style={{ fontSize: 10, color: "#3b82f6", marginTop: 4, textAlign: "right" }}>
        Кликните для редактирования
      </div>
    </div>
  );
}

export default function Tasks() {
  // Список пользователей (используется для отображения ФИО постановщика и исполнителя)
  const [users, setUsers] = useState([]);
  // Список клиентов для привязки к задачам
  const [clients, setClients] = useState([]);
  // Список филиалов
  const [branches, setBranches] = useState([]);
  // Данные задач
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Поля фильтрации
  const [searchQuery, setSearchQuery] = useState("");
  const [qTitle, setQTitle] = useState("");
  const [qClient, setQClient] = useState("");
  const [qPrimaryClient, setQPrimaryClient] = useState("");
  const [qAssignee, setQAssignee] = useState(""); // Фильтр по исполнителю
  const [qBranch, setQBranch] = useState(""); // Фильтр по филиалу
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Сортировка
  const [sortBy, setSortBy] = useState("due_date");
  const [sortOrder, setSortOrder] = useState("asc");
  // Раскрытие деталей задачи
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [taskEventsByTaskId, setTaskEventsByTaskId] = useState({});
  const [taskEventsLoadingByTaskId, setTaskEventsLoadingByTaskId] = useState({});
  const [taskEventsErrorByTaskId, setTaskEventsErrorByTaskId] = useState({});

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Ошибка при выходе из аккаунта:", err);
    } finally {
      localStorage.removeItem("adminUsername");
      localStorage.removeItem("adminPrimaryClient");
      localStorage.removeItem("currentUserRole");
      localStorage.removeItem("currentUserPrimaryClient");
      localStorage.removeItem("currentUserId");
      localStorage.removeItem("currentUserBranchId");
      localStorage.removeItem("currentAuthUserId");
      window.location.reload();
    }
  }

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

  function applyResponsibleScope(query, { isJKAM, userDbId, pc }) {
    if (!isJKAM) return query;
    const conditions = [];
    if (userDbId) conditions.push(`responsible_id.eq.${userDbId}`);
    // Fallback for legacy sessions where localStorage ids are temporarily missing.
    if (!conditions.length) return pc ? query.eq("primary_client", pc) : query;
    return query.or(conditions.join(","));
  }

  function applyTaskOwnershipScope(query, { isJKAM, pc }) {
    if (!isJKAM) return query;
    // Ownership is enforced by RLS on backend.
    return query;
  }

  // Модальные окна
  const [isCreatingModal, setIsCreatingModal] = useState(false);
  const [editModal, setEditModal] = useState({
    isOpen: false,
    field: null,
    value: null,
    label: null,
    type: "text",
    multiline: false,
    options: null,
    isUserSelect: false,
    isClientSelect: false,
    isBranchSelect: false,
    isPrimaryClientSelect: false,
    taskId: null,
    taskData: null
  });

  // Роли, которые могут назначать задачи себе
  const SELF_ASSIGNMENT_ROLES = ["admin", "RKP", "KAM", "JKAM", "regional_manager"];
  
  // Маппинг ролей постановщика на допустимые роли исполнителя
  const ROLE_ASSIGNMENT_MAP = {
    admin: ['RKP', 'KAM', 'JKAM', 'regional_manager'],
    RKP: ['KAM', 'JKAM', 'regional_manager'],
    KAM: ['JKAM', 'regional_manager'],
    JKAM: ['regional_manager'],
    regional_manager: [],
    undefined: [],
    null: [],
  };

  const EDGE_NOTIFICATIONS_ENABLED = false;

  useEffect(() => undefined, []);

  async function sendInAppTaskNotification({ recipientUserId, message, taskId = null }) {
    if (!EDGE_NOTIFICATIONS_ENABLED) return false;
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
        console.error("Ошибка при вызове notify-task:", error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Ошибка отправки уведомления:", err);
      return false;
    }
  }

  // Отправка уведомлений вынесена в Edge Function.
  // Это убирает секреты (бот-токен) из фронтенда.
  async function notifyAssignee({ assigneeUserId, title, assignerName, taskId = null }) {
    const message = `📌 Напоминание о задаче «${title || "Без названия"}» от ${assignerName || "Неизвестный"}.`;
    await sendInAppTaskNotification({
      recipientUserId: assigneeUserId,
      message,
      taskId,
    });
  }

  async function notifyTaskCommentParticipants({ task, newComment }) {
    if (!task) return;

    const authorUserId = String(localStorage.getItem("currentUserId") || "").trim();
    const assignerUser = getUserByTelegramId(task.assigner_telegram_id);
    const assigneeUser = getUserByTelegramId(task.assignee_telegram_id);
    const recipients = [assignerUser, assigneeUser]
      .filter(Boolean)
      .filter((user, index, arr) => arr.findIndex((u) => String(u.id) === String(user.id)) === index)
      .filter((user) => String(user.id || "") !== authorUserId);

    if (!recipients.length) return;

    const commentPreview = String(newComment || "").replace(/\s+/g, " ").trim();
    const clippedComment = commentPreview.length > 120
      ? `${commentPreview.slice(0, 120)}...`
      : commentPreview;
    const message = `💬 Новый комментарий к задаче «${task.title || "Без названия"}»: ${clippedComment || "без текста"}`;

    await Promise.all(
      recipients.map((recipient) =>
        sendInAppTaskNotification({
          recipientUserId: recipient.id,
          message,
          taskId: task.id,
        }),
      ),
    );
  }

  async function runWithSupabaseTimeout(buildRequest, timeoutMs = 15000, label = "операции") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await buildRequest(controller.signal);
    } catch (error) {
      if (error?.name === "AbortError") {
        return { data: null, error: { message: `Превышено время ожидания ${label}.` } };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Диапазон записей для пагинации
  const range = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return { from, to };
  }, [page]);

  // Загрузка списка пользователей, клиентов и филиалов
  useEffect(() => {
    loadUsers();
    loadClients();
    loadBranches();
  }, []);

  // Загрузка пользователей из таблицы users
  async function loadUsers() {
    try {
      const { pc, isGlobal } = getAccessScope();
      let query = supabase
        .from("users")
        .select("id, telegram_id, username, first_name, last_name, role, primary_client, branch_id, city")
        .order("first_name", { ascending: true });
      
      if (!isGlobal && pc) {
        query = query.eq('primary_client', pc);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Ошибка при загрузке пользователей:", error);
        return;
      }
      
      setUsers(data || []);
    } catch (err) {
      console.error("Ошибка при загрузке пользователей:", err);
    }
  }

  // Загрузка клиентов из таблицы clients
  async function loadClients() {
    try {
      const scope = getAccessScope();
      const { pc, isGlobal } = scope;
      
      let query = supabase
        .from("clients")
        .select("id, name, primary_client, city, status, status_text, branch_id, responsible_id, development_plan, info, clients_responsible_manager")
        .order("name", { ascending: true });
      
      if (scope.isJKAM) {
        query = applyResponsibleScope(query, scope);
      } else if (!isGlobal && pc) {
        query = query.eq('primary_client', pc);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Ошибка при загрузке клиентов:", error);
        return;
      }
      
      setClients(data || []);
    } catch (err) {
      console.error("Ошибка при загрузке клиентов:", err);
    }
  }

  // Загрузка филиалов из таблицы branches
  async function loadBranches() {
    try {
      const scope = getAccessScope();
      const { pc, isGlobal } = scope;
      let query = supabase
        .from("branches")
        .select("id, name, primary_client")
        .order("name", { ascending: true });
      
      if (scope.isJKAM) {
        query = applyResponsibleScope(query, scope);
      } else if (!isGlobal && pc) {
        query = query.eq('primary_client', pc);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("Ошибка при загрузке филиалов:", error);
        return;
      }
      
      setBranches(data || []);
    } catch (err) {
      console.error("Ошибка при загрузке филиалов:", err);
    }
  }

  // Загрузка задач при изменении фильтров или пагинации
  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchQuery, qTitle, qClient, qPrimaryClient, qAssignee, qBranch, dateFrom, dateTo, sortBy, sortOrder]);

  useEffect(() => {
    if (!expandedTaskId) return;
    if (taskEventsByTaskId[expandedTaskId]) return;
    fetchTaskEvents(expandedTaskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedTaskId]);

  // Загрузка задач
  async function fetchTasks() {
    // Фильтр по первичному клиенту
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setRows([]);
      setTotal(0);
      return;
    }

    const includes = (v, q) => normalizedIncludes(v, q);
    const matchesTaskFilters = (task) => {
      if (searchQuery) {
        const hit =
          includes(task.title, searchQuery) ||
          includes(task.client, searchQuery) ||
          includes(task.primary_client, searchQuery) ||
          includes(task.status, searchQuery) ||
          includes(task.description, searchQuery);
        if (!hit) return false;
      }
      if (qTitle && !includes(task.title, qTitle)) return false;
      if (qClient && !includes(task.client, qClient)) return false;
      if (qPrimaryClient && !includes(task.primary_client, qPrimaryClient)) return false;
      if (qAssignee && String(task.assignee_telegram_id || "") !== String(qAssignee)) return false;
      if (qBranch && String(task.branch_id || "") !== String(qBranch)) return false;
      if ((dateFrom || dateTo) && !isDueDateWithinRange(task.due_date, dateFrom, dateTo)) return false;
      return true;
    };

    if (scope.isJKAM) {
      let ownQuery = supabase
        .from("tasks")
        .select(`
          id, title, client, primary_client, due_date, status, 
          assigner_telegram_id, assignee_telegram_id, description, 
          result, comments, created_at, updated_at,
          client_id, branch_id, city,
          clients!tasks_client_id_fkey(name, city, status, status_text, manager_contact, responsible_id, development_plan, info, clients_responsible_manager),
          branches!tasks_branch_id_fkey(name)
        `)
        .order(sortBy, { ascending: sortOrder === "asc" });
      ownQuery = applyTaskOwnershipScope(ownQuery, scope);
      const { data, error } = await ownQuery;
      if (error) {
        console.error("Ошибка при загрузке задач:", error);
        setRows([]);
        setTotal(0);
        return;
      }
      const filtered = (data || []).filter(matchesTaskFilters);
      setTotal(filtered.length);
      setRows(filtered.slice(range.from, range.to + 1));
      return;
    }
    
    // Считаем количество
    let head = supabase
      .from("tasks")
      .select("*", { count: "exact", head: true });
    if (!isGlobal && pc) {
      head = head.eq('primary_client', pc);
    }
    head = applyFilters(head);
    const headRes = await head;
    if (!headRes.error) {
      setTotal(headRes.count || 0);
    }
    
    // Получаем записи с дополнительными данными о клиенте и филиале
    let query = supabase
      .from("tasks")
      .select(`
        id, title, client, primary_client, due_date, status, 
        assigner_telegram_id, assignee_telegram_id, description, 
        result, comments, created_at, updated_at,
        client_id, branch_id, city,
        clients!tasks_client_id_fkey(name, city, status, status_text, manager_contact, responsible_id, development_plan, info, clients_responsible_manager),
        branches!tasks_branch_id_fkey(name)
      `)
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(range.from, range.to);
    
    if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    query = applyFilters(query);
    const { data, error } = await query;
    
    if (!error) {
      setRows(data || []);
    } else {
      console.error("Ошибка при загрузке задач:", error);
    }
  }

  async function fetchTaskEvents(taskId) {
    if (!taskId) return;

    setTaskEventsLoadingByTaskId((prev) => ({ ...prev, [taskId]: true }));
    setTaskEventsErrorByTaskId((prev) => ({ ...prev, [taskId]: "" }));

    try {
      const { data, error } = await supabase
        .from("task_events")
        .select("id, task_id, event_type, actor_user_id, assignee_user_id, payload, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Ошибка загрузки task_events:", error);
        setTaskEventsErrorByTaskId((prev) => ({
          ...prev,
          [taskId]: "Не удалось загрузить события задачи",
        }));
        return;
      }

      setTaskEventsByTaskId((prev) => ({ ...prev, [taskId]: data || [] }));
    } catch (error) {
      console.error("Ошибка загрузки task_events:", error);
      setTaskEventsErrorByTaskId((prev) => ({
        ...prev,
        [taskId]: "Ошибка загрузки событий",
      }));
    } finally {
      setTaskEventsLoadingByTaskId((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  // Применяет фильтры поиска к запросу
  function applyFilters(qb) {
    if (searchQuery) {
      qb = qb.or(`title.ilike.%${searchQuery}%,client.ilike.%${searchQuery}%,primary_client.ilike.%${searchQuery}%,status.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }
    if (qTitle) qb = qb.ilike("title", `%${qTitle}%`);
    if (qClient) qb = qb.ilike("client", `%${qClient}%`);
    if (qPrimaryClient) qb = qb.ilike("primary_client", `%${qPrimaryClient}%`);
    if (qAssignee) qb = qb.eq("assignee_telegram_id", qAssignee);
    if (qBranch) qb = qb.eq("branch_id", qBranch);
    if (dateFrom) {
      const fromIso = normalizeDayStart(dateFrom);
      if (fromIso) qb = qb.gte("due_date", fromIso);
    }
    if (dateTo) {
      const toIso = normalizeDueDate(dateTo);
      if (toIso) qb = qb.lte("due_date", toIso);
    }
    return qb;
  }

  // Функция для получения полного имени пользователя
  function getUserFullName(user) {
    if (!user) return "";
    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.username) {
      return `@${user.username}`;
    } else if (user.role) {
      return user.role;
    } else {
      return user.telegram_id || "Неизвестный";
    }
  }

  // Функция для получения пользователя по telegram_id
  function getUserByTelegramId(telegramId) {
    if (!telegramId) return null;
    return users.find(u => String(u.telegram_id) === String(telegramId));
  }

  // Функция для получения пользователя по id (UUID)
  function getUserById(userId) {
    if (!userId) return null;
    return users.find(u => u.id === userId);
  }

  // Функция для получения клиента по id
  function getClientById(clientId) {
    if (!clientId) return null;
    return clients.find(c => c.id === clientId);
  }

  // Функция для получения филиала по id
  function getBranchById(branchId) {
    if (!branchId) return null;
    return branches.find(b => b.id === branchId);
  }

  // Функция для получения списка доступных исполнителей для постановщика
  function getAvailableAssignees(assignerTelegramId, clientId = null) {
    if (!assignerTelegramId) return [];
    
    const assigner = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
    if (!assigner) return [];
    
    const assignerRole = assigner.role;
    const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
    
    let availableUsers = [];
    
    // Если admin - показываем всех пользователей
    if (assignerRole === "admin") {
      availableUsers = users.filter(u => 
        u.telegram_id && String(u.telegram_id) !== String(assigner.telegram_id)
      );
    } else {
      // Для других ролей - показываем пользователей с допустимыми ролями И тем же primary_client
      availableUsers = users.filter(u => 
        u.telegram_id && 
        allowedRoles.includes(u.role) &&
        u.primary_client === assigner.primary_client
      );
    }
    
    // Если постановщик может назначать задачи себе, добавляем его в список
    if (SELF_ASSIGNMENT_ROLES.includes(assignerRole)) {
      const assignerUser = users.find(u => String(u.telegram_id) === String(assignerTelegramId));
      if (assignerUser && !availableUsers.some(u => u.id === assignerUser.id)) {
        availableUsers.unshift(assignerUser); // Добавляем в начало
      }
    }
    
    // Если выбран клиент, добавляем ответственного клиента
    if (clientId) {
      const client = getClientById(clientId);
      if (client?.responsible_id) {
        const responsibleUser = getUserById(client.responsible_id);
        if (responsibleUser && !availableUsers.some(u => u.id === responsibleUser.id)) {
          availableUsers.push(responsibleUser);
        }
      }
    }
    
    return availableUsers;
  }

  /**
   * Отправляет напоминание исполнителю задачи через серверную функцию.
   * @param {Object} task Объект задачи, содержащий title и assignee_telegram_id
   */
  async function handleReminder(task) {
    try {
      // Проверяем наличие исполнителя у задачи
      if (!task.assignee_telegram_id) {
        alert("У задачи не указан исполнитель. Невозможно отправить напоминание.");
        return;
      }
      
      const title = task.title || "Без названия";
      const assigner = getUserByTelegramId(task.assigner_telegram_id);
      const assignee = getUserByTelegramId(task.assignee_telegram_id);
      const assignerName = assigner ? getUserFullName(assigner) : "Неизвестный";
      await notifyAssignee({
        assigneeUserId: assignee?.id || null,
        title,
        assignerName,
        taskId: task.id,
      });
      alert("Напоминание отправлено исполнителю.");
    } catch (err) {
      console.error("Ошибка при отправке напоминания:", err);
      alert("Не удалось отправить напоминание. Попробуйте позже.");
    }
  }

  // Функция экспорта в Excel
  async function exportToExcel() {
    try {
      // Показываем индикатор загрузки
      const exportBtn = document.querySelector('[data-export-btn]');
      const originalText = exportBtn.textContent;
      exportBtn.textContent = "Выгрузка...";
      exportBtn.disabled = true;

      // Загружаем все задачи с текущими фильтрами
      let query = supabase
        .from("tasks")
        .select(`
          id, title, client, primary_client, due_date, status, 
          assigner_telegram_id, assignee_telegram_id, description, 
          result, comments, created_at, updated_at,
          client_id, branch_id, city,
          clients!tasks_client_id_fkey(name, city, status, status_text, responsible_id, development_plan, info, clients_responsible_manager),
          branches!tasks_branch_id_fkey(name)
        `)
        .order(sortBy, { ascending: sortOrder === "asc" });
      
      // Фильтр по первичному клиенту
      const scope = getAccessScope();
      if (scope.isJKAM) {
        query = applyTaskOwnershipScope(query, scope);
      } else {
        if (!scope.isGlobal && !scope.pc) {
          throw new Error("Недостаточно данных доступа для выгрузки");
        }
        if (!scope.isGlobal && scope.pc) {
          query = query.eq('primary_client', scope.pc);
        }
        query = applyFilters(query);
      }
      const { data: allTasks, error } = await query;

      if (error) {
        throw new Error("Ошибка при загрузке данных: " + error.message);
      }

      let exportTasks = allTasks || [];
      if (scope.isJKAM) {
        const includes = (v, q) => normalizedIncludes(v, q);
        exportTasks = exportTasks.filter((task) => {
          if (searchQuery) {
            const hit =
              includes(task.title, searchQuery) ||
              includes(task.client, searchQuery) ||
              includes(task.primary_client, searchQuery) ||
              includes(task.status, searchQuery) ||
              includes(task.description, searchQuery);
            if (!hit) return false;
          }
          if (qTitle && !includes(task.title, qTitle)) return false;
          if (qClient && !includes(task.client, qClient)) return false;
          if (qPrimaryClient && !includes(task.primary_client, qPrimaryClient)) return false;
          if (qAssignee && String(task.assignee_telegram_id || "") !== String(qAssignee)) return false;
          if (qBranch && String(task.branch_id || "") !== String(qBranch)) return false;
          if ((dateFrom || dateTo) && !isDueDateWithinRange(task.due_date, dateFrom, dateTo)) return false;
          return true;
        });
      }

      if (!exportTasks.length) {
        alert("Нет данных для экспорта");
        return;
      }

      // Подготавливаем данные для Excel
      const excelData = exportTasks.map(task => {
        const assigner = getUserByTelegramId(task.assigner_telegram_id);
        const assignee = getUserByTelegramId(task.assignee_telegram_id);
        const client = task.clients || {};
        const branch = task.branches || {};
        const status = normalizeTaskStatus(task.status);
        
        return {
          "ID": task.id,
          "Название": task.title || "",
          "Клиент (ID)": task.client_id || "",
          "Клиент (имя)": task.client || client.name || "",
          "Город клиента": client.city || "",
          "Статус клиента": client.status_text || getStatusText(client.status) || "",
          "Клиент 1 порядка": task.primary_client || "",
          "Филиал (ID)": task.branch_id || "",
          "Филиал (имя)": branch.name || "",
          "Город задачи": task.city || "",
          "Дедлайн": formatDateTime(task.due_date),
          "Статус": status,
          "Постановщик": assigner ? getUserFullName(assigner) : task.assigner_telegram_id,
          "Роль постановщика": assigner?.role || "",
          "Клиент 1 порядка (пост.)": assigner?.primary_client || "",
          "Исполнитель": assignee ? getUserFullName(assignee) : (task.assignee_telegram_id || "-"),
          "Роль исполнителя": assignee?.role || "",
          "Описание": task.description || "",
          "Результат": task.result || "",
          "Комментарии": task.comments || "",
          "Дата создания": formatDateTime(task.created_at),
          "Дата обновления": formatDateTime(task.updated_at),
        };
      });

      // Создаем рабочую книгу
      const wb = XLSX.utils.book_new();
      
      // Создаем лист с данными
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Настраиваем ширину колонок
      const colWidths = [
        { wch: 5 },   // ID
        { wch: 30 },  // Название
        { wch: 20 },  // Клиент (ID)
        { wch: 25 },  // Клиент (имя)
        { wch: 15 },  // Город клиента
        { wch: 15 },  // Статус клиента
        { wch: 15 },  // Клиент 1 порядка
        { wch: 20 },  // Филиал (ID)
        { wch: 20 },  // Филиал (имя)
        { wch: 15 },  // Город задачи
        { wch: 20 },  // Дедлайн
        { wch: 15 },  // Статус
        { wch: 20 },  // Постановщик
        { wch: 15 },  // Роль постановщика
        { wch: 15 },  // Клиент 1 порядка (пост.)
        { wch: 20 },  // Исполнитель
        { wch: 15 },  // Роль исполнителя
        { wch: 40 },  // Описание
        { wch: 40 },  // Результат
        { wch: 40 },  // Комментарии
        { wch: 20 },  // Дата создания
        { wch: 20 },  // Дата обновления
      ];
      ws['!cols'] = colWidths;

      // Добавляем лист в книгу
      XLSX.utils.book_append_sheet(wb, ws, "Задачи");

      // Создаем второй лист со статистикой
      const statsData = [
        ["Статистика задач", ""],
        ["Общее количество задач", exportTasks.length],
        ["В работе", exportTasks.filter(t => normalizeTaskStatus(t.status) === "В работе").length],
        ["Пауза", exportTasks.filter(t => normalizeTaskStatus(t.status) === "Пауза").length],
        ["Просрочено", exportTasks.filter(t => normalizeTaskStatus(t.status) === "Просрочена").length],
        ["На согласовании", exportTasks.filter(t => normalizeTaskStatus(t.status) === "Результат на согласовании").length],
        ["Завершено", exportTasks.filter(t => normalizeTaskStatus(t.status) === "Завершено").length],
        ["", ""],
        ["Дата выгрузки", formatDateTime(new Date().toISOString())],
        ["Примененные фильтры", ""],
        ["Общий поиск", searchQuery || "нет"],
        ["По названию", qTitle || "нет"],
        ["По клиенту", qClient || "нет"],
        ["По клиенту 1 порядка", qPrimaryClient || "нет"],
        ["По исполнителю", qAssignee ? users.find(u => String(u.telegram_id) === String(qAssignee))?.first_name || qAssignee : "нет"],
        ["С даты", dateFrom || "нет"],
        ["По дату", dateTo || "нет"],
      ];

      const ws2 = XLSX.utils.aoa_to_sheet(statsData);
      ws2['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Статистика");

      // Генерируем имя файла с датой
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Задачи_${dateStr}_${new Date().getHours()}${new Date().getMinutes()}.xlsx`;

      // Скачиваем файл
      XLSX.writeFile(wb, fileName);

      // Восстанавливаем кнопку
      exportBtn.textContent = originalText;
      exportBtn.disabled = false;

    } catch (error) {
      console.error("Ошибка при экспорте в Excel:", error);
      alert("Ошибка при экспорте: " + error.message);
      
      // Восстанавливаем кнопку в случае ошибки
      const exportBtn = document.querySelector('[data-export-btn]');
      if (exportBtn) {
        exportBtn.textContent = "📥 Выгрузить в Excel";
        exportBtn.disabled = false;
      }
    }
  }

  // Функция создания задачи
  async function createTask(taskData) {
    try {
      // Получаем данные клиента для задачи
      const selectedClient = getClientById(taskData.client_id);
      const assigner = users.find(u => String(u.telegram_id) === String(taskData.assigner_telegram_id));
      
      // Подготовка данных
      const insertData = {
        title: taskData.title,
        client: selectedClient?.name || null,
        client_id: taskData.client_id,
        branch_id: taskData.branch_id || selectedClient?.branch_id || assigner?.branch_id || null,
        city: selectedClient?.city || assigner?.city || null,
        primary_client: taskData.primary_client || assigner?.primary_client || null,
        due_date: shouldClearTaskDueDate(taskData.status) ? null : normalizeDueDate(taskData.due_date),
        description: taskData.description || null,
        status: normalizeTaskStatus(taskData.status || "Выполняется"),
        assigner_telegram_id: Number(taskData.assigner_telegram_id),
        assignee_telegram_id: Number(taskData.assignee_telegram_id),
        comments: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const { data: createdTask, error } = await runWithSupabaseTimeout(
        (signal) =>
          supabase
            .from("tasks")
            .insert(insertData)
            .select("id")
            .single()
            .abortSignal(signal),
        15000,
        "создания задачи"
      );
      
      if (error) {
        alert("Ошибка при создании задачи: " + error.message);
        console.error("Ошибка создания задачи:", error);
        return false;
      }
      
      // Отправляем уведомление исполнителю о новой задаче
      if (taskData.assignee_telegram_id) {
        const assigner = users.find((u) => String(u.telegram_id) === String(taskData.assigner_telegram_id));
        const assignee = users.find((u) => String(u.telegram_id) === String(taskData.assignee_telegram_id));
        
        const assignerName = assigner ? getUserFullName(assigner) : "Неизвестный";
        try {
          await notifyAssignee({
            assigneeUserId: assignee?.id || null,
            title: taskData.title,
            assignerName,
            taskId: createdTask?.id || null,
          });
        } catch (notifyError) {
          console.error("Уведомление не отправлено, но задача создана:", notifyError);
        }
      }
      
      // Обновляем список задач
      fetchTasks();
      
      return true;
    } catch (error) {
      console.error("Ошибка при создании задачи:", error);
      alert("Ошибка при создании задачи: " + error.message);
      return false;
    }
  }

  // Функция обновления задачи
  async function updateTask(taskId, field, value) {
    try {
    const originalTask = rows.find(r => r.id === taskId);
    if (!originalTask) return false;

    // Если обновляется исполнитель, проверяем права
    if (field === 'assignee_telegram_id') {
      const assignerId = originalTask.assigner_telegram_id;
      const assigneeId = value;
      
      if (assigneeId !== assignerId) {
        const assigner = users.find(u => String(u.telegram_id) === String(assignerId));
        const assignee = users.find(u => String(u.telegram_id) === String(assigneeId));
        
        if (!assigner || !assignee) {
          alert("Не удалось найти пользователей");
          return false;
        }
        
        const assignerRole = assigner.role;
        const assigneeRole = assignee.role;
        const allowedRoles = ROLE_ASSIGNMENT_MAP[assignerRole] || [];
        
        // Если исполнитель - ответственный клиента, разрешаем назначение
        const client = getClientById(originalTask.client_id);
        const isClientResponsible = client?.responsible_id && 
          users.some(u => u.id === client.responsible_id && String(u.telegram_id) === String(assigneeId));
        
        if (!isClientResponsible && assignerRole !== "admin" && !allowedRoles.includes(assigneeRole)) {
          alert(`Постановщик с ролью "${assignerRole}" не может назначать задачи исполнителю с ролью "${assigneeRole}"`);
          return false;
        }
      }
    }

    let updatePayload = null;

    // Если обновляется постановщик, получаем его primary_client
    if (field === 'assigner_telegram_id') {
      const assigner = users.find(u => String(u.telegram_id) === String(value));
      const assignerPrimaryClient = assigner?.primary_client || "";
      updatePayload = {
        [field]: value ? Number(value) : null,
        primary_client: assignerPrimaryClient || null,
        updated_at: new Date().toISOString(),
      };
    } else if (field === 'client_id') {
      const client = getClientById(value);
      const assigner = getUserByTelegramId(originalTask.assigner_telegram_id);
      updatePayload = {
        [field]: value || null,
        client: client?.name || null,
        branch_id: client?.branch_id || assigner?.branch_id || null,
        city: client?.city || assigner?.city || null,
        updated_at: new Date().toISOString(),
      };
    } else if (field === 'due_date') {
      updatePayload = {
        [field]: normalizeDueDate(value),
        updated_at: new Date().toISOString(),
      };
    } else if (field === "status") {
      const normalizedStatus = normalizeTaskStatus(value);
      updatePayload = {
        status: normalizedStatus || null,
        due_date: shouldClearTaskDueDate(normalizedStatus) ? null : originalTask.due_date,
        updated_at: new Date().toISOString(),
      };
    } else {
      const normalizedValue = (() => {
        if (field === "assignee_telegram_id") {
          return value ? Number(value) : null;
        }
        return value || null;
      })();

      updatePayload = {
        [field]: normalizedValue,
        updated_at: new Date().toISOString(),
      };
    }

    const { data: updatedTask, error } = await runWithSupabaseTimeout(
      (signal) =>
        supabase
          .from("tasks")
          .update(updatePayload)
          .eq("id", taskId)
          .select("id")
          .maybeSingle()
          .abortSignal(signal),
      15000,
      "обновления задачи"
    );

    if (error) {
      console.error("Ошибка при обновлении задачи:", error);
      alert("Ошибка при обновлении задачи: " + error.message);
      return false;
    }
    if (!updatedTask?.id) {
      alert("Задача не обновлена: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
      return false;
    }

    const oldComment = String(originalTask.comments || "").trim();
    const newComment = String(updatePayload.comments || "").trim();

    // Отправляем уведомление, если изменилось что-то важное
    if (field === 'assignee_telegram_id' || field === 'status' || field === 'due_date') {
      const assigneeId = field === 'assignee_telegram_id' ? value : originalTask.assignee_telegram_id;
      if (assigneeId) {
        const status = field === 'status' ? normalizeTaskStatus(value) : normalizeTaskStatus(originalTask.status);
        const dueValue = field === "due_date"
          ? normalizeDueDate(value)
          : field === "status" && shouldClearTaskDueDate(status)
            ? null
            : originalTask.due_date;
        const title = originalTask.title;
        const assigner = getUserByTelegramId(originalTask.assigner_telegram_id);
        const assignee = getUserByTelegramId(assigneeId);
        const assignerName = getUserFullName(assigner);

        try {
          await notifyAssignee({
            assigneeUserId: assignee?.id || null,
            title: `${title} (${status})`,
            assignerName,
            taskId,
          });
        } catch (notifyError) {
          console.error("Уведомление не отправлено, но изменение задачи сохранено:", notifyError);
        }
      }
    }

    if (field === "comments" && newComment && newComment !== oldComment) {
      try {
        await notifyTaskCommentParticipants({ task: originalTask, newComment });
      } catch (notifyError) {
        console.error("Ошибка отправки уведомления о комментарии:", notifyError);
      }
    }

    fetchTasks();
    return true;
    } catch (error) {
      console.error("Критическая ошибка при обновлении задачи:", error);
      alert("Не удалось обновить задачу. Проверьте соединение и попробуйте еще раз.");
      return false;
    }
  }

  // Функция для открытия модального окна редактирования
  function handleFieldEdit(taskId, field, currentValue, label, type = "text", multiline = false, options = null, 
    isUserSelect = false, isClientSelect = false, isBranchSelect = false, isPrimaryClientSelect = false, taskData = null) {
    
    const task = rows.find(r => r.id === taskId);
    
    setEditModal({
      isOpen: true,
      field,
      value: currentValue,
      label,
      type,
      multiline,
      options,
      isUserSelect,
      isClientSelect,
      isBranchSelect,
      isPrimaryClientSelect,
      taskId,
      taskData: task || null
    });
  }

  // Функция для сохранения изменений из модального окна
  async function handleModalSave(newValue) {
    if (editModal.taskId && editModal.field) {
      const ok = await updateTask(editModal.taskId, editModal.field, newValue);
      if (!ok) return;
    }
    setEditModal({ 
      isOpen: false, 
      field: null, 
      value: null, 
      label: null, 
      taskId: null,
      taskData: null 
    });
    return true;
  }

  // Обработчик создания задачи
  const handleCreateTask = async (taskData) => {
    const success = await createTask(taskData);
    if (success) {
      setIsCreatingModal(false);
    }
  };

  // Получение уникальных клиентов первого порядка для фильтра
  const uniquePrimaryClients = useMemo(() => {
    return [...new Set(clients.map(c => c.primary_client).filter(Boolean))];
  }, [clients]);

  // Опции статусов задач
  const statusOptions = [
    { value: "Выполняется", label: "В работе" },
    { value: "Пауза", label: "Пауза" },
    { value: "Просрочена", label: "Просрочена" },
    { value: "Результат на согласовании", label: "Результат на согласовании" },
    { value: "Завершено", label: "Завершено" }
  ];

  // Функция для отображения детальной информации о задаче
  function renderTaskDetails(task) {
    const assigner = getUserByTelegramId(task.assigner_telegram_id);
    const assignee = getUserByTelegramId(task.assignee_telegram_id);
    const client = task.clients || {};
    const branch = task.branches || {};
    const status = normalizeTaskStatus(task.status);
    const taskEvents = taskEventsByTaskId[task.id] || [];
    const taskEventsLoading = Boolean(taskEventsLoadingByTaskId[task.id]);
    const taskEventsError = taskEventsErrorByTaskId[task.id] || "";
    const rowStyle = { marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #26231f" };
    const emptyValueStyle = { color: "#8b8372" };
    const renderValue = (value, emptyText = "Не указано") => {
      if (value === null || value === undefined) return <span style={emptyValueStyle}>{emptyText}</span>;
      if (typeof value === "string" && value.trim() === "") return <span style={emptyValueStyle}>{emptyText}</span>;
      return value;
    };

    return (
      <tr key={`${task.id}-details`}>
        <td colSpan="10" style={{ 
          padding: "16px", 
          background: "#0f151b", 
          borderBottom: "1px solid #2f3d49",
          borderTop: "none"
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h3 style={{ margin: 0, color: "#e31b23", marginBottom: 16 }}>Детальная информация о задаче</h3>
              
              <h4 style={{ color: "#3b82f6", marginTop: 0, marginBottom: 16 }}>Основная информация:</h4>
              
              <EditableField
                label="Название задачи"
                value={task.title}
                field="title"
                onEdit={(field, value, label, type, multiline) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Дедлайн"
                value={task.due_date}
                field="due_date"
                type="date"
                onEdit={(field, value, label, type) => 
                  handleFieldEdit(task.id, field, value, label, type)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Статус"
                value={status}
                field="status"
                type="select"
                options={statusOptions}
                onEdit={(field, value, label, type, multiline, options) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <h4 style={{ color: "#8b5cf6", marginTop: 0, marginBottom: 16 }}>Клиентская информация:</h4>
              
              <EditableField
                label="Клиент"
                value={task.client_id}
                field="client_id"
                isClientSelect={true}
                clients={clients}
                onEdit={(field, value, label, type, multiline, options, isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options, false, true, false, false, task)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                  Контакт клиента
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#121920",
                    border: "1px solid #334756",
                    color: "#9fb1bb",
                    whiteSpace: "pre-wrap",
                    minHeight: 48,
                  }}
                >
                  {renderValue(client.manager_contact)}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                  План развития
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#121920",
                    border: "1px solid #334756",
                    color: "#9fb1bb",
                    whiteSpace: "pre-wrap",
                    minHeight: 48,
                  }}
                >
                  {renderValue(client.development_plan)}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                  Информация по клиенту
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#121920",
                    border: "1px solid #334756",
                    color: "#9fb1bb",
                    whiteSpace: "pre-wrap",
                    minHeight: 48,
                  }}
                >
                  {renderValue(client.info)}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>
                  Ответственный менеджер клиента
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#121920",
                    border: "1px solid #334756",
                    color: "#9fb1bb",
                    whiteSpace: "pre-wrap",
                    minHeight: 48,
                  }}
                >
                  {renderValue(client.clients_responsible_manager)}
                </div>
              </div>
               
              <EditableField
                label="Клиент 1 порядка"
                value={task.primary_client}
                field="primary_client"
                isPrimaryClientSelect={true}
                primaryClients={uniquePrimaryClients}
                onEdit={(field, value, label, type, multiline, options, isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options, false, false, false, true, task)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Филиал"
                value={task.branch_id}
                field="branch_id"
                isBranchSelect={true}
                branches={branches}
                onEdit={(field, value, label, type, multiline, options, isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options, false, false, true, false, task)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Город"
                value={task.city}
                field="city"
                onEdit={(field, value, label, type, multiline) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline)}
                taskData={task}
              />
            </div>
            
            <div>
              <h4 style={{ color: "#ec4899", marginBottom: 16 }}>Ответственные лица:</h4>
              
              <EditableField
                label="Постановщик"
                value={task.assigner_telegram_id}
                field="assigner_telegram_id"
                isUserSelect={true}
                users={users}
                onEdit={(field, value, label, type, multiline, options, isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options, true, false, false, false, task)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Исполнитель"
                value={task.assignee_telegram_id}
                field="assignee_telegram_id"
                isUserSelect={true}
                users={getAvailableAssignees(task.assigner_telegram_id, task.client_id)}
                onEdit={(field, value, label, type, multiline, options, isUserSelect, isClientSelect, isBranchSelect, isPrimaryClientSelect, taskData) => 
                  handleFieldEdit(task.id, field, value, label, type, multiline, options, true, false, false, false, task)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <h4 style={{ color: "#f59e0b", marginBottom: 16 }}>Описание и результаты:</h4>
              
              <EditableField
                label="Описание задачи"
                value={task.description}
                field="description"
                multiline={true}
                onEdit={(field, value, label, type, multiline) => 
                  handleFieldEdit(task.id, field, value, label, type, true)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Результат выполнения"
                value={task.result}
                field="result"
                multiline={true}
                onEdit={(field, value, label, type, multiline) => 
                  handleFieldEdit(task.id, field, value, label, type, true)}
                style={{ marginBottom: 16 }}
                taskData={task}
              />
              
              <EditableField
                label="Комментарии"
                value={task.comments}
                field="comments"
                multiline={true}
                onEdit={(field, value, label, type, multiline) => 
                  handleFieldEdit(task.id, field, value, label, type, true)}
                taskData={task}
              />

              <div style={{ marginTop: 20 }}>
                <h4 style={{ color: "#22c55e", marginBottom: 12 }}>Журнал событий</h4>

                {taskEventsLoading && (
                  <div style={{ color: "#9fb1bb", fontSize: 13 }}>Загрузка событий...</div>
                )}

                {!taskEventsLoading && taskEventsError && (
                  <div style={{ color: "#ef4444", fontSize: 13 }}>{taskEventsError}</div>
                )}

                {!taskEventsLoading && !taskEventsError && taskEvents.length === 0 && (
                  <div style={{ color: "#8b8372", fontSize: 13 }}>Событий пока нет</div>
                )}

                {!taskEventsLoading && !taskEventsError && taskEvents.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {taskEvents.map((event) => {
                      const createdAt = event.created_at
                        ? new Date(event.created_at).toLocaleString("ru-RU")
                        : "неизвестно";
                      return (
                        <div
                          key={event.id}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#121920",
                            border: "1px solid #2f2b26",
                            fontSize: 13,
                            color: "#e5dcc6",
                          }}
                        >
                          <div style={{ marginBottom: 4, color: "#eaf1f4", fontWeight: 600 }}>
                            {event.event_type || "event"} • {createdAt}
                          </div>
                          <div style={{ color: "#9fb1bb" }}>
                            Получатель: {event.assignee_user_id || "—"}
                          </div>
                          <div style={{ color: "#a8a093", marginTop: 4, wordBreak: "break-word" }}>
                            {event.payload ? JSON.stringify(event.payload) : "{}"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  // Основной интерфейс управления задачами
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <Wrap>
      {/* Модальное окно для редактирования */}
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
          isClientSelect={editModal.isClientSelect}
          clients={clients}
          isBranchSelect={editModal.isBranchSelect}
          branches={branches}
          isPrimaryClientSelect={editModal.isPrimaryClientSelect}
          primaryClients={uniquePrimaryClients}
          onSave={handleModalSave}
          onClose={() => setEditModal({ 
            isOpen: false, 
            field: null, 
            value: null, 
            label: null, 
            taskId: null,
            taskData: null 
          })}
          taskData={editModal.taskData}
          currentTaskId={editModal.taskId}
        />
      )}

      {/* Модальное окно для создания задачи */}
      {isCreatingModal && (
        <CreateTaskModal
          onSave={handleCreateTask}
          onClose={() => setIsCreatingModal(false)}
          users={users}
          clients={clients}
          branches={branches}
          primaryClients={uniquePrimaryClients}
          statusOptions={statusOptions}
        />
      )}

      {/* Заголовок и кнопки для создания новой задачи и экспорта */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        width: "100%", 
        maxWidth: "100%",
        flexWrap: "wrap",
        gap: "12px"
      }}>
        <H1>Задачи (всего: {total})</H1>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Btn data-export-btn onClick={exportToExcel} style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}>
            📥 Выгрузить в Excel
          </Btn>
          <Btn onClick={() => setIsCreatingModal(true)}>+ Новая задача</Btn>
          <BtnGhost
            onClick={handleLogout}
            style={{ borderColor: "#7f1d1d", color: "#fecaca" }}
          >
            Выйти
          </BtnGhost>
        </div>
      </div>

      {/* Фильтры */}
      <Card style={{ width: "100%", maxWidth: "100%", overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, minWidth: "min-content" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Input
              placeholder="Поиск по всем полям (ID, название, клиент, исполнитель, статус...)"
              value={searchQuery}
              onChange={(e) => {
                setPage(1);
                setSearchQuery(e.target.value);
              }}
            />
            <div style={{ fontSize: "12px", color: "#9fb1bb", marginTop: "4px" }}>
              Ищет по всем видимым полям таблицы
            </div>
          </div>
          <Input
            placeholder="Название"
            value={qTitle}
            onChange={(e) => {
              setPage(1);
              setQTitle(e.target.value);
            }}
          />
          <Input
            placeholder="Клиент"
            value={qClient}
            onChange={(e) => {
              setPage(1);
              setQClient(e.target.value);
            }}
          />
          
          {/* Выпадающий список для фильтрации по клиенту 1 порядка */}
          <select
            value={qPrimaryClient}
            onChange={(e) => {
              setPage(1);
              setQPrimaryClient(e.target.value);
            }}
            style={{ 
              padding: "10px 12px", 
              borderRadius: 8, 
              background: "#0f151b", 
              border: "1px solid #334756", 
              color: "#eaf1f4",
              minHeight: "42px"
            }}
          >
            <option value="">Все клиенты 1 порядка</option>
            {uniquePrimaryClients.map(pc => (
              <option key={pc} value={pc}>{pc}</option>
            ))}
          </select>
          
          {/* Выпадающий список для фильтрации по исполнителю */}
          <select
            value={qAssignee}
            onChange={(e) => {
              setPage(1);
              setQAssignee(e.target.value);
            }}
            style={{ 
              padding: "10px 12px", 
              borderRadius: 8, 
              background: "#0f151b", 
              border: "1px solid #334756", 
              color: "#eaf1f4",
              minHeight: "42px"
            }}
          >
            <option value="">Все исполнители</option>
            {users
              .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
              .map(user => (
              <option key={String(user.id || user.telegram_id)} value={String(user.telegram_id)}>
                {getUserFullName(user)} ({user.role || "без роли"})
              </option>
            ))}
          </select>

          <select
            value={qBranch}
            onChange={(e) => {
              setPage(1);
              setQBranch(e.target.value);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
              minHeight: "42px"
            }}
          >
            <option value="">Все филиалы</option>
            {branches.map((branch) => (
              <option key={branch.id} value={String(branch.id)}>
                {branch.name}
              </option>
            ))}
          </select>
          
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setPage(1);
              setDateFrom(e.target.value);
            }}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setPage(1);
              setDateTo(e.target.value);
            }}
          />
          {/* Селектор сортировки */}
          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('-');
              setSortBy(by);
              setSortOrder(order);
            }}
            style={{ 
              padding: "10px 12px", 
              borderRadius: 8, 
              background: "#0f151b", 
              border: "1px solid #334756", 
              color: "#eaf1f4",
              minHeight: "42px"
            }}
          >
            <option value="due_date-asc">Сортировка: Дедлайн (ближайшие)</option>
            <option value="due_date-desc">Сортировка: Дедлайн (дальние)</option>
            <option value="created_at-desc">Сортировка: Новые сначала</option>
            <option value="created_at-asc">Сортировка: Старые сначала</option>
            <option value="title-asc">Сортировка: Название (А-Я)</option>
            <option value="title-desc">Сортировка: Название (Я-А)</option>
          </select>
        </div>
      </Card>

      {/* Таблица задач */}
      <Card style={{ width: "100%", maxWidth: "100%", overflowX: "auto" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ 
            width: "100%", 
            borderCollapse: "collapse",
            minWidth: "1000px",
            tableLayout: "fixed"
          }}>
            <thead>
              <tr>
                <Th style={{ width: "95px" }}>Дедлайн</Th>
                <Th style={{ width: "260px" }}>Название</Th>
                <Th style={{ width: "220px" }}>Клиент</Th>
                <Th style={{ width: "90px" }}>Клиент 1 порядка</Th>
                <Th style={{ width: "140px" }}>Филиал</Th>
                <Th style={{ width: "120px" }}>Статус</Th>
                <Th style={{ width: "120px" }}>Постановщик</Th>
                <Th style={{ width: "120px" }}>Исполнитель</Th>
                <Th style={{ width: "90px" }}>Создана</Th>
                <Th style={{ width: "90px" }}></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const assigner = getUserByTelegramId(r.assigner_telegram_id);
                const assignee = getUserByTelegramId(r.assignee_telegram_id);
                const client = r.clients || {};
                const branch = r.branches || {};
                const status = normalizeTaskStatus(r.status);
                const isExpanded = expandedTaskId === r.id;
                
                return (
                  <Fragment key={r.id}>
                    {/* Основная строка с данными задачи */}
                    <tr 
                      style={{ 
                        backgroundColor: isExpanded ? '#2f3d49' : 'transparent',
                        borderBottom: isExpanded ? '2px solid #8b6b2a' : '1px solid #2f3d49',
                        cursor: "pointer"
                      }}
                      onClick={() => {
                        // Если кликнули на строку (не на кнопки), раскрываем/скрываем детали
                        setExpandedTaskId(isExpanded ? null : r.id);
                      }}
                    >
                      <Td style={{ width: "95px" }}>{formatDateOnly(r.due_date)}</Td>
                      <Td style={{ 
                        width: "260px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }} title={r.title}>{safe(r.title)}</Td>
                      <Td style={{ width: "220px" }}>
                        <div>
                          <div style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }} title={r.client}>
                            {safe(r.client)}
                          </div>
                          {(client.city || client.manager_contact) && (
                            <div style={{ 
                              fontSize: "12px", 
                              color: "#9fb1bb",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}>
                              {client.city || "Без города"}
                              {client.status_text && ` | ${client.status_text}`}
                              {client.manager_contact && ` | Контакт: ${client.manager_contact}`}
                            </div>
                          )}
                        </div>
                      </Td>
                      <Td style={{ width: "90px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontSize: "12px",
                          fontWeight: "bold",
                          backgroundColor: r.primary_client ? "#334756" : "transparent",
                          color: r.primary_client ? "#eaf1f4" : "#9fb1bb",
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }} title={r.primary_client}>
                          {safe(r.primary_client) || "не указан"}
                        </span>
                      </Td>
                      <Td style={{ width: "140px" }}>
                        <span style={{
                          fontSize: "12px",
                          color: "#9fb1bb",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }} title={branch.name}>
                          {safe(branch.name) || "не указан"}
                        </span>
                      </Td>
                      <Td style={{ width: "120px" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: 4,
                          fontSize: "12px",
                          fontWeight: "bold",
                          backgroundColor: getStatusColor(status),
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {safe(status)}
                        </span>
                      </Td>
                      <Td style={{ width: "120px" }}>
                        <div>
                          <div style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }} title={assigner ? getUserFullName(assigner) : r.assigner_telegram_id}>
                            {assigner ? getUserFullName(assigner) : r.assigner_telegram_id}
                          </div>
                          {assigner && assigner.role && (
                            <div style={{ 
                              fontSize: "12px", 
                              color: "#9fb1bb",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}>
                              {assigner.role}
                              {assigner.primary_client && ` | ${assigner.primary_client}`}
                            </div>
                          )}
                        </div>
                      </Td>
                      <Td style={{ width: "120px" }}>
                        <div>
                          <div style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }} title={assignee ? getUserFullName(assignee) : (r.assignee_telegram_id || "-")}>
                            {assignee ? getUserFullName(assignee) : (r.assignee_telegram_id || "-")}
                          </div>
                          {assignee && assignee.role && (
                            <div style={{ 
                              fontSize: "12px", 
                              color: "#9fb1bb",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}>
                              {assignee.role}
                              {assignee.primary_client && ` | ${assignee.primary_client}`}
                            </div>
                          )}
                        </div>
                      </Td>
                      <Td style={{ width: "90px" }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU') : "-"}</Td>
                      <Td style={{ width: "90px" }}>
                        <div style={{ 
                          display: "flex", 
                          gap: "8px",
                          flexWrap: "nowrap",
                          justifyContent: "center"
                        }}
                        onClick={(e) => e.stopPropagation()} // Предотвращаем раскрытие при клике на кнопки
                        >
                          {/* Кнопка отправки напоминания исполнителю */}
                          <BtnGhost 
                            onClick={() => handleReminder(r)}
                            style={{ 
                              padding: "6px 8px",
                              minWidth: "36px"
                            }}
                          >🔔</BtnGhost>
                          {/* Кнопка раскрытия деталей */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTaskId(isExpanded ? null : r.id);
                            }}
                            style={{
                              appearance: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "6px 8px",
                              minWidth: "36px",
                              background: "linear-gradient(180deg,#6b7280,#4b5563)",
                              borderRadius: "6px",
                              color: "white",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                          >
                            {isExpanded ? "▲" : "▼"}
                          </button>
                        </div>
                      </Td>
                    </tr>
                    
                    {/* Строка с детальной информацией (раскрывается) */}
                    {isExpanded && renderTaskDetails(r)}
                  </Fragment>
                );
              })}
              {!rows.length && (
                <tr>
                  <Td colSpan={10}>Записей нет.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Пагинация */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <BtnGhost disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Назад
          </BtnGhost>
          <Note>
            стр. {page} / {pages}
          </Note>
          <BtnGhost disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Вперёд →
          </BtnGhost>
        </div>
      </Card>
    </Wrap>
  );
}

// Вспомогательные компоненты (аналоги из Admin.jsx)
function Wrap({ children }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        justifyItems: "center",
        alignContent: "start",
        gap: 16,
        padding: "20px 16px",
        background: "#0b1014",
        color: "#eaf1f4",
        boxSizing: "border-box",
        overflowX: "hidden"
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
        padding: 20,
        boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </section>
  );
}
function H1({ children }) {
  return <h1 style={{ margin: 0, fontSize: "clamp(1.5rem, 4vw, 2rem)" }}>{children}</h1>;
}
function P({ children }) {
  return <p style={{ margin: "8px 0", opacity: 0.8 }}>{children}</p>;
}
function Label({ children }) {
  return <div style={{ fontSize: 14, color: "#9fb1bb", marginBottom: 6, fontWeight: 500 }}>{children}</div>;
}
function Note({ children }) {
  return <div style={{ fontSize: 14, color: "#9fb1bb", padding: "8px 12px" }}>{children}</div>;
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
        fontSize: "14px",
        boxSizing: "border-box",
        width: "100%",
        minHeight: "42px",
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
        padding: "10px 16px",
        borderRadius: 10,
        fontWeight: 700,
        background: "linear-gradient(180deg,#f97316,#ea580c)",
        color: "#fff",
        boxShadow: "0 8px 22px rgba(227,27,35,.28), inset 0 0 0 1px rgba(255,255,255,.2)",
        opacity: rest.disabled ? 0.6 : 1,
        fontSize: "14px",
        whiteSpace: "nowrap",
        minHeight: "42px",
        ...(rest.style || {}),
      }}
    >
      {children}
    </button>
  );
}
function BtnGhost({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        appearance: "none",
        cursor: "pointer",
        padding: "10px 16px",
        borderRadius: 10,
        fontWeight: 700,
        background: "linear-gradient(180deg,#121920,#0f151b)",
        border: "1px solid #8b6b2a",
        color: "#eaf1f4",
        opacity: rest.disabled ? 0.6 : 1,
        fontSize: "14px",
        whiteSpace: "nowrap",
        minHeight: "42px",
        ...(rest.style || {}),
      }}
    >
      {children}
    </button>
  );
}
function Th({ children, style }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px",
        position: "sticky",
        top: 0,
        background: "#191714",
        borderBottom: "1px solid #2f3d49",
        fontSize: "14px",
        fontWeight: "600",
        ...style,
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, colSpan, style }) {
  return (
    <td
      colSpan={colSpan}
      style={{ 
        padding: "12px", 
        borderTop: "1px solid #2f3d49",
        fontSize: "14px",
        verticalAlign: "top",
        ...style 
      }}
    >
      {children}
    </td>
  );
}
function safe(v) {
  return v ?? "";
}

// Функция для получения цвета статуса
function getStatusColor(status) {
  switch (status) {
    case 'В работе':
    case 'в работе':
    case 'выполняется':
    case 'Выполляется':
      return '#f59e0b'; // оранжевый
    case 'Пауза':
    case 'пауза':
      return '#64748b'; // slate
    case 'Просрочена':
      return '#ef4444'; // красный
    case 'Результат на согласовании':
      return '#3b82f6'; // синий
    case 'Завершено':
      return '#10b981'; // зеленый
    default:
      return '#6b7280'; // серый
  }
}

