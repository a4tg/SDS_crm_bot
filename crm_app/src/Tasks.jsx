// src/Tasks.jsx
// Страница управления задачами. Позволяет просматривать и создавать задачи CRM.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// Количество записей на странице
const PAGE_SIZE = 20;

export default function Tasks() {
  // Список профилей (используется для отображения ФИО постановщика и исполнителя)
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

  // Диапазон записей для пагинации
  const range = useMemo(() => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return { from, to };
  }, [page]);

  // Загрузка списка профилей (независимо от авторизации)
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, role, telegram_id")
      .then(({ data }) => setProfiles(data || []));
  }, []);

  // Загрузка задач при изменении фильтров или пагинации
  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, qTitle, qClient, dateFrom, dateTo]);

  // Загрузка задач (без авторизации, список всех)
  async function fetchTasks() {
    // Считаем количество
    let head = supabase
      .from("tasks")
      .select("*", { count: "exact", head: true });
    head = applyFilters(head);
    const headRes = await head;
    if (!headRes.error) {
      setTotal(headRes.count || 0);
    }
    // Получаем записи
    let query = supabase
      .from("tasks")
      .select(
        "id, title, client, due_date, status, assigner_telegram_id, assignee_telegram_id, description",
        { count: "exact" }
      )
      .order("due_date", { ascending: true })
      .range(range.from, range.to);
    query = applyFilters(query);
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

  // Для упрощения интерфейса авторизация отключена. Список задач доступен сразу.

  // Основной интерфейс управления задачами
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <Wrap>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 1200 }}>
        <H1>Задачи (всего: {total})</H1>
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

      {/* Форма создания и редактирования задач удалены для упрощённого режима */}
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