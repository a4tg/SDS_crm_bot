// src/Tasks.jsx
// Страница управления задачами. Позволяет просматривать и создавать задачи CRM.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// Количество записей на странице
const PAGE_SIZE = 20;

export default function Tasks() {
  // Состояние авторизации
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  // Профили пользователей: текущий и список всех
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);

  // Данные задач
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Поля фильтрации
  const [qTitle, setQTitle] = useState("");
  const [qClient, setQClient] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Состояние формы создания задачи
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    client: "",
    due_date: "",
    description: "",
    assignee_telegram_id: "",
  });
  const [formMsg, setFormMsg] = useState("");

  // Редактирование существующей задачи
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    client: "",
    due_date: "",
    description: "",
    assignee_telegram_id: "",
    status: "",
  });
  const [editMsg, setEditMsg] = useState("");

  // Подписываемся на изменения авторизации
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // Отправляем магическую ссылку для входа
  async function sendMagicLink(e) {
    e.preventDefault();
    setAuthMsg("Отправляем ссылку/код на почту…");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/tasks" },
    });
    setAuthMsg(error ? "Ошибка: " + error.message : "Проверьте почту.");
  }

  // Выход из аккаунта
  async function signOut() {
    await supabase.auth.signOut();
  }

  // Загрузка профиля и списка всех профилей
  useEffect(() => {
    if (!user) return;
    // Текущий профиль
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error) setProfile(data);
      });
    // Все профили (для выбора исполнителя и фильтрации по ролям)
    supabase
      .from("profiles")
      .select("id, full_name, role, telegram_id")
      .then(({ data }) => setProfiles(data || []));
  }, [user]);

  // Диапазон записей для пагинации
  const range = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return { from, to };
  }, [page]);

  // При изменении фильтров перезагружаем список задач
  // Если профиль не загружен, всё равно пробуем загрузить задачи (без фильтра по ролям).
  useEffect(() => {
    if (!user) return;
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, page, qTitle, qClient, dateFrom, dateTo]);

  // Загрузка задач с учётом фильтров и ролей
  async function fetchTasks() {
    // Считаем количество записей
    let head = supabase
      .from("tasks")
      .select("*", { count: "exact", head: true });
    head = applyFilters(head);
    head = applyRoleFilter(head);
    const headRes = await head;
    if (!headRes.error) {
      setTotal(headRes.count || 0);
    }
    // Получаем сами записи
    let query = supabase
      .from("tasks")
      .select(
        "id, title, client, due_date, status, assigner_telegram_id, assignee_telegram_id, description",
        { count: "exact" }
      )
      .order("due_date", { ascending: true })
      .range(range.from, range.to);
    query = applyFilters(query);
    query = applyRoleFilter(query);
    const { data, error } = await query;
    if (!error) {
      setRows(data || []);
    }
  }

  // Применяет фильтры поиска к запросу
  function applyFilters(qb) {
    if (qTitle) qb = qb.ilike("title", `%${qTitle}%`);
    if (qClient) qb = qb.ilike("client", `%${qClient}%`);
    if (dateFrom) qb = qb.gte("due_date", dateFrom);
    if (dateTo) qb = qb.lte("due_date", dateTo + " 23:59:59");
    return qb;
  }

  // Ограничивает видимость задач в зависимости от роли пользователя
  function applyRoleFilter(qb) {
    if (!profile) return qb;
    const myTg = profile.telegram_id;
    // Роль руководителя проекта – видит все задачи
    if (profile.role === "project_head") {
      return qb;
    }
    // Определяем роли подчинённых
    const subRoles = [];
    if (profile.role === "team_leader") {
      subRoles.push("region_manager", "junior_manager");
    } else if (profile.role === "region_manager") {
      subRoles.push("junior_manager");
    }
    const subIds = profiles
      .filter((p) => subRoles.includes(p.role))
      .map((p) => p.telegram_id)
      .filter(Boolean);
    // Составляем условия OR: свои задачи + задачи подчинённых
    const filters = [];
    if (myTg) {
      filters.push(`assigner_telegram_id.eq.${myTg}`);
      filters.push(`assignee_telegram_id.eq.${myTg}`);
    }
    if (subIds.length) {
      filters.push(`assignee_telegram_id.in.(${subIds.join(",")})`);
    }
    if (filters.length) {
      qb = qb.or(filters.join(","));
    }
    return qb;
  }

  // Обработчик создания новой задачи
  async function handleAddTask(e) {
    e.preventDefault();
    setFormMsg("");
    if (!profile) return;
    if (!taskForm.title || !taskForm.due_date) {
      setFormMsg("Название и срок обязательны.");
      return;
    }
    const assigneeTg = taskForm.assignee_telegram_id
      ? Number(taskForm.assignee_telegram_id)
      : null;
    const { error } = await supabase.from("tasks").insert({
      title: taskForm.title,
      client: taskForm.client || null,
      due_date: taskForm.due_date,
      description: taskForm.description || null,
      status: "Выполняется",
      assigner_telegram_id: profile.telegram_id,
      assignee_telegram_id: assigneeTg,
      comments: null,
    });
    if (error) {
      console.error(error);
      setFormMsg("Ошибка: " + error.message);
      return;
    }
    setFormMsg("Задача добавлена!");
    setTaskForm({ title: "", client: "", due_date: "", description: "", assignee_telegram_id: "" });
    setNewTaskOpen(false);
    fetchTasks();
  }

  // Открыть форму редактирования выбранной задачи
  function openEditModal(task) {
    setEditMsg("");
    setEditTask(task);
    setEditForm({
      title: task.title || "",
      client: task.client || "",
      due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0,16) : "",
      description: task.description || "",
      assignee_telegram_id: task.assignee_telegram_id || "",
      status: task.status || "Выполняется",
    });
  }

  // Сохранить изменения задачи
  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editTask) return;
    // Проверяем обязательные поля
    if (!editForm.title || !editForm.due_date) {
      setEditMsg("Название и срок обязательны.");
      return;
    }
    const assigneeTg = editForm.assignee_telegram_id ? Number(editForm.assignee_telegram_id) : null;
    const updates = {
      title: editForm.title,
      client: editForm.client || null,
      due_date: editForm.due_date,
      description: editForm.description || null,
      assignee_telegram_id: assigneeTg,
      status: editForm.status,
    };
    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", editTask.id);
    if (error) {
      console.error(error);
      setEditMsg("Ошибка: " + error.message);
      return;
    }
    setEditMsg("Задача обновлена!");
    setEditTask(null);
    fetchTasks();
  }

  // Отмена редактирования
  function cancelEdit() {
    setEditTask(null);
    setEditMsg("");
  }

  // Если пользователь не авторизован – показываем форму входа
  if (!user) {
    return (
      <Wrap>
        <Card>
          <H1>Вход в CRM (Задачи)</H1>
          <P>Введите корпоративную почту — пришлём ссылку/код для входа.</P>
          <form onSubmit={sendMagicLink} style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <Input
              type="email"
              required
              placeholder="you@company.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Btn>Получить ссылку для входа</Btn>
            <Note>{authMsg}</Note>
          </form>
        </Card>
      </Wrap>
    );
  }

  // Основной интерфейс управления задачами
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <Wrap>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 1200 }}>
        <H1>Задачи (всего: {total})</H1>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => setNewTaskOpen(true)}>+ Новая задача</Btn>
          <BtnGhost onClick={signOut}>Выйти</BtnGhost>
        </div>
      </div>

      {/* Фильтры */}
      <Card style={{ width: "100%", maxWidth: 1200 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
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
        </div>
      </Card>

      {/* Таблица задач */}
      <Card style={{ width: "100%", maxWidth: 1200 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Дедлайн</Th>
              <Th>Название</Th>
              <Th>Клиент</Th>
              <Th>Статус</Th>
              <Th>Постановщик</Th>
              <Th>Исполнитель</Th>
              <Th>Действия</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const assigner = profiles.find((p) => p.telegram_id === r.assigner_telegram_id);
              const assignee = profiles.find((p) => p.telegram_id === r.assignee_telegram_id);
              return (
                <tr key={r.id}>
                  <Td>{new Date(r.due_date).toLocaleString()}</Td>
                  <Td>{safe(r.title)}</Td>
                  <Td>{safe(r.client)}</Td>
                  <Td>{safe(r.status)}</Td>
                  <Td>{assigner ? assigner.full_name || assigner.role : r.assigner_telegram_id}</Td>
                  <Td>{assignee ? assignee.full_name || assignee.role : r.assignee_telegram_id || "-"}</Td>
                  <Td>
                    <button
                      onClick={() => openEditModal(r)}
                      style={{
                        appearance: "none",
                        cursor: "pointer",
                        padding: "4px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        background: "#2a2824",
                        border: "1px solid #8b6b2a",
                        color: "#f2e9d0",
                      }}
                    >
                      ✏️ Изменить
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <Td colSpan={6}>Записей нет.</Td>
              </tr>
            )}
          </tbody>
        </table>
        {/* Пагинация */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
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

      {/* Форма новой задачи */}
      {newTaskOpen && (
        <Card style={{ width: "100%", maxWidth: 600 }}>
          <H1>Новая задача</H1>
          <form onSubmit={handleAddTask} style={{ display: "grid", gap: 12 }}>
            <Input
              type="text"
              placeholder="Название задачи"
              value={taskForm.title}
              onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              type="text"
              placeholder="Клиент"
              value={taskForm.client}
              onChange={(e) => setTaskForm((f) => ({ ...f, client: e.target.value }))}
            />
            <Input
              type="datetime-local"
              placeholder="Дедлайн"
              value={taskForm.due_date}
              onChange={(e) => setTaskForm((f) => ({ ...f, due_date: e.target.value }))}
              required
            />
            <textarea
              placeholder="Описание"
              value={taskForm.description}
              onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              style={{ padding: "10px", borderRadius: 8, background: "#0f0d0b", border: "1px solid #3a332a", color: "#f2e9d0", minHeight: 80 }}
            />
            <select
              value={taskForm.assignee_telegram_id}
              onChange={(e) => setTaskForm((f) => ({ ...f, assignee_telegram_id: e.target.value }))}
              style={{ padding: "10px", borderRadius: 8, background: "#0f0d0b", border: "1px solid #3a332a", color: "#f2e9d0" }}
            >
              <option value="">-- Исполнитель (необязательно) --</option>
              {profiles
                .filter((p) => p.telegram_id && profile && p.telegram_id !== profile.telegram_id)
                .map((p) => (
                  <option key={p.id} value={p.telegram_id}>
                    {p.full_name || p.role} ({p.telegram_id})
                  </option>
                ))}
            </select>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn type="submit">Создать</Btn>
              <BtnGhost
                type="button"
                onClick={() => {
                  setNewTaskOpen(false);
                  setTaskForm({ title: "", client: "", due_date: "", description: "", assignee_telegram_id: "" });
                  setFormMsg("");
                }}
              >
                Отмена
              </BtnGhost>
            </div>
            <Note>{formMsg}</Note>
          </form>
        </Card>
      )}

      {/* Форма редактирования задачи */}
      {editTask && (
        <Card style={{ width: "100%", maxWidth: 600 }}>
          <H1>Редактировать задачу</H1>
          <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: 12 }}>
            <Input
              type="text"
              placeholder="Название задачи"
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              type="text"
              placeholder="Клиент"
              value={editForm.client}
              onChange={(e) => setEditForm((f) => ({ ...f, client: e.target.value }))}
            />
            <Input
              type="datetime-local"
              value={editForm.due_date}
              onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
              required
            />
            <textarea
              placeholder="Описание"
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              style={{ padding: "10px", borderRadius: 8, background: "#0f0d0b", border: "1px solid #3a332a", color: "#f2e9d0", minHeight: 80 }}
            />
            <select
              value={editForm.assignee_telegram_id}
              onChange={(e) => setEditForm((f) => ({ ...f, assignee_telegram_id: e.target.value }))}
              style={{ padding: "10px", borderRadius: 8, background: "#0f0d0b", border: "1px solid #3a332a", color: "#f2e9d0" }}
            >
              <option value="">-- Исполнитель (без изменений) --</option>
              {profiles
                .filter((p) => p.telegram_id && profile && p.telegram_id !== profile.telegram_id)
                .map((p) => (
                  <option key={p.id} value={p.telegram_id}>
                    {p.full_name || p.role} ({p.telegram_id})
                  </option>
                ))}
            </select>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              style={{ padding: "10px", borderRadius: 8, background: "#0f0d0b", border: "1px solid #3a332a", color: "#f2e9d0" }}
            >
              <option value="Выполняется">Выполняется</option>
              <option value="Просрочена">Просрочена</option>
              <option value="Результат на согласовании">Результат на согласовании</option>
              <option value="Завершено">Завершено</option>
            </select>
            <div style={{ display: "flex", gap: 12 }}>
              <Btn type="submit">Сохранить</Btn>
              <BtnGhost type="button" onClick={cancelEdit}>Отмена</BtnGhost>
            </div>
            <Note>{editMsg}</Note>
          </form>
        </Card>
      )}
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
        gap: 12,
        padding: 16,
        background: "#0b0a08",
        color: "#f2e9d0",
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
        background: "#171512",
        border: "1px solid #2a2824",
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
function P({ children }) {
  return <p style={{ margin: "8px 0", opacity: 0.8 }}>{children}</p>;
}
function Note({ children }) {
  return <div style={{ fontSize: 12, color: "#c8b890" }}>{children}</div>;
}
function Input(props) {
  return (
    <input
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#0f0d0b",
        border: "1px solid #3a332a",
        color: "#f2e9d0",
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
        background: "linear-gradient(180deg,#e31b23,#b7151b)",
        color: "#fff",
        boxShadow: "0 8px 22px rgba(227,27,35,.28), inset 0 0 0 1px rgba(255,255,255,.2)",
        opacity: rest.disabled ? 0.6 : 1,
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
        padding: "10px 14px",
        borderRadius: 10,
        fontWeight: 700,
        background: "linear-gradient(180deg,#1c1916,#14120f)",
        border: "1px solid #8b6b2a",
        color: "#f2e9d0",
        opacity: rest.disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
function Th({ children }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: 10,
        position: "sticky",
        top: 0,
        background: "#191714",
        borderBottom: "1px solid #2a2824",
      }}
    >
      {children}
    </th>
  );
}
function Td({ children, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      style={{ padding: 10, borderTop: "1px solid #2a2824" }}
    >
      {children}
    </td>
  );
}
function safe(v) {
  return v ?? "";
}