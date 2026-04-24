// src/Branches.jsx
// Страница управления филиалами. Позволяет просматривать существующие филиалы,
// добавлять новые и редактировать информацию о филиалах.
// Структура соответствует таблице branches в БД.

import { Fragment, useEffect, useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { normalizeSearchText } from "./searchUtils";

// Локальные компоненты UI (аналогичные Clients.jsx)
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

// Модальное окно для редактирования полей (аналогичное Clients.jsx)
function EditModal({ 
  field, 
  value, 
  label, 
  type = "text", 
  onSave, 
  onClose, 
  multiline = false, 
  options = null, 
  isUserSelect = false, 
  users = [], 
  isPrimaryClientSelect = false, 
  primaryClients = [] 
}) {
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
      console.error("Branch edit save failed:", err);
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
                  {getUserFullName(user)} ({user.role || "без роли"})
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
    } else {
      return (
        <Input
          type={type}
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
function EditableField({ 
  label, 
  value, 
  field, 
  onEdit, 
  type = "text", 
  multiline = false, 
  options = null, 
  isUserSelect = false, 
  users = [], 
  isPrimaryClientSelect = false,
  getUserFullName: getUserFullNameProp
}) {
  const resolveUserName = getUserFullNameProp || getUserFullName;

  const displayValue = () => {
    if (isUserSelect) {
      const user = users.find(u => String(u.telegram_id) === String(value));
      return user ? resolveUserName(user) : value || "";
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

// Фильтры для филиалов
function Filters({ filters, onFilterChange, cities, primaryClients, users, getUserFullName }) {
  return (
    <Card style={{ width: "100%", maxWidth: 1200, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Фильтры филиалов</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {/* Поиск */}
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Поиск
          </label>
          <Input
            placeholder="Название, город, клиент, ответственный..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        {/* Город - выпадающий список */}
        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Город
          </label>
          <select
            value={filters.city}
            onChange={(e) => onFilterChange('city', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="">Все города</option>
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </div>
        
        {/* Клиент 1 порядка - выпадающий список */}
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
            <option value="">Все клиенты 1 порядка</option>
            {primaryClients.map((pc) => (
              <option key={pc} value={pc}>{pc}</option>
            ))}
          </select>
        </div>
        
        {/* Ответственный - выпадающий список */}
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
                {getUserFullName(user)} ({user.role || "без роли"})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
            Сортировка
          </label>
          <select
            value={filters.sort}
            onChange={(e) => onFilterChange('sort', e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0f151b",
              border: "1px solid #334756",
              color: "#eaf1f4",
            }}
          >
            <option value="name_asc">От А до Я</option>
            <option value="name_desc">От Я до А</option>
            <option value="newest_first">Самые новые</option>
            <option value="newest_first_alias">Сначала новые</option>
            <option value="oldest_first">Сначала старые</option>
            <option value="with_clients">Есть клиенты</option>
            <option value="without_clients">Нет клиентов</option>
            <option value="clients_count_desc">Количество клиентов</option>
            <option value="clients_count_asc">Количество клиентов (по возрастанию)</option>
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

// Вспомогательные функции
function formatDate(dateString) {
  if (!dateString) return "не указан";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (e) {
    return dateString;
  }
}

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

// Function to get user full name (moved to global scope)
function getUserFullName(user) {
  if (!user) return "";
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  } else if (user.first_name) {
    return user.first_name;
  } else if (user.username) {
    return `@${user.username}`;
  } else {
    return `ID: ${user.telegram_id}`;
  }
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

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]); // Для подсчета клиентов по филиалам
  const [users, setUsers] = useState([]); // Список пользователей для выпадающих списков
  const [cities, setCities] = useState([]); // Уникальные города для фильтра
  const [primaryClients, setPrimaryClients] = useState([]); // Уникальные клиенты 1 порядка
  const [isAdding, setIsAdding] = useState(false);
  const [expandedBranchId, setExpandedBranchId] = useState(null);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [filters, setFilters] = useState({
    city: "",
    primary_client: "",
    responsible: "",
    search: "",
    sort: "newest_first",
  });

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
        return { data: null, error: { message: `Превышено время ожидания ${label}.` } };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  
  const [newBranch, setNewBranch] = useState({
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
    branchId: null,
  });

  useEffect(() => undefined, []);

  const yesNoOptions = [
    { value: "Да", label: "Да" },
    { value: "Нет", label: "Нет" },
  ];

  // Функция для получения имени пользователя
  // Функция экспорта списка филиалов в Excel
  async function exportToExcel() {
    try {
      const exportBtn = document.querySelector('[data-branches-export-btn]');
      const originalText = exportBtn ? exportBtn.textContent : '';
      if (exportBtn) {
        exportBtn.textContent = 'Выгрузка...';
        exportBtn.disabled = true;
      }
      
      // Загружаем данные филиалов для экспорта
      const scope = getAccessScope();
      const { pc, isGlobal } = scope;
      if (!isGlobal && !scope.isJKAM && !pc) {
        throw new Error("Недостаточно данных доступа для выгрузки");
      }
      let query = supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (scope.isJKAM) {
        query = applyResponsibleScope(query, scope);
      } else if (!isGlobal && pc) {
        query = query.eq('primary_client', pc);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error('Ошибка при загрузке данных филиалов: ' + error.message);
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
      
      // Получаем количество клиентов по каждому филиалу
      const branchesWithCounts = await Promise.all(list.map(async (branch) => {
        let countQuery = supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branch.id);
        if (scope.isJKAM) {
          const conditions = [];
          if (scope.userDbId) conditions.push(`responsible_id.eq.${scope.userDbId}`);
          if (conditions.length) {
            countQuery = countQuery.or(conditions.join(","));
          } else {
            countQuery = scope.pc ? countQuery.eq("primary_client", scope.pc) : countQuery;
          }
        }
        const { count } = await countQuery;
        
        return {
          ...branch,
          clients_count: count || 0
        };
      }));
      
      // Подготавливаем данные для Excel
      const excelData = branchesWithCounts.map((br) => {
        const responsibleUser = findResponsibleUser(br.responsible_id, br.responsible);
        const responsibleName = responsibleUser ? getUserFullName(responsibleUser) : br.responsible || '';
        
        return {
          ID: br.id,
          'Название': br.name || '',
          'Клиент 1 порядка': br.primary_client || '',
          'Город': br.city || '',
          'Ответственный': responsibleName,
          'Стратегический план': br.strategy_plan || '',
          'ДР Филиала': formatDate(br.branch_birthday) || '',
          'Дата посещения': formatDate(br.visit_date) || '',
          'Торговый зал': br.trading_hall || '',
          'Обучение': br.training || '',
          'Директор': br.director || '',
          'НС РП': br.ns_rp || '',
          'НС ОП': br.ns_op || '',
          'НС КП': br.ns_kp || '',
          'НС СМО': br.ns_smo || '',
          'МПП': br.mpp || '',
          'ТОП клиенты SDS': br.top_clients_sds || '',
          'ТОП клиенты по филиалу': br.top_clients_branch || '',
          'Мероприятия': br.upcoming_events || '',
          'Новинки': br.new_products || '',
          'Каталоги/образцы': br.catalogs_samples || '',
          'Комментарии': br.comments || '',
          'Информация к задаче': br.task_info || '',
          'Количество клиентов': br.clients_count || 0,
          'Дата создания': formatDateTime(br.created_at) || '',
          'Дата обновления': formatDateTime(br.updated_at) || '',
        };
      });
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      
      // Настраиваем ширину колонок
      ws['!cols'] = [
        { wch: 36 },   // ID
        { wch: 25 },   // Название
        { wch: 20 },   // Клиент 1 порядка
        { wch: 15 },   // Город
        { wch: 20 },   // Ответственный
        { wch: 40 },   // Стратегический план
        { wch: 12 },   // ДР Филиала
        { wch: 12 },   // Дата посещения
        { wch: 15 },   // Торговый зал
        { wch: 20 },   // Обучение
        { wch: 20 },   // Директор
        { wch: 10 },   // НС РП
        { wch: 10 },   // НС ОП
        { wch: 10 },   // НС КП
        { wch: 10 },   // НС СМО
        { wch: 10 },   // МПП
        { wch: 20 },   // ТОП клиенты SDS
        { wch: 20 },   // ТОП клиенты по филиалу
        { wch: 20 },   // Мероприятия
        { wch: 20 },   // Новинки
        { wch: 20 },   // Каталоги/образцы
        { wch: 30 },   // Комментарии
        { wch: 20 },   // Информация к задаче
        { wch: 10 },   // Количество клиентов
        { wch: 18 },   // Дата создания
        { wch: 18 },   // Дата обновления
      ];
      
      XLSX.utils.book_append_sheet(wb, ws, 'Филиалы');
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `Филиалы_${dateStr}_${new Date().getHours()}${new Date().getMinutes()}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      if (exportBtn) {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
      }
    } catch (err) {
      console.error('Ошибка при экспорте филиалов:', err);
      alert('Ошибка при экспорте: ' + err.message);
      const exportBtn = document.querySelector('[data-branches-export-btn]');
      if (exportBtn) {
        exportBtn.textContent = '📥 Выгрузить в Excel';
        exportBtn.disabled = false;
      }
    }
  }

  // Загрузка данных
  useEffect(() => {
    fetchBranches();
    fetchClientsForCounts();
    fetchUsers();
  }, []);

  // Обновление списка городов при изменении филиалов
  useEffect(() => {
    if (branches.length > 0) {
      const uniqueCities = [...new Set(branches.map(b => b.city).filter(Boolean))].sort();
      setCities(uniqueCities);
      
      // Обновление уникальных клиентов 1 порядка
      const uniquePrimaryClients = [...new Set(branches.map(b => b.primary_client).filter(Boolean))];
      setPrimaryClients(uniquePrimaryClients);
    }
  }, [branches]);

  async function fetchBranches() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setBranches([]);
      return;
    }
    let query = supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: false });
    
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

  async function fetchClientsForCounts() {
    const scope = getAccessScope();
    const { pc, isGlobal } = scope;
    if (!isGlobal && !scope.isJKAM && !pc) {
      setClients([]);
      return;
    }
    let query = supabase
      .from("clients")
      .select("id, branch_id, responsible, responsible_id");
    
    if (scope.isJKAM) {
      const conditions = [];
      if (scope.userDbId) conditions.push(`responsible_id.eq.${scope.userDbId}`);
      if (conditions.length) {
        query = query.or(conditions.join(","));
      } else {
        query = pc ? query.eq("primary_client", pc) : query;
      }
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    const { data, error } = await query;
    
    if (!error) {
      setClients(data || []);
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
      .select("id, telegram_id, first_name, last_name, username, role, primary_client")
      .order("first_name", { ascending: true });
    
    if (scope.isJKAM) {
      if (scope.userDbId) {
        query = query.eq("id", scope.userDbId);
      } else {
        query = pc ? query.eq("primary_client", pc) : query;
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

  async function addBranch() {
    const normalizedName = String(newBranch.name || "").trim();
    const effectivePrimaryClient = String(
      newBranch.primary_client || getAccessScope().pc || ""
    ).trim();

    if (!normalizedName || !effectivePrimaryClient) {
      alert("Пожалуйста, заполните обязательные поля: название и клиент 1 порядка");
      return;
    }

    const responsibleAssignment = resolveResponsibleAssignment(users, newBranch.responsible);
    const insertData = {
      name: normalizedName,
      primary_client: effectivePrimaryClient,
      city: newBranch.city || null,
      responsible: responsibleAssignment.responsible,
      responsible_id: responsibleAssignment.responsible_id,
      strategy_plan: newBranch.strategy_plan || null,
      branch_birthday: newBranch.branch_birthday || null,
      visit_date: newBranch.visit_date || null,
      trading_hall: newBranch.trading_hall || null,
      training: newBranch.training || null,
      director: newBranch.director || null,
      ns_rp: newBranch.ns_rp || null,
      ns_op: newBranch.ns_op || null,
      ns_kp: newBranch.ns_kp || null,
      ns_smo: newBranch.ns_smo || null,
      mpp: newBranch.mpp || null,
      top_clients_sds: newBranch.top_clients_sds || null,
      top_clients_branch: newBranch.top_clients_branch || null,
      upcoming_events: newBranch.upcoming_events || null,
      new_products: newBranch.new_products || null,
      catalogs_samples: newBranch.catalogs_samples || null,
      comments: newBranch.comments || null,
      task_info: newBranch.task_info || null,
    };
    
    const { data: insertedBranch, error } = await runWithSupabaseTimeout(
      (signal) =>
        supabase
          .from("branches")
          .insert(insertData)
          .select("id")
          .single()
          .abortSignal(signal),
      15000,
      "добавления филиала"
    );
    if (!error && insertedBranch?.id) {
      // Сброс формы
      setNewBranch({
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
      setIsAdding(false);
      fetchBranches();
    } else {
      console.error("Ошибка при добавлении филиала", error);
      alert("Ошибка при добавлении филиала: " + error.message);
    }
  }

  async function updateBranch(branchId, field, value) {
    try {
      const updateData = {
        [field]: value || null,
        updated_at: new Date().toISOString(),
      };

      if (field === "responsible") {
        const responsibleAssignment = resolveResponsibleAssignment(users, value);
        updateData.responsible = responsibleAssignment.responsible;
        updateData.responsible_id = responsibleAssignment.responsible_id;
      }

      const { data: updatedBranch, error } = await runWithSupabaseTimeout(
        (signal) =>
          supabase
            .from("branches")
            .update(updateData)
            .eq("id", branchId)
            .select("id")
            .maybeSingle()
            .abortSignal(signal),
        15000,
        "обновления филиала"
      );

      if (!error && updatedBranch?.id) {
        fetchBranches();
        return true;
      }
      if (!error && !updatedBranch?.id) {
        alert("Филиал не обновлен: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
        return false;
      }
      console.error("Ошибка при обновлении филиала", error);
      alert("Ошибка при обновлении: " + error.message);
      return false;
    } catch (error) {
      console.error("Критическая ошибка при обновлении филиала", error);
      alert("Не удалось обновить филиал. Проверьте соединение и попробуйте еще раз.");
      return false;
    }
  }

  const handleFieldEdit = useCallback((branchId, field, currentValue, label, type = "text", multiline = false, options = null, isUserSelect = false, isPrimaryClientSelect = false) => {
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
      branchId,
    });
  }, []);

  const handleModalSave = useCallback(async (newValue) => {
    if (editModal.branchId && editModal.field) {
      const ok = await updateBranch(editModal.branchId, editModal.field, newValue);
      if (!ok) return;
    }
    setEditModal({ isOpen: false, field: null, value: null, label: null, branchId: null });
    return true;
  }, [editModal]);

  const handleModalClose = useCallback(() => {
    setEditModal({ isOpen: false, field: null, value: null, label: null, branchId: null });
  }, []);

  async function deleteBranch(branchId) {
    // Проверяем, есть ли клиенты в этом филиале
    const scope = getAccessScope();
    if (scope.role === "regional_manager") {
      alert("Удаление филиалов недоступно для роли Regional.");
      return;
    }
    const { pc, isGlobal } = scope;
    let query = supabase
      .from("clients")
      .select("id")
      .eq("branch_id", branchId)
      .limit(1);
    
    if (scope.isJKAM) {
      const conditions = [];
      if (scope.userDbId) conditions.push(`responsible_id.eq.${scope.userDbId}`);
      if (conditions.length) {
        query = query.or(conditions.join(","));
      } else {
        query = pc ? query.eq("primary_client", pc) : query;
      }
    } else if (!isGlobal && pc) {
      query = query.eq('primary_client', pc);
    }
    
    const { data: clientsInBranch } = await query;
    
    if (clientsInBranch && clientsInBranch.length > 0) {
      if (!window.confirm("В этом филиале есть клиенты. При удалении филиала у клиентов будет сброшен branch_id. Продолжить?")) {
        return;
      }
      
      // Сбрасываем branch_id у клиентов этого филиала
      let updateQuery = supabase
        .from("clients")
        .update({ branch_id: null })
        .eq("branch_id", branchId);
      
      if (!isGlobal && pc) {
        updateQuery = updateQuery.eq('primary_client', pc);
      }
      
      await updateQuery;
    }
    
    if (!window.confirm("Вы уверены, что хотите удалить этот филиал?")) {
      return;
    }
    
    let deleteQuery = supabase
      .from("branches")
      .delete()
      .eq("id", branchId);
    
    if (!isGlobal && pc) {
      deleteQuery = deleteQuery.eq('primary_client', pc);
    }
    
    const { data: deletedRows, error } = await runWithSupabaseTimeout(
      (signal) => deleteQuery.select("id").abortSignal(signal),
      15000,
      "удаления филиала"
    );
    
    const deletedBranch = Array.isArray(deletedRows) && deletedRows.length ? deletedRows[0] : null;
    if (!error && deletedBranch?.id) {
      fetchBranches();
      if (expandedBranchId === branchId) {
        setExpandedBranchId(null);
      }
    } else {
      if (!error && !deletedBranch?.id) {
        alert("Филиал не удален: нет доступа к записи или сессия устарела. Обновите страницу и попробуйте снова.");
        return;
      }
      console.error("Ошибка при удалении филиала", error);
      alert("Ошибка при удалении филиала: " + error.message);
    }
  }

  function toggleBranchDetails(branchId) {
    setEditingBranchId(null);
    setExpandedBranchId(expandedBranchId === branchId ? null : branchId);
  }

  function handleFilterChange(filterName, value) {
    if (filterName === 'reset') {
      setFilters({
        city: "",
        primary_client: "",
        responsible: "",
        search: "",
        sort: "newest_first",
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
    return (
      users.find(u => String(u.id) === String(responsibleId)) ||
      users.find(u => String(u.telegram_id) === String(responsibleValue)) ||
      users.find(u => getUserFullName(u) === String(responsibleValue))
    );
  };

  const matchesResponsibleFilter = (branch) => {
    if (!filters.responsible) return true;
    const filterTg = String(filters.responsible);

    if (branch.responsible && String(branch.responsible) === filterTg) {
      return true;
    }

    const responsibleUser = findResponsibleUser(branch.responsible_id, branch.responsible);
    return responsibleUser ? String(responsibleUser.telegram_id) === filterTg : false;
  };

  const normalizeSearch = (value) => normalizeSearchText(value);

  const matchesSearch = (branch) => {
    if (!filters.search) return true;
    const query = normalizeSearch(filters.search);
    if (!query) return true;

    const responsibleUser = findResponsibleUser(branch.responsible_id, branch.responsible);
    const responsibleName = responsibleUser ? getUserFullName(responsibleUser) : branch.responsible || "";

    const haystack = [
      branch.name,
      branch.city,
      branch.primary_client,
      responsibleName,
      branch.director,
    ]
      .map(normalizeSearch)
      .join(" ");

    return haystack.includes(query);
  };

  const filteredBranches = branches.filter(branch => {
    return (
      (!filters.city || branch.city === filters.city) &&
      (!filters.primary_client || branch.primary_client === filters.primary_client) &&
      matchesResponsibleFilter(branch) &&
      matchesSearch(branch)
    );
  });

  // Функция для подсчета клиентов в филиале
  function getClientsCount(branchId) {
    return clients.filter(client => client.branch_id === branchId).length;
  }

  const sortedBranches = [...filteredBranches].sort((a, b) => {
    const sortMode = filters.sort || "newest_first";
    const aName = String(a?.name || "").toLowerCase();
    const bName = String(b?.name || "").toLowerCase();
    const aCreated = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b?.created_at ? new Date(b.created_at).getTime() : 0;
    const aClients = getClientsCount(a.id);
    const bClients = getClientsCount(b.id);

    if (sortMode === "name_asc") return aName.localeCompare(bName, "ru");
    if (sortMode === "name_desc") return bName.localeCompare(aName, "ru");
    if (sortMode === "oldest_first") return aCreated - bCreated;
    if (sortMode === "with_clients") {
      if (aClients > 0 && bClients === 0) return -1;
      if (aClients === 0 && bClients > 0) return 1;
      return bCreated - aCreated;
    }
    if (sortMode === "without_clients") {
      if (aClients === 0 && bClients > 0) return -1;
      if (aClients > 0 && bClients === 0) return 1;
      return bCreated - aCreated;
    }
    if (sortMode === "clients_count_desc") {
      if (bClients !== aClients) return bClients - aClients;
      return bCreated - aCreated;
    }
    if (sortMode === "clients_count_asc") {
      if (aClients !== bClients) return aClients - bClients;
      return bCreated - aCreated;
    }

    // newest_first + newest_first_alias
    return bCreated - aCreated;
  });
  const canDeleteBranches = getAccessScope().role !== "regional_manager";

  function renderAddForm() {
    // Получение текущего пользователя для автозаполнения primary_client
    const currentUserId = localStorage.getItem('currentUserId');
    const currentUser = users.find(u => String(u.id) === String(currentUserId));
    const currentUserPrimaryClient = currentUser?.primary_client || "";
    
    // Фильтрация пользователей по primary_client текущего пользователя
    const filteredUsers = users.filter(user => 
      !currentUserPrimaryClient || user.primary_client === currentUserPrimaryClient
    );
    
    return (
      <Card style={{ width: "100%", maxWidth: 800 }}>
        <h2>Новый филиал</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Название филиала *
              </label>
              <Input
                placeholder="Название филиала"
                value={newBranch.name}
                onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                style={{ width: "100%" }}
                required
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Клиент 1 порядка *
              </label>
              <select
                value={newBranch.primary_client || currentUserPrimaryClient}
                onChange={(e) => setNewBranch({ ...newBranch, primary_client: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
                required
              >
                <option value="">Выберите клиента 1 порядка</option>
                <option value="RS">RS</option>
                <option value="SB">SB</option>
                <option value="ETM">ETM</option>
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
                value={newBranch.city}
                onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Ответственный
              </label>
              <select
                value={newBranch.responsible}
                onChange={(e) => setNewBranch({ ...newBranch, responsible: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите ответственного</option>
                {filteredUsers
                  .filter((user) => user?.telegram_id !== null && user?.telegram_id !== undefined && String(user.telegram_id).trim() !== "")
                  .map((user) => (
                  <option key={String(user.id || user.telegram_id)} value={user.telegram_id}>
                    {getUserFullName(user)} ({user.role || "без роли"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Стратегический план
            </label>
            <Textarea
              placeholder="Стратегический план развития филиала"
              value={newBranch.strategy_plan}
              onChange={(e) => setNewBranch({ ...newBranch, strategy_plan: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                ДР Филиала
              </label>
              <Input
                type="date"
                value={newBranch.branch_birthday}
                onChange={(e) => setNewBranch({ ...newBranch, branch_birthday: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Дата посещения
              </label>
              <Input
                type="date"
                value={newBranch.visit_date}
                onChange={(e) => setNewBranch({ ...newBranch, visit_date: e.target.value })}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Торговый зал
              </label>
              <select
                value={newBranch.trading_hall}
                onChange={(e) => setNewBranch({ ...newBranch, trading_hall: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите...</option>
                {yesNoOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                Обучение
              </label>
              <select
                value={newBranch.training}
                onChange={(e) => setNewBranch({ ...newBranch, training: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  color: "#eaf1f4",
                }}
              >
                <option value="">Выберите...</option>
                {yesNoOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Директор
            </label>
            <Textarea
              placeholder="Директор (можно в несколько строк)"
              value={newBranch.director}
              onChange={(e) => setNewBranch({ ...newBranch, director: e.target.value })}
              style={{ width: "100%", minHeight: 80 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                НС РП
              </label>
              <Textarea
                placeholder="НС РП (можно в несколько строк)"
                value={newBranch.ns_rp}
                onChange={(e) => setNewBranch({ ...newBranch, ns_rp: e.target.value })}
                style={{ width: "100%", minHeight: 80 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                НС ОП
              </label>
              <Textarea
                placeholder="НС ОП (можно в несколько строк)"
                value={newBranch.ns_op}
                onChange={(e) => setNewBranch({ ...newBranch, ns_op: e.target.value })}
                style={{ width: "100%", minHeight: 80 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                НС КП
              </label>
              <Textarea
                placeholder="НС КП (можно в несколько строк)"
                value={newBranch.ns_kp}
                onChange={(e) => setNewBranch({ ...newBranch, ns_kp: e.target.value })}
                style={{ width: "100%", minHeight: 80 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                НС СМО
              </label>
              <Textarea
                placeholder="НС СМО (можно в несколько строк)"
                value={newBranch.ns_smo}
                onChange={(e) => setNewBranch({ ...newBranch, ns_smo: e.target.value })}
                style={{ width: "100%", minHeight: 80 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              МПП
            </label>
            <Textarea
              placeholder="МПП (можно в несколько строк)"
              value={newBranch.mpp}
              onChange={(e) => setNewBranch({ ...newBranch, mpp: e.target.value })}
              style={{ width: "100%", minHeight: 80 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                ТОП клиенты по SDS
              </label>
              <Textarea
                placeholder="ТОП клиенты по SDS"
                value={newBranch.top_clients_sds}
                onChange={(e) => setNewBranch({ ...newBranch, top_clients_sds: e.target.value })}
                style={{ width: "100%", minHeight: 60 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
                ТОП клиенты по филиалу
              </label>
              <Textarea
                placeholder="ТОП клиенты по филиалу"
                value={newBranch.top_clients_branch}
                onChange={(e) => setNewBranch({ ...newBranch, top_clients_branch: e.target.value })}
                style={{ width: "100%", minHeight: 60 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Мероприятия на горизонте
            </label>
            <Textarea
              placeholder="Мероприятия на горизонте"
              value={newBranch.upcoming_events}
              onChange={(e) => setNewBranch({ ...newBranch, upcoming_events: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Новинки
            </label>
            <Textarea
              placeholder="Новинки"
              value={newBranch.new_products}
              onChange={(e) => setNewBranch({ ...newBranch, new_products: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Каталоги/образцы
            </label>
            <Textarea
              placeholder="Каталоги/образцы"
              value={newBranch.catalogs_samples}
              onChange={(e) => setNewBranch({ ...newBranch, catalogs_samples: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Комментарии
            </label>
            <Textarea
              placeholder="Комментарии"
              value={newBranch.comments}
              onChange={(e) => setNewBranch({ ...newBranch, comments: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: "12px", color: "#9fb1bb" }}>
              Информация к задаче
            </label>
            <Textarea
              placeholder="Информация к задаче"
              value={newBranch.task_info}
              onChange={(e) => setNewBranch({ ...newBranch, task_info: e.target.value })}
              style={{ width: "100%" }}
            />
          </div>
        </div>
        
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <Btn onClick={addBranch}>Сохранить филиал</Btn>
          <Btn onClick={() => setIsAdding(false)} style={{ background: "linear-gradient(180deg,#121920,#0f151b)" }}>
            Отмена
          </Btn>
        </div>
      </Card>
    );
  }

  function renderBranchDetails(branch) {
    const isEditing = editingBranchId === branch.id;
    const clientsCount = getClientsCount(branch.id);
    const responsibleUser = findResponsibleUser(branch.responsible_id, branch.responsible);
    const rowStyle = { marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid #26231f" };
    const emptyValueStyle = { color: "#8b8372" };
    const renderValue = (value, emptyText = "Не указано") => {
      if (value === null || value === undefined) return <span style={emptyValueStyle}>{emptyText}</span>;
      if (typeof value === "string" && value.trim() === "") return <span style={emptyValueStyle}>{emptyText}</span>;
      return value;
    };
    const responsibleValue = responsibleUser ? getUserFullName(responsibleUser) : branch.responsible;

    return (
      <tr key={`${branch.id}-details`}>
        <td colSpan="6" style={{ padding: "16px", background: "#0f151b", borderBottom: "1px solid #2f3d49" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, color: "#e31b23" }}>Детальная информация</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <ActionButton onClick={() => {
                    setEditingBranchId(isEditing ? null : branch.id);
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
                      value={branch.responsible}
                      field="responsible"
                      isUserSelect={true}
                      users={users}
                      getUserFullName={getUserFullName}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Ответственный", "text", false, null, true)}
                    />

                    <div style={rowStyle}>
                      <strong>Клиентов в филиале:</strong> {clientsCount}
                    </div>

                    <EditableField
                      label="Название филиала"
                      value={branch.name}
                      field="name"
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Название филиала")}
                    />

                    <EditableField
                      label="Город"
                      value={branch.city}
                      field="city"
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Город")}
                    />

                    <EditableField
                      label="ДР филиала"
                      value={branch.branch_birthday}
                      field="branch_birthday"
                      type="date"
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "ДР филиала", "date")}
                    />

                    <EditableField
                      label="Дата посещения"
                      value={branch.visit_date}
                      field="visit_date"
                      type="date"
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Дата посещения", "date")}
                    />

                    <EditableField
                      label="Торговый зал"
                      value={branch.trading_hall}
                      field="trading_hall"
                      type="select"
                      options={yesNoOptions}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Торговый зал", "select", false, yesNoOptions)}
                    />

                    <EditableField
                      label="Обучение"
                      value={branch.training}
                      field="training"
                      type="select"
                      options={yesNoOptions}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Обучение", "select", false, yesNoOptions)}
                    />
                  </>
                ) : (
                  <>
                    <div style={rowStyle}>
                      <strong>Ответственный:</strong> {renderValue(responsibleValue)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Клиентов в филиале:</strong> {clientsCount}
                    </div>
                    <div style={rowStyle}>
                      <strong>Название:</strong> {renderValue(branch.name)}
                    </div>
                    <div style={rowStyle}>
                      <strong>Город:</strong> {renderValue(branch.city)}
                    </div>
                    <div style={rowStyle}>
                      <strong>ДР филиала:</strong> {renderValue(formatDate(branch.branch_birthday))}
                    </div>
                    <div style={rowStyle}>
                      <strong>Дата посещения:</strong> {renderValue(formatDate(branch.visit_date))}
                    </div>
                    <div style={rowStyle}>
                      <strong>Торговый зал:</strong> {renderValue(branch.trading_hall)}
                    </div>
                    <div>
                      <strong>Обучение:</strong> {renderValue(branch.training)}
                    </div>
                  </>
                )}
              </div>
              
              <h4 style={{ color: "#10b981", marginTop: 0, marginBottom: 16 }}>Контактная информация:</h4>
              <div style={{ 
                padding: 12, 
                background: "#182129", 
                borderRadius: 8,
                marginBottom: 16,
              }}>
                {isEditing ? (
                  <>
                    
                    
                    <EditableField
                      label="Директор"
                      value={branch.director}
                      field="director"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Директор", "text", true)}
                    />
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <EditableField
                      label="НС РП"
                      value={branch.ns_rp}
                      field="ns_rp"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "НС РП", "text", true)}
                    />
                      
                    <EditableField
                      label="НС ОП"
                      value={branch.ns_op}
                      field="ns_op"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "НС ОП", "text", true)}
                    />
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <EditableField
                      label="НС КП"
                      value={branch.ns_kp}
                      field="ns_kp"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "НС КП", "text", true)}
                    />
                      
                    <EditableField
                      label="НС СМО"
                      value={branch.ns_smo}
                      field="ns_smo"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "НС СМО", "text", true)}
                    />
                    </div>
                    
                    <EditableField
                      label="МПП"
                      value={branch.mpp}
                      field="mpp"
                      multiline={true}
                      onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "МПП", "text", true)}
                    />
                  </>
                ) : (
                  <>
                    <div style={rowStyle}>
                      <strong>Директор:</strong>
                      <div style={{ 
                        marginTop: 4,
                        padding: 8,
                        background: "#0f151b",
                        borderRadius: 4,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}>
                        {renderValue(branch.director)}
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <strong>НС РП:</strong>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(branch.ns_rp)}
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <strong>НС ОП:</strong>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(branch.ns_op)}
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <strong>НС КП:</strong>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(branch.ns_kp)}
                      </div>
                    </div>
                    <div style={rowStyle}>
                      <strong>НС СМО:</strong>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(branch.ns_smo)}
                      </div>
                    </div>
                    <div>
                      <strong>МПП:</strong>
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {renderValue(branch.mpp)}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
            </div>
            <div>
              <h4 style={{ color: "#8b5cf6", marginTop: 0, marginBottom: 16 }}>Стратегический план:</h4>
              {isEditing ? (
                <EditableField
                  label="Стратегический план"
                  value={branch.strategy_plan}
                  field="strategy_plan"
                  multiline={true}
                  onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Стратегический план", "text", true)}
                />
              ) : (
                <div style={{ 
                  padding: 12, 
                  background: "#182129", 
                  borderRadius: 8,
                  marginBottom: 16,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}>
                  <div style={{ 
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}>
                    {renderValue(branch.strategy_plan)}
                  </div>
                </div>
              )}

              <h4 style={{ color: "#06b6d4", marginBottom: 16 }}>ТОП клиенты:</h4>
              {isEditing ? (
                <>
                  <EditableField
                    label="ТОП клиенты по SDS"
                    value={branch.top_clients_sds}
                    field="top_clients_sds"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "ТОП клиенты по SDS", "text", true)}
                  />

                  <EditableField
                    label="ТОП клиенты по филиалу"
                    value={branch.top_clients_branch}
                    field="top_clients_branch"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "ТОП клиенты по филиалу", "text", true)}
                  />
                </>
              ) : (
                <div style={{ 
                  padding: 12, 
                  background: "#182129", 
                  borderRadius: 8,
                  marginBottom: 16,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>По SDS:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.top_clients_sds, "Не указаны")}
                    </div>
                  </div>
                  <div>
                    <strong>По филиалу:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.top_clients_branch, "Не указаны")}
                    </div>
                  </div>
                </div>
              )}

              
              <h4 style={{ color: "#ec4899", marginBottom: 16 }}>Дополнительная информация:</h4>
              {isEditing ? (
                <>
                  <EditableField
                    label="Мероприятия на горизонте"
                    value={branch.upcoming_events}
                    field="upcoming_events"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Мероприятия на горизонте", "text", true)}
                  />
                  
                  <EditableField
                    label="Новинки"
                    value={branch.new_products}
                    field="new_products"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Новинки", "text", true)}
                  />
                  
                  <EditableField
                    label="Каталоги/образцы"
                    value={branch.catalogs_samples}
                    field="catalogs_samples"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Каталоги/образцы", "text", true)}
                  />
                  
                  <EditableField
                    label="Комментарии"
                    value={branch.comments}
                    field="comments"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Комментарии", "text", true)}
                  />
                  
                  <EditableField
                    label="Информация к задаче"
                    value={branch.task_info}
                    field="task_info"
                    multiline={true}
                    onEdit={(field, value) => handleFieldEdit(branch.id, field, value, "Информация к задаче", "text", true)}
                  />
                </>
              ) : (
                <div style={{ 
                  padding: 12, 
                  background: "#182129", 
                  borderRadius: 8,
                  overflowY: "auto",
                  flex: 1,
                  minHeight: 220,
                }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Мероприятия:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.upcoming_events, "Не указаны")}
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Новинки:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.new_products, "Не указаны")}
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Каталоги/образцы:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.catalogs_samples, "Не указаны")}
                    </div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Комментарии:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.comments, "Не указаны")}
                    </div>
                  </div>
                  <div>
                    <strong>Информация к задаче:</strong>
                    <div style={{ 
                      marginTop: 4,
                      padding: 8,
                      background: "#0f151b",
                      borderRadius: 4,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {renderValue(branch.task_info)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <Wrap>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 1200 }}>
        <H1>Филиалы (всего: {sortedBranches.length})</H1>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn data-branches-export-btn onClick={exportToExcel} style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}>
            📥 Выгрузить в Excel
          </Btn>
          <Btn onClick={() => setIsAdding(true)}>+ Добавить филиал</Btn>
        </div>
      </div>
      
      <Filters 
        filters={filters} 
        onFilterChange={handleFilterChange} 
        cities={cities}
        primaryClients={primaryClients}
        users={users}
        getUserFullName={getUserFullName}
      />
      
      {isAdding && renderAddForm()}
      
      <Card style={{ width: "100%", maxWidth: 1200, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Название</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Клиент 1 порядка</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Город</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Ответственный</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left" }}>Клиентов</th>
              <th style={{ padding: 12, borderBottom: "1px solid #334756", textAlign: "left", minWidth: 180 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedBranches.map((b) => {
              const clientsCount = getClientsCount(b.id);
              const responsibleUser = findResponsibleUser(b.responsible_id, b.responsible);
              
              return (
                <Fragment key={b.id}>
                  <tr style={{ borderBottom: "1px solid #2f3d49", cursor: "pointer" }} onClick={() => toggleBranchDetails(b.id)}>
                    <td style={{ padding: 12 }}>{b.name}</td>
                    <td style={{ padding: 12 }}>{b.primary_client || "-"}</td>
                    <td style={{ padding: 12 }}>{b.city || "-"}</td>
                    <td style={{ padding: 12 }}>{responsibleUser ? getUserFullName(responsibleUser) : b.responsible || "-"}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: "12px",
                        fontWeight: "bold",
                        display: "inline-block",
                        whiteSpace: "nowrap",
                        minWidth: 40,
                        textAlign: "center",
                        background: clientsCount > 0 ? "#059669" : "#6b7280",
                        color: "white"
                      }}>
                        {clientsCount}
                      </span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <ActionButton onClick={(e) => {
                          e.stopPropagation();
                          setEditingBranchId(b.id);
                          setExpandedBranchId(b.id);
                        }}>
                          ✏️ Редакт.
                        </ActionButton>
                        {canDeleteBranches && (
                          <ActionButton onClick={(e) => {
                            e.stopPropagation();
                            deleteBranch(b.id);
                          }} style={{ background: "linear-gradient(180deg,#ef4444,#dc2626)" }}>
                            🗑️ Удалить
                          </ActionButton>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBranchDetails(b.id);
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
                          {expandedBranchId === b.id ? "▲" : "▼"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedBranchId === b.id && renderBranchDetails(b)}
                </Fragment>
              );
            })}
            {!sortedBranches.length && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9fb1bb" }}>
                  Филиалы не найдены. {filters.city || filters.primary_client ? "Попробуйте изменить фильтры." : "Добавьте первый филиал."}
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
          onSave={handleModalSave}
          onClose={handleModalClose}
        />
      )}
    </Wrap>
  );
}







