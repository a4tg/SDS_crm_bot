import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { normalizeSearchText, normalizedIncludes } from "./searchUtils";

const MONTHS = [
  { key: 1, code: "jan", label: "Янв" },
  { key: 2, code: "feb", label: "Фев" },
  { key: 3, code: "mar", label: "Мар" },
  { key: 4, code: "apr", label: "Апр" },
  { key: 5, code: "may", label: "Май" },
  { key: 6, code: "jun", label: "Июн" },
  { key: 7, code: "jul", label: "Июл" },
  { key: 8, code: "aug", label: "Авг" },
  { key: 9, code: "sep", label: "Сен" },
  { key: 10, code: "oct", label: "Окт" },
  { key: 11, code: "nov", label: "Ноя" },
  { key: 12, code: "dec", label: "Дек" },
];

const TEMPLATE_VERSION = "1.0";
const ALL_MONTH_KEYS = MONTHS.map((m) => m.key);
const IMPORT_UPSERT_BATCH_SIZE = 180;
const FACTS_BRANCH_BATCH_SIZE = 80;
const FACTS_BRANCH_MIN_BATCH_SIZE = 10;
const QUARTERS = [
  { label: "Q1", months: [1, 2, 3] },
  { label: "Q2", months: [4, 5, 6] },
  { label: "Q3", months: [7, 8, 9] },
  { label: "Q4", months: [10, 11, 12] },
];

const REGION_BRANCHES = {
  "Московский регион": [
    "Зеленоград", "Клин", "Коломна", "Москва-1", "Москва-2", "Москва-3", "Москва-4", "Одинцово",
    "Орехово-Зуево", "Подольск", "Раменское", "Сергиев-Посад", "Серпухов", "Щелково",
  ],
  "Поволжский регион": [
    "Ижевск", "Казань", "Киров", "Набережные Челны", "Оренбург", "Пенза", "Самара", "Самара-2",
    "Саранск", "Саратов", "Стерлитамак", "Тольятти", "Ульяновск", "Уфа-1", "Чебоксары",
  ],
  "Северо-Западный регион": [
    "Архангельск", "Великий Новгород", "Калининград", "Мурманск", "Петрозаводск", "Псков",
    "Санкт-Петербург-1", "Санкт-Петербург-2", "Санкт-Петербург-3", "Санкт-Петербург-4", "Санкт-Петербург-5", "Тихвин",
  ],
  "Сибирский регион": [
    "Барнаул", "Владивосток", "Иркутск", "Кемерово", "Красноярск-1", "Красноярск-2",
    "Новокузнецк", "Новосибирск-1", "Новосибирск-2", "Омск", "Томск", "Хабаровск",
  ],
  "Уральский регион": [
    "Екатеринбург-1", "Екатеринбург-2", "Каменск-Уральский", "Курган", "Магнитогорск", "Миасс",
    "Нижний Тагил", "Пермь", "Сургут", "Тюмень", "Челябинск-1", "Челябинск-2",
  ],
  "Центрально-Черноземный регион": [
    "Белгород", "Брянск", "Воронеж", "Воронеж-2", "Калуга", "Курск", "Липецк",
    "Обнинск", "Орел", "Рязань", "Старый Оскол", "Тамбов", "Тульский филиал",
  ],
  "Центральный регион": [
    "Владимир", "Вологда", "Иваново", "Кострома", "Нижний Новгород", "Смоленск", "Тверь", "Череповец", "Ярославль",
  ],
  "Южный регион": [
    "Армавир", "Астрахань", "Батайск", "Волгоград", "Волгоград-2", "Волжский", "Краснодар", "Краснодар-2",
    "Новороссийск", "Пятигорск", "Ростов", "Ростов-2", "Симферополь", "Сочи", "Сочи-2", "Ставрополь", "Таганрог", "Шахты",
  ],
};

function normalizeBranchKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ");
}

const BRANCH_REGION_INDEX = Object.entries(REGION_BRANCHES).reduce((acc, [region, names]) => {
  (names || []).forEach((name) => {
    acc[normalizeBranchKey(name)] = region;
  });
  return acc;
}, {});

function resolveBranchRegion(branch) {
  const byName = BRANCH_REGION_INDEX[normalizeBranchKey(branch?.name)];
  if (byName) return byName;
  return String(branch?.area_name || branch?.city || "Без области").trim() || "Без области";
}

const inputLikeStyle = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "#0f151b",
  border: "1px solid #334756",
  color: "#eaf1f4",
};

function Wrap({ children }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "grid",
        justifyItems: "stretch",
        alignContent: "start",
        gap: 12,
        padding: "12px clamp(8px, 2vw, 24px)",
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

function Btn({ children, ...rest }) {
  const userStyle = rest.style || {};
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
        ...userStyle,
      }}
    >
      {children}
    </button>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        ...inputLikeStyle,
        ...(props.style || {}),
      }}
    />
  );
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeComment(value) {
  const text = String(value || "").trim();
  return text || null;
}

function isSameFactValue(existingFact, incomingFact) {
  const existingValue = Number(existingFact?.sellout_value || 0);
  const incomingValue = Number(incomingFact?.sellout_value || 0);
  const valueEqual = Math.abs(existingValue - incomingValue) < 0.000001;
  const commentEqual = normalizeComment(existingFact?.comment) === normalizeComment(incomingFact?.comment);
  return valueEqual && commentEqual;
}

function normalizeImportRowKeys(row) {
  return Object.entries(row || {}).reduce((acc, [key, value]) => {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (!normalizedKey) return acc;
    acc[normalizedKey] = value;
    return acc;
  }, {});
}

function uniqueNonEmptyStrings(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((v) => String(v || "").trim())
        .filter(Boolean),
    ),
  );
}

function isStatementTimeoutError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("statement timeout") || message.includes("canceling statement due to statement timeout");
}

function formatAmount(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

function formatYoy(yoy) {
  const delta = Number(yoy?.delta || 0);
  const previous = Number(yoy?.previous || 0);
  const percent = yoy?.percent;
  const percentText = percent == null
    ? (previous === 0 && delta === 0 ? "0.0%" : "—")
    : `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
  const deltaText = `${delta > 0 ? "+" : ""}${formatAmount(delta)}`;
  return `${percentText} / ${deltaText}`;
}

function factCellKey(branchId, year, month) {
  return `${branchId}:${year}:${month}`;
}

function formatCoverage(cov) {
  const pct = Number(cov?.coverage_pct || 0);
  const withTasks = Number(cov?.clients_with_tasks || 0);
  const total = Number(cov?.total_clients || 0);
  return `${pct.toFixed(1)}% (${withTasks}/${total})`;
}

function getCoverageColor(cov) {
  const pct = Number(cov?.coverage_pct || 0);
  if (pct <= 0) return "#38bdf8"; // голубой
  if (pct < 50) return "#ef4444"; // красный
  return "#22c55e"; // зеленый
}

function buildTemplateRow(branch, year) {
  return {
    template_version: TEMPLATE_VERSION,
    year,
    primary_client: branch?.primary_client || "",
    area_name: resolveBranchRegion(branch),
    branch_id: branch?.id || "",
    branch_name: branch?.name || "",
    jan: "",
    feb: "",
    mar: "",
    apr: "",
    may: "",
    jun: "",
    jul: "",
    aug: "",
    sep: "",
    oct: "",
    nov: "",
    dec: "",
    comment: "",
  };
}

function roleToScope(roleRaw) {
  const role = String(roleRaw || "").trim().toLowerCase();
  if (role === "admin" || role === "rkp") return "global";
  if (role === "jkam") return "jkam";
  return "primary_client";
}

function normalizeRole(roleRaw, isAdmin = false) {
  if (isAdmin) return "admin";
  const role = String(roleRaw || "").trim().toLowerCase();
  if (role === "regional" || role === "regional manager") return "regional_manager";
  return role;
}

export default function SellOut() {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [facts, setFacts] = useState([]);
  const [yearFrom, setYearFrom] = useState(new Date().getFullYear() - 1);
  const [yearTo, setYearTo] = useState(new Date().getFullYear());
  const [yearFromDraft, setYearFromDraft] = useState(String(new Date().getFullYear() - 1));
  const [yearToDraft, setYearToDraft] = useState(String(new Date().getFullYear()));
  const [templateYear, setTemplateYear] = useState(new Date().getFullYear());
  const [groupLevel, setGroupLevel] = useState(4); // 4-month, 3-quarter, 2-halfyear, 1-year
  const [selectedMonthKeys, setSelectedMonthKeys] = useState(ALL_MONTH_KEYS);
  const [search, setSearch] = useState("");
  const [compareSearch, setCompareSearch] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState([]);
  const [primaryClientFilter, setPrimaryClientFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [nonZeroOnly, setNonZeroOnly] = useState(false);
  const [minTotal, setMinTotal] = useState("");
  const [expandedAreas, setExpandedAreas] = useState({});
  const [message, setMessage] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [visibleAreaCount, setVisibleAreaCount] = useState(30);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingCellKey, setEditingCellKey] = useState("");
  const [editingCellValue, setEditingCellValue] = useState("");
  const [savingCellKey, setSavingCellKey] = useState("");
  const [branchCoverageMap, setBranchCoverageMap] = useState({});
  const [coveragePanel, setCoveragePanel] = useState({
    open: false,
    scope: "region",
    title: "",
    branchIds: [],
    loading: false,
    step: "clients", // clients | client | tasks
    clients: [],
    selectedClient: null,
    tasks: [],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef(null);
  const defaultsAppliedRef = useRef(false);

  const currentRole = useMemo(() => {
    return String(localStorage.getItem("currentUserRole") || "").trim().toLowerCase();
  }, []);

  const normalizedYearBounds = useMemo(() => {
    const from = Number(yearFrom);
    const to = Number(yearTo);
    const fallback = new Date().getFullYear();
    const safeFrom = Number.isInteger(from) ? from : fallback;
    const safeTo = Number.isInteger(to) ? to : fallback;
    return safeFrom <= safeTo ? { from: safeFrom, to: safeTo } : { from: safeTo, to: safeFrom };
  }, [yearFrom, yearTo]);

  useEffect(() => {
    setYearFromDraft(String(yearFrom));
    setYearToDraft(String(yearTo));
  }, [yearFrom, yearTo]);

  const yearList = useMemo(() => {
    const years = [];
    for (let y = normalizedYearBounds.from; y <= normalizedYearBounds.to; y += 1) {
      years.push(y);
    }
    return years;
  }, [normalizedYearBounds]);

  function applyYearRange() {
    const from = Number(String(yearFromDraft || "").trim());
    const to = Number(String(yearToDraft || "").trim());
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      setMessage("Годы должны быть целыми числами.");
      return;
    }
    if (from < 2000 || from > 2100 || to < 2000 || to > 2100) {
      setMessage("Диапазон лет допустим только от 2000 до 2100.");
      return;
    }
    setMessage("");
    setYearFrom(from);
    setYearTo(to);
  }

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      const currentUserId = localStorage.getItem("currentUserId") || "";
      const [branchesRes, profileRes, coverageRes] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name, primary_client, city, area_name, responsible, responsible_id")
          .order("name", { ascending: true }),
        supabase
          .from("users")
          .select("id, role, is_admin, primary_client, telegram_id")
          .eq("id", currentUserId)
          .maybeSingle(),
        supabase.rpc("crm_branch_task_coverage"),
      ]);

      if (branchesRes.error) throw new Error(`branches: ${branchesRes.error.message}`);
      if (profileRes.error) throw new Error(`users: ${profileRes.error.message}`);

      const branchesData = branchesRes.data || [];
      const profileData = profileRes.data || null;
      setBranches(branchesData);
      setCurrentUserProfile(profileData);
      if (!coverageRes?.error) {
        const map = {};
        (coverageRes.data || []).forEach((row) => {
          map[String(row.branch_id)] = {
            total_clients: Number(row.total_clients || 0),
            clients_with_tasks: Number(row.clients_with_tasks || 0),
            coverage_pct: Number(row.coverage_pct || 0),
          };
        });
        setBranchCoverageMap(map);
      }

      const profileRole = normalizeRole(profileData?.role || currentRole, profileData?.is_admin);
      const currentPrimaryClient =
        String(profileData?.primary_client || "").trim() ||
        String(localStorage.getItem("currentUserPrimaryClient") || "").trim();

      let scopedForLoad = branchesData;
      if (profileRole === "jkam") {
        const currentUserIdForScope = String(profileData?.id || "");
        const currentTelegramForScope = String(profileData?.telegram_id || "");
        scopedForLoad = branchesData.filter((branch) => {
          const byResponsibleId = currentUserIdForScope && String(branch?.responsible_id || "") === currentUserIdForScope;
          const byResponsibleTelegram = currentTelegramForScope && String(branch?.responsible || "") === currentTelegramForScope;
          return byResponsibleId || byResponsibleTelegram;
        });
      } else if (profileRole === "kam" || profileRole === "regional_manager") {
        scopedForLoad = branchesData.filter(
          (branch) => String(branch?.primary_client || "").trim() === currentPrimaryClient,
        );
      }

      const scopedBranchIds = uniqueNonEmptyStrings(scopedForLoad.map((b) => b?.id));
      const yearsForLoad = [];
      for (let y = normalizedYearBounds.from; y <= normalizedYearBounds.to; y += 1) yearsForLoad.push(y);

      const loadedFacts = [];
      for (const year of yearsForLoad) {
        let offset = 0;
        let batchSize = FACTS_BRANCH_BATCH_SIZE;
        while (offset < scopedBranchIds.length) {
          const branchBatch = scopedBranchIds.slice(offset, offset + batchSize);
          setMessage(
            `Загрузка данных SELL-OUT: год ${year}, филиалы ${offset + 1}-${Math.min(offset + branchBatch.length, scopedBranchIds.length)} из ${scopedBranchIds.length}...`,
          );
          const factsRes = await supabase
            .from("sellout_facts")
            .select("branch_id, year, month, sellout_value")
            .eq("year", year)
            .in("month", ALL_MONTH_KEYS)
            .in("branch_id", branchBatch);
          if (!factsRes.error) {
            loadedFacts.push(...(factsRes.data || []));
            offset += branchBatch.length;
            if (batchSize < FACTS_BRANCH_BATCH_SIZE) {
              batchSize = Math.min(FACTS_BRANCH_BATCH_SIZE, batchSize * 2);
            }
            continue;
          }
          if (isStatementTimeoutError(factsRes.error) && batchSize > FACTS_BRANCH_MIN_BATCH_SIZE) {
            batchSize = Math.max(FACTS_BRANCH_MIN_BATCH_SIZE, Math.floor(batchSize / 2));
            continue;
          }
          throw new Error(`sellout_facts: ${factsRes.error.message}`);
        }
      }

      setFacts(loadedFacts);
      setMessage("");
    } catch (err) {
      console.error("SellOut loadData failed:", err);
      setMessage(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [normalizedYearBounds.from, normalizedYearBounds.to]);

  const factsMap = useMemo(() => {
    const map = new Map();
    (facts || []).forEach((f) => {
      const key = `${f.branch_id}:${f.year}:${f.month}`;
      map.set(key, Number(f.sellout_value || 0));
    });
    return map;
  }, [facts]);

  const columns = useMemo(() => {
    const buildForLevel = (year) => {
      if (groupLevel === 1) {
        return [{ key: `${year}:year`, year, label: "Год", months: MONTHS.map((m) => m.key) }];
      }
      if (groupLevel === 2) {
        return [
          { key: `${year}:h1`, year, label: "H1", months: [1, 2, 3, 4, 5, 6] },
          { key: `${year}:h2`, year, label: "H2", months: [7, 8, 9, 10, 11, 12] },
        ];
      }
      if (groupLevel === 3) {
        return [
          { key: `${year}:q1`, year, label: "Q1", months: [1, 2, 3] },
          { key: `${year}:q2`, year, label: "Q2", months: [4, 5, 6] },
          { key: `${year}:q3`, year, label: "Q3", months: [7, 8, 9] },
          { key: `${year}:q4`, year, label: "Q4", months: [10, 11, 12] },
        ];
      }
      return MONTHS
        .filter((m) => selectedMonthKeys.includes(m.key))
        .map((m) => ({ key: `${year}:${m.code}`, year, label: m.label, months: [m.key] }));
    };

    return yearList.flatMap((year) => buildForLevel(year));
  }, [groupLevel, selectedMonthKeys, yearList]);

  const yearHeaderGroups = useMemo(() => {
    return yearList
      .map((year) => ({
        year,
        count: columns.filter((col) => col.year === year).length,
      }))
      .filter((x) => x.count > 0);
  }, [columns, yearList]);

  const columnsByYear = useMemo(() => {
    const map = {};
    yearHeaderGroups.forEach((g) => {
      map[g.year] = columns.filter((c) => c.year === g.year);
    });
    return map;
  }, [columns, yearHeaderGroups]);

  const tableMinWidth = useMemo(() => {
    const firstCol = 220;
    const groupedDataCols = columns.length + yearHeaderGroups.length; // months/quarters + yearly totals
    const rightMetricCols = 2; // coverage + yoy
    return firstCol + groupedDataCols * 112 + rightMetricCols * 170;
  }, [columns.length, yearHeaderGroups.length]);

  const allMonthsSelected = useMemo(() => {
    return ALL_MONTH_KEYS.every((m) => selectedMonthKeys.includes(m));
  }, [selectedMonthKeys]);

  const yoyConfig = useMemo(() => {
    if (!yearList.length) return { currentYear: null, previousYear: null, months: ALL_MONTH_KEYS };
    const currentYear = yearList[yearList.length - 1];
    const previousYear = currentYear - 1;
    const monthsFromColumns = Array.from(
      new Set(
        columns
          .filter((col) => col.year === currentYear)
          .flatMap((col) => col.months || []),
      ),
    );
    return {
      currentYear,
      previousYear,
      months: monthsFromColumns.length ? monthsFromColumns : selectedMonthKeys,
    };
  }, [columns, selectedMonthKeys, yearList]);

  const effectiveRole = useMemo(() => {
    return normalizeRole(currentUserProfile?.role || currentRole, currentUserProfile?.is_admin);
  }, [currentRole, currentUserProfile]);

  const uploadScope = useMemo(() => {
    const profileRole = normalizeRole(currentUserProfile?.role || currentRole, currentUserProfile?.is_admin);
    return roleToScope(profileRole);
  }, [currentRole, currentUserProfile]);

  const scopedBranches = useMemo(() => {
    const list = branches || [];
    const currentPrimaryClient =
      String(currentUserProfile?.primary_client || "").trim() ||
      String(localStorage.getItem("currentUserPrimaryClient") || "").trim();

    if (effectiveRole === "jkam") {
      const currentUserId = String(currentUserProfile?.id || "");
      const currentTelegram = String(currentUserProfile?.telegram_id || "");
      return list.filter((branch) => {
        const byResponsibleId = currentUserId && String(branch?.responsible_id || "") === currentUserId;
        const byResponsibleTelegram = currentTelegram && String(branch?.responsible || "") === currentTelegram;
        return byResponsibleId || byResponsibleTelegram;
      });
    }

    if (effectiveRole === "kam" || effectiveRole === "regional_manager") {
      return list.filter((branch) => String(branch?.primary_client || "").trim() === currentPrimaryClient);
    }

    return list;
  }, [branches, currentUserProfile, effectiveRole]);

  const primaryClientOptions = useMemo(() => {
    const values = Array.from(new Set((scopedBranches || []).map((b) => String(b.primary_client || "").trim()).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b, "ru"));
  }, [scopedBranches]);

  const areaOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        (scopedBranches || [])
          .map((b) => String(resolveBranchRegion(b)).trim())
          .filter(Boolean),
      ),
    );
    return values.sort((a, b) => a.localeCompare(b, "ru"));
  }, [scopedBranches]);

  const branchOptions = useMemo(() => {
    const values = Array.from(new Set((scopedBranches || []).map((b) => String(b.name || "").trim()).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b, "ru"));
  }, [scopedBranches]);

  const compareBranchOptions = useMemo(() => {
    const query = normalizeSearchText(compareSearch);
    return (scopedBranches || [])
      .filter((b) => {
        const name = String(b?.name || "");
        const area = String(resolveBranchRegion(b));
        if (!query) return true;
        return normalizedIncludes(name, query) || normalizedIncludes(area, query);
      })
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "ru"));
  }, [compareSearch, scopedBranches]);

  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);

  const groupedRows = useMemo(() => {
    const query = normalizeSearchText(search);
    const minTotalNumber = minTotal === "" ? null : Number(minTotal);
    const areas = new Map();

    (scopedBranches || []).forEach((branch) => {
      if (selectedBranchIdSet.size > 0 && !selectedBranchIdSet.has(String(branch.id))) return;
      const area = String(resolveBranchRegion(branch)).trim() || "Без области";
      const branchName = String(branch.name || "").trim();
      const branchPrimaryClient = String(branch.primary_client || "").trim();
      const matchesSearch = !query || normalizedIncludes(branchName, query) || normalizedIncludes(area, query);
      if (!matchesSearch) return;
      if (primaryClientFilter && branchPrimaryClient !== primaryClientFilter) return;
      if (areaFilter && area !== areaFilter) return;
      if (branchFilter && branchName !== branchFilter) return;

      const values = {};
      columns.forEach((col) => {
        values[col.key] = col.months.reduce((sum, month) => {
          return sum + Number(factsMap.get(`${branch.id}:${col.year}:${month}`) || 0);
        }, 0);
      });
      values.total = columns.reduce((sum, c) => sum + Number(values[c.key] || 0), 0);
      if (nonZeroOnly && Number(values.total || 0) <= 0) return;
      if (minTotalNumber != null && Number.isFinite(minTotalNumber) && Number(values.total || 0) < minTotalNumber) return;

      const currentValue = (yoyConfig.months || []).reduce((sum, month) => {
        return sum + Number(factsMap.get(`${branch.id}:${yoyConfig.currentYear}:${month}`) || 0);
      }, 0);
      const previousValue = (yoyConfig.months || []).reduce((sum, month) => {
        return sum + Number(factsMap.get(`${branch.id}:${yoyConfig.previousYear}:${month}`) || 0);
      }, 0);
      const yoyDelta = Number(currentValue || 0) - Number(previousValue || 0);
      const yoyPercent = Number(previousValue || 0) === 0
        ? null
        : (yoyDelta / Number(previousValue || 0)) * 100;
      const branchCoverage = branchCoverageMap[String(branch.id)] || {
        total_clients: 0,
        clients_with_tasks: 0,
        coverage_pct: 0,
      };

      if (!areas.has(area)) {
        areas.set(area, {
          area,
          branches: [],
          totals: {},
          yoy: { current: 0, previous: 0, delta: 0, percent: null },
          coverage: { total_clients: 0, clients_with_tasks: 0, coverage_pct: 0 },
        });
      }

      const areaNode = areas.get(area);
      areaNode.branches.push({
        id: branch.id,
        name: branchName || "Без названия",
        primary_client: branchPrimaryClient,
        values,
        yoy: {
          current: currentValue,
          previous: previousValue,
          delta: yoyDelta,
          percent: yoyPercent,
        },
        coverage: branchCoverage,
      });

      columns.forEach((col) => {
        areaNode.totals[col.key] = Number(areaNode.totals[col.key] || 0) + Number(values[col.key] || 0);
      });
      areaNode.totals.total = Number(areaNode.totals.total || 0) + Number(values.total || 0);
      areaNode.yoy.current = Number(areaNode.yoy.current || 0) + Number(currentValue || 0);
      areaNode.yoy.previous = Number(areaNode.yoy.previous || 0) + Number(previousValue || 0);
      areaNode.yoy.delta = Number(areaNode.yoy.current || 0) - Number(areaNode.yoy.previous || 0);
      areaNode.yoy.percent = Number(areaNode.yoy.previous || 0) === 0
        ? null
        : (Number(areaNode.yoy.delta || 0) / Number(areaNode.yoy.previous || 0)) * 100;
      areaNode.coverage.total_clients = Number(areaNode.coverage.total_clients || 0) + Number(branchCoverage.total_clients || 0);
      areaNode.coverage.clients_with_tasks = Number(areaNode.coverage.clients_with_tasks || 0) + Number(branchCoverage.clients_with_tasks || 0);
      areaNode.coverage.coverage_pct = Number(areaNode.coverage.total_clients || 0) === 0
        ? 0
        : (Number(areaNode.coverage.clients_with_tasks || 0) / Number(areaNode.coverage.total_clients || 0)) * 100;
    });

    return Array.from(areas.values())
      .map((areaNode) => ({
        ...areaNode,
        branches: areaNode.branches.sort((a, b) => a.name.localeCompare(b.name, "ru")),
      }))
      .sort((a, b) => a.area.localeCompare(b.area, "ru"));
  }, [areaFilter, branchCoverageMap, branchFilter, columns, factsMap, minTotal, nonZeroOnly, primaryClientFilter, scopedBranches, search, selectedBranchIdSet, yoyConfig]);

  useEffect(() => {
    const allowed = new Set((scopedBranches || []).map((b) => String(b.id)));
    setSelectedBranchIds((prev) => prev.filter((id) => allowed.has(String(id))));
  }, [scopedBranches]);

  useEffect(() => {
    setVisibleAreaCount(30);
  }, [search, yearFrom, yearTo, groupLevel, primaryClientFilter, areaFilter, branchFilter, nonZeroOnly, minTotal]);

  const visibleGroupedRows = useMemo(() => {
    return groupedRows.slice(0, visibleAreaCount);
  }, [groupedRows, visibleAreaCount]);

  const hasMoreAreas = visibleAreaCount < groupedRows.length;
  const areAllAreasCollapsed = useMemo(() => {
    if (!groupedRows.length) return false;
    return groupedRows.every((a) => (expandedAreas[a.area] ?? true) === false);
  }, [expandedAreas, groupedRows]);

  function toggleAllAreas() {
    if (!groupedRows.length) return;
    const nextExpanded = {};
    groupedRows.forEach((a) => {
      nextExpanded[a.area] = areAllAreasCollapsed;
    });
    setExpandedAreas(nextExpanded);
  }

  function calcYearSubtotal(values, year) {
    return (columnsByYear[year] || []).reduce((sum, c) => sum + Number(values?.[c.key] || 0), 0);
  }

  useEffect(() => {
    if (defaultsAppliedRef.current) return;
    if (!currentUserProfile) return;
    const role = normalizeRole(currentUserProfile.role, currentUserProfile.is_admin);
    const primaryClient = String(currentUserProfile.primary_client || "").trim();
    if (["kam", "jkam", "regional_manager"].includes(role) && primaryClient) {
      setPrimaryClientFilter(primaryClient);
    }
    defaultsAppliedRef.current = true;
  }, [currentUserProfile]);

  function canImportBranch(branch) {
    if (!branch) return false;
    if (uploadScope === "global") return true;
    if (uploadScope === "jkam") {
      const currentUserId = String(currentUserProfile?.id || "");
      const currentTelegram = String(currentUserProfile?.telegram_id || "");
      return (
        (currentUserId && String(branch.responsible_id || "") === currentUserId) ||
        (currentTelegram && String(branch.responsible || "") === currentTelegram)
      );
    }
    const currentPrimaryClient =
      String(currentUserProfile?.primary_client || "").trim() ||
      String(localStorage.getItem("currentUserPrimaryClient") || "").trim();
    return !!currentPrimaryClient && String(branch.primary_client || "").trim() === currentPrimaryClient;
  }

  function beginEditCell(branchId, year, month, currentValue) {
    const key = factCellKey(branchId, year, month);
    setEditingCellKey(key);
    setEditingCellValue(String(Number(currentValue || 0)));
  }

  function cancelEditCell() {
    setEditingCellKey("");
    setEditingCellValue("");
  }

  async function saveEditedCell(branchId, year, month) {
    const key = factCellKey(branchId, year, month);
    if (savingCellKey === key) return;
    const parsed = parseNumber(editingCellValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setMessage("Для редактирования допустимы только числа >= 0.");
      return;
    }

    setSavingCellKey(key);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("sellout_facts")
        .upsert(
          [{ branch_id: branchId, year, month, sellout_value: parsed }],
          { onConflict: "branch_id,year,month" },
        )
        .select("id, branch_id, year, month, sellout_value, comment, primary_client, area_name")
        .single();

      if (error) {
        throw error;
      }

      setFacts((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const idx = list.findIndex((f) => String(f.branch_id) === String(branchId) && Number(f.year) === Number(year) && Number(f.month) === Number(month));
        if (idx >= 0) {
          list[idx] = { ...list[idx], sellout_value: parsed, ...(data || {}) };
        } else {
          list.push({
            id: data?.id || null,
            branch_id: branchId,
            year,
            month,
            sellout_value: parsed,
            comment: data?.comment || null,
            primary_client: data?.primary_client || null,
            area_name: data?.area_name || null,
          });
        }
        return list;
      });

      cancelEditCell();
    } catch (err) {
      console.error("SellOut saveEditedCell failed:", err);
      setMessage(`Ошибка сохранения ячейки: ${err.message || "неизвестно"}`);
    } finally {
      setSavingCellKey("");
    }
  }

  function closeCoveragePanel() {
    setCoveragePanel({
      open: false,
      scope: "region",
      title: "",
      branchIds: [],
      loading: false,
      step: "clients",
      clients: [],
      selectedClient: null,
      tasks: [],
    });
  }

  async function openCoveragePanel(scope, title, branchIds) {
    const ids = Array.from(new Set((branchIds || []).map((id) => String(id))));
    if (!ids.length) return;
    setCoveragePanel((prev) => ({
      ...prev,
      open: true,
      scope,
      title,
      branchIds: ids,
      loading: true,
      step: "clients",
      clients: [],
      selectedClient: null,
      tasks: [],
    }));

    try {
      const { data, error } = await supabase.rpc("crm_clients_task_summary", {
        p_branch_ids: ids,
      });
      if (error) throw error;
      setCoveragePanel((prev) => ({
        ...prev,
        loading: false,
        clients: (data || []).map((c) => ({
          client_id: c.client_id,
          branch_id: c.branch_id,
          client_name: c.client_name,
          tasks_count: Number(c.tasks_count || 0),
        })),
      }));
    } catch (err) {
      console.error("openCoveragePanel failed:", err);
      setCoveragePanel((prev) => ({ ...prev, loading: false, clients: [] }));
      setMessage(`Ошибка загрузки покрытия: ${err.message || "неизвестно"}`);
    }
  }

  async function openClientInCoverage(clientId) {
    if (!clientId) return;
    setCoveragePanel((prev) => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, city, primary_client, status, status_text, manager_contact, sales_channel, info, development_plan, client_work, visit_date, branch_id")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      setCoveragePanel((prev) => ({
        ...prev,
        loading: false,
        step: "client",
        selectedClient: data || null,
      }));
    } catch (err) {
      console.error("openClientInCoverage failed:", err);
      setCoveragePanel((prev) => ({ ...prev, loading: false }));
      setMessage(`Ошибка загрузки клиента: ${err.message || "неизвестно"}`);
    }
  }

  async function openClientTasksInCoverage(clientId) {
    if (!clientId) return;
    setCoveragePanel((prev) => ({ ...prev, loading: true }));
    try {
      const { data, error } = await supabase.rpc("crm_client_tasks_brief", { p_client_id: clientId });
      if (error) throw error;
      setCoveragePanel((prev) => ({
        ...prev,
        loading: false,
        step: "tasks",
        tasks: data || [],
      }));
    } catch (err) {
      console.error("openClientTasksInCoverage failed:", err);
      setCoveragePanel((prev) => ({ ...prev, loading: false }));
      setMessage(`Ошибка загрузки задач клиента: ${err.message || "неизвестно"}`);
    }
  }

  function toggleArea(area) {
    setExpandedAreas((prev) => ({ ...prev, [area]: !prev[area] }));
  }

  function openUploadDialog() {
    fileInputRef.current?.click();
  }

  async function downloadTemplate() {
    const rows = (scopedBranches || []).map((branch) => buildTemplateRow(branch, templateYear));
    const wb = XLSX.utils.book_new();
    const wsData = XLSX.utils.json_to_sheet(rows);
    wsData["!cols"] = [
      { wch: 16 }, { wch: 8 }, { wch: 20 }, { wch: 18 }, { wch: 38 }, { wch: 26 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsData, "SELL_OUT_DATA");

    const wsReadme = XLSX.utils.aoa_to_sheet([
      ["Инструкция"],
      ["Заполняйте только лист SELL_OUT_DATA."],
      ["Не меняйте названия колонок."],
      ["Одна строка = один филиал за выбранный год."],
      ["Поля jan..dec: только числа >= 0; пусто = 0."],
      [`template_version должен быть ${TEMPLATE_VERSION}.`],
    ]);
    XLSX.utils.book_append_sheet(wb, wsReadme, "README");

    XLSX.writeFile(wb, `SELL_OUT_TEMPLATE_${templateYear}.xlsx`);
  }

  async function exportCurrentData() {
    const rows = (scopedBranches || []).map((branch) => {
      const payload = buildTemplateRow(branch, templateYear);
      MONTHS.forEach((m) => {
        payload[m.code] = Number(factsMap.get(`${branch.id}:${templateYear}:${m.key}`) || 0);
      });
      return payload;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "SELL_OUT_DATA");
    XLSX.writeFile(wb, `SELL_OUT_${templateYear}.xlsx`);
  }

  function buildImportError(rowNo, field, error, value) {
    return { row: rowNo, field, error, value: value == null ? "" : String(value) };
  }

  async function handleUploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setMessage("");
    setImportReport(null);

    let uploadRecordId = null;
    try {
      const uploadInsert = await supabase
        .from("sellout_uploads")
        .insert({
          original_file_name: file.name,
          template_version: TEMPLATE_VERSION,
          year: templateYear,
          status: "uploaded",
          rows_total: 0,
          rows_success: 0,
          rows_failed: 0,
        })
        .select("id")
        .single();
      if (!uploadInsert.error) {
        uploadRecordId = uploadInsert.data?.id || null;
      }

      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets["SELL_OUT_DATA"] || wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Лист SELL_OUT_DATA не найден.");

      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) throw new Error("Файл пустой.");

      const branchesById = new Map((scopedBranches || []).map((b) => [String(b.id), b]));
      const upserts = [];
      const errors = [];
      const seenRows = new Set();
      let parsedYear = templateYear;

      rows.forEach((row, index) => {
        const normalizedRow = normalizeImportRowKeys(row);
        const rowNo = index + 2;
        const branchId = String(normalizedRow.branch_id || "").trim();
        const yearValue = Number(normalizedRow.year || templateYear);
        const rowTemplateVersion = String(normalizedRow.template_version || "").trim();

        if (rowTemplateVersion && rowTemplateVersion !== TEMPLATE_VERSION) {
          errors.push(buildImportError(rowNo, "template_version", `Ожидается ${TEMPLATE_VERSION}`, rowTemplateVersion));
          return;
        }

        const branch = branchesById.get(branchId);
        if (!branchId || !branch) {
          errors.push(buildImportError(rowNo, "branch_id", "Неизвестный или пустой branch_id", branchId));
          return;
        }

        if (!canImportBranch(branch)) {
          errors.push(buildImportError(rowNo, "branch_id", "Недостаточно прав для загрузки по этому филиалу", branchId));
          return;
        }

        if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100) {
          errors.push(buildImportError(rowNo, "year", "Некорректный year", normalizedRow.year));
          return;
        }
        parsedYear = yearValue;

        const uniqueRowKey = `${branchId}:${yearValue}`;
        if (seenRows.has(uniqueRowKey)) {
          errors.push(buildImportError(rowNo, "branch_id", "Дублирующая строка филиала за год в файле", branchId));
          return;
        }
        seenRows.add(uniqueRowKey);

        let rowHasMonthErrors = false;
        MONTHS.forEach((month) => {
          const parsed = parseNumber(normalizedRow[month.code]);
          if (!Number.isFinite(parsed) || parsed < 0) {
            rowHasMonthErrors = true;
            errors.push(buildImportError(rowNo, month.code, "Некорректное число (должно быть >= 0)", normalizedRow[month.code]));
          }
        });
        if (rowHasMonthErrors) return;

        MONTHS.forEach((month) => {
          upserts.push({
            branch_id: branchId,
            year: yearValue,
            month: month.key,
            sellout_value: parseNumber(normalizedRow[month.code]),
            comment: String(normalizedRow.comment || "").trim() || null,
            upload_id: uploadRecordId,
          });
        });
      });

      if (errors.length) {
        const report = {
          fileName: file.name,
          rowsTotal: rows.length,
          rowsSuccess: 0,
          rowsFailed: errors.length,
          errors,
        };
        setImportReport(report);

        if (uploadRecordId) {
          await supabase
            .from("sellout_uploads")
            .update({
              status: "failed",
              year: parsedYear,
              rows_total: rows.length,
              rows_success: 0,
              rows_failed: errors.length,
              error_report: errors,
            })
            .eq("id", uploadRecordId);
        }
        throw new Error(`Файл не загружен. Ошибок: ${errors.length}`);
      }

      const branchIdsForImport = Array.from(new Set(upserts.map((u) => String(u.branch_id))));
      const yearsForImport = Array.from(new Set(upserts.map((u) => Number(u.year)))).filter((y) => Number.isInteger(y));
      const minYearForImport = yearsForImport.length ? Math.min(...yearsForImport) : templateYear;
      const maxYearForImport = yearsForImport.length ? Math.max(...yearsForImport) : templateYear;
      const monthKeysForImport = MONTHS.map((m) => m.key);

      let existingFactsMap = new Map();
      if (branchIdsForImport.length) {
        const existingFactsRes = await supabase
          .from("sellout_facts")
          .select("branch_id, year, month, sellout_value, comment")
          .in("branch_id", branchIdsForImport)
          .gte("year", minYearForImport)
          .lte("year", maxYearForImport)
          .in("month", monthKeysForImport);
        if (existingFactsRes.error) {
          throw new Error(`Ошибка чтения текущих данных перед импортом: ${existingFactsRes.error.message}`);
        }
        existingFactsMap = new Map(
          (existingFactsRes.data || []).map((f) => [factCellKey(f.branch_id, f.year, f.month), f]),
        );
      }

      let insertedFacts = 0;
      let updatedFacts = 0;
      let unchangedFacts = 0;
      const upsertsToApply = upserts.filter((incomingFact) => {
        const key = factCellKey(incomingFact.branch_id, incomingFact.year, incomingFact.month);
        const existingFact = existingFactsMap.get(key);
        if (!existingFact) {
          insertedFacts += 1;
          return true;
        }
        if (isSameFactValue(existingFact, incomingFact)) {
          unchangedFacts += 1;
          return false;
        }
        updatedFacts += 1;
        return true;
      });

      let processedFacts = 0;
      let currentBatchSize = IMPORT_UPSERT_BATCH_SIZE;
      while (processedFacts < upsertsToApply.length) {
        const batch = upsertsToApply.slice(processedFacts, processedFacts + currentBatchSize);
        setMessage(
          `Загрузка в БД: ${Math.min(processedFacts + batch.length, upsertsToApply.length)} из ${upsertsToApply.length} измененных значений...`,
        );
        const { error: upsertError } = await supabase
          .from("sellout_facts")
          .upsert(batch, { onConflict: "branch_id,year,month" });
        if (!upsertError) {
          processedFacts += batch.length;
          if (currentBatchSize < IMPORT_UPSERT_BATCH_SIZE) {
            currentBatchSize = Math.min(IMPORT_UPSERT_BATCH_SIZE, currentBatchSize * 2);
          }
          continue;
        }
        if (isStatementTimeoutError(upsertError) && currentBatchSize > 25) {
          currentBatchSize = Math.max(25, Math.floor(currentBatchSize / 2));
          continue;
        }
        const report = {
          fileName: file.name,
          rowsTotal: rows.length,
          rowsSuccess: 0,
          rowsFailed: 1,
          errors: [
            buildImportError(
              "-",
              "database",
              `Ошибка сохранения в БД: ${upsertError.message} (батч ${processedFacts + 1}-${processedFacts + batch.length}, размер=${currentBatchSize})`,
              "",
            ),
          ],
        };
        setImportReport(report);
        throw new Error(`Ошибка сохранения в БД: ${upsertError.message}`);
      }

      let persistedFactsCount = processedFacts;
      if (uploadRecordId && upsertsToApply.length > 0) {
        const verifyPersist = await supabase
          .from("sellout_facts")
          .select("id", { head: true, count: "exact" })
          .eq("upload_id", uploadRecordId);
        if (verifyPersist.error) {
          throw new Error(`Данные записаны, но не удалось подтвердить сохранение: ${verifyPersist.error.message}`);
        }
        persistedFactsCount = Number(verifyPersist.count || 0);
        if (persistedFactsCount <= 0) {
          throw new Error("Импорт завершился без ошибок, но данные не найдены в таблице sellout_facts.");
        }
      }

      const rowsSuccess = rows.length;
      const successReport = {
        fileName: file.name,
        rowsTotal: rows.length,
        rowsSuccess,
        rowsFailed: 0,
        errors: [],
      };
      setImportReport(successReport);

      if (uploadRecordId) {
        await supabase
          .from("sellout_uploads")
          .update({
            status: "applied",
            year: parsedYear,
            rows_total: rows.length,
            rows_success: rowsSuccess,
            rows_failed: 0,
            applied_at: new Date().toISOString(),
          })
          .eq("id", uploadRecordId);
      }

      setYearFrom((prev) => Math.min(Number(prev) || parsedYear, parsedYear));
      setYearTo((prev) => Math.max(Number(prev) || parsedYear, parsedYear));
      setTemplateYear(parsedYear);
      setPrimaryClientFilter("");
      setAreaFilter("");
      setBranchFilter("");
      setNonZeroOnly(false);
      setMinTotal("");
      setSelectedMonthKeys(ALL_MONTH_KEYS);
      await loadData();
      setMessage(
        `Файл загружен успешно. Строк: ${rows.length}. Добавлено: ${insertedFacts}, обновлено: ${updatedFacts}, без изменений: ${unchangedFacts}, записано: ${persistedFactsCount}.`,
      );
        } catch (err) {
      console.error("SellOut upload failed:", err);
      if (uploadRecordId) {
        await supabase
          .from("sellout_uploads")
          .update({
            status: "failed",
            rows_failed: 1,
            error_report: [{ row: "-", field: "database", error: String(err?.message || "upload_failed"), value: "" }],
          })
          .eq("id", uploadRecordId);
      }
      setMessage(err.message || "Ошибка загрузки файла.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Wrap>
      <Card style={{ width: "100%" }}>
        <h1 style={{ marginTop: 0, marginBottom: 6 }}>SELL-OUT</h1>
        <p style={{ marginTop: 0, color: "#9fb1bb" }}>
          Таблица по филиалам с агрегированием по месяцам, кварталам, полугодиям и году.
        </p>

        {settingsOpen ? (
          <div
            onClick={() => setSettingsOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              background: "rgba(0,0,0,.45)",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              paddingTop: 12,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1500px, 98vw)",
                maxHeight: "92vh",
                overflow: "auto",
                background: "#182129",
                border: "1px solid #2f3d49",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong>Настройки SELL-OUT</strong>
                <button
                  onClick={() => setSettingsOpen(false)}
                  style={{ background: "transparent", border: "1px solid #334756", color: "#eaf1f4", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                >
                  Закрыть
                </button>
              </div>
              <div
                style={{
                  background: "#182129",
                  border: "1px solid #2f3d49",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 10,
                }}
              >
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", marginBottom: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Год от</span>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={yearFromDraft}
                onChange={(e) => setYearFromDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyYearRange();
                  }
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Год до</span>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={yearToDraft}
                onChange={(e) => setYearToDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyYearRange();
                  }
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Год шаблона/экспорта</span>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={templateYear}
                onChange={(e) => setTemplateYear(Number(e.target.value || new Date().getFullYear()))}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Поиск</span>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Например: Москва" />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Клиент 1 порядка</span>
              <select
                value={primaryClientFilter}
                onChange={(e) => setPrimaryClientFilter(e.target.value)}
                style={{ ...inputLikeStyle, height: 42 }}
              >
                <option value="">Все</option>
                {primaryClientOptions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Область / Филиал</span>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  style={{ ...inputLikeStyle, height: 42 }}
                >
                  <option value="">Все области</option>
                  {areaOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  style={{ ...inputLikeStyle, height: 42 }}
                >
                  <option value="">Все филиалы</option>
                  {branchOptions.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Мин. итог по строке</span>
              <Input
                type="number"
                min={0}
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
                placeholder="Например: 10000"
              />
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", minHeight: 42 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={nonZeroOnly} onChange={(e) => setNonZeroOnly(e.target.checked)} />
                <span>Только строки с данными (&gt; 0)</span>
              </label>
              <Btn onClick={applyYearRange} style={{ background: "linear-gradient(180deg,#334155,#1f2937)", padding: "8px 10px" }}>
                Применить
              </Btn>
              <button
                onClick={() => {
                  setSearch("");
                  setPrimaryClientFilter("");
                  setAreaFilter("");
                  setBranchFilter("");
                  setNonZeroOnly(false);
                  setMinTotal("");
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #334756",
                  color: "#c8d7de",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Сброс
              </button>
            </div>
          </div>
        </div>

        <details style={{ marginBottom: 12 }}>
          <summary style={{ cursor: "pointer", color: "#9fb1bb", fontWeight: 700, marginBottom: 8 }}>
            Сравнение филиалов {selectedBranchIds.length ? `(${selectedBranchIds.length})` : ""}
          </summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <Input
              value={compareSearch}
              onChange={(e) => setCompareSearch(e.target.value)}
              placeholder="Поиск филиала для сравнения"
            />
            <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #334756", borderRadius: 8, padding: 8 }}>
              {compareBranchOptions.length === 0 ? (
                <div style={{ color: "#9fb1bb", padding: 6 }}>Ничего не найдено</div>
              ) : (
                compareBranchOptions.map((b) => {
                  const id = String(b.id);
                  const checked = selectedBranchIdSet.has(id);
                  return (
                    <label
                      key={id}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", borderBottom: "1px solid #22303b" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedBranchIds((prev) => {
                            if (e.target.checked) return [...prev, id];
                            return prev.filter((x) => x !== id);
                          });
                        }}
                      />
                      <span>{b.name}</span>
                      <span style={{ color: "#9fb1bb" }}>· {resolveBranchRegion(b)}</span>
                    </label>
                  );
                })
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => setSelectedBranchIds(compareBranchOptions.map((b) => String(b.id)))}
                style={{
                  background: "transparent",
                  border: "1px solid #334756",
                  color: "#c8d7de",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Выбрать из списка
              </button>
              <button
                onClick={() => setSelectedBranchIds([])}
                style={{
                  background: "transparent",
                  border: "1px solid #334756",
                  color: "#c8d7de",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Очистить выбор
              </button>
            </div>
          </div>
        </details>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ color: "#9fb1bb" }}>Группировка:</span>
          {[
            { level: 1, label: "Годы" },
            { level: 2, label: "Полугодия" },
            { level: 3, label: "Кварталы" },
            { level: 4, label: "Месяцы" },
          ].map((item) => (
            <Btn
              key={item.level}
              onClick={() => setGroupLevel(item.level)}
              style={{
                padding: "7px 10px",
                borderRadius: 8,
                background: groupLevel === item.level
                  ? "linear-gradient(180deg,#2563eb,#1d4ed8)"
                  : "linear-gradient(180deg,#334155,#1f2937)",
              }}
            >
              {item.label}
            </Btn>
          ))}
          {groupLevel === 4 ? (
            <details>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  border: "1px solid #334756",
                  color: "#c8d7de",
                  borderRadius: 8,
                  padding: "7px 10px",
                  fontWeight: 700,
                  background: "#111922",
                }}
              >
                Месяцы
              </summary>
              <div
                style={{
                  position: "absolute",
                  zIndex: 20,
                  marginTop: 6,
                  background: "#0f151b",
                  border: "1px solid #334756",
                  borderRadius: 8,
                  padding: 8,
                  minWidth: 220,
                  boxShadow: "0 8px 20px rgba(0,0,0,.35)",
                }}
              >
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <button
                    onClick={() => setSelectedMonthKeys(allMonthsSelected ? [] : ALL_MONTH_KEYS)}
                    style={{ background: "transparent", border: "1px solid #334756", color: "#c8d7de", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                  >
                    {allMonthsSelected ? "Убрать выделение" : "Выделить все"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {QUARTERS.map((q) => {
                    const active = q.months.every((m) => selectedMonthKeys.includes(m));
                    return (
                      <button
                        key={q.label}
                        onClick={() => {
                          setSelectedMonthKeys((prev) => {
                            if (active) {
                              return prev.filter((m) => !q.months.includes(m));
                            }
                            return Array.from(new Set([...prev, ...q.months])).sort((a, b) => a - b);
                          });
                        }}
                        style={{
                          background: active ? "#1d4ed8" : "transparent",
                          border: "1px solid #334756",
                          color: "#c8d7de",
                          borderRadius: 6,
                          padding: "4px 8px",
                          cursor: "pointer",
                        }}
                      >
                        {q.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {MONTHS.map((m) => {
                    const checked = selectedMonthKeys.includes(m.key);
                    return (
                      <label key={m.key} style={{ display: "flex", gap: 6, alignItems: "center", color: "#c8d7de" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedMonthKeys((prev) => {
                              if (e.target.checked) return Array.from(new Set([...prev, m.key])).sort((a, b) => a - b);
                              return prev.filter((x) => x !== m.key);
                            });
                          }}
                        />
                        <span>{m.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </details>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Btn onClick={openUploadDialog} disabled={uploading}>
            {uploading ? "Загрузка..." : "Загрузить шаблон"}
          </Btn>
          <Btn onClick={downloadTemplate} style={{ background: "linear-gradient(180deg,#334155,#1f2937)" }}>
            Скачать шаблон
          </Btn>
          <Btn onClick={exportCurrentData} style={{ background: "linear-gradient(180deg,#10b981,#059669)" }}>
            Выгрузить Excel
          </Btn>
          <Btn onClick={loadData} disabled={loading} style={{ background: "linear-gradient(180deg,#334155,#1f2937)" }}>
            {loading ? "Обновление..." : "Обновить"}
          </Btn>
          <Btn
            onClick={() => {
              if (groupLevel !== 4 || yearList.length !== 1) {
                setMessage("Режим редактирования доступен только для уровня 'Месяцы' и одного выбранного года.");
                return;
              }
              setEditMode((v) => !v);
              cancelEditCell();
            }}
            style={{
              background: editMode ? "linear-gradient(180deg,#dc2626,#991b1b)" : "linear-gradient(180deg,#2563eb,#1d4ed8)",
            }}
          >
            {editMode ? "Выйти из редактирования" : "Режим редактирования"}
          </Btn>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUploadFile}
            style={{ display: "none" }}
          />
        </div>

        {/*
          Keep frequently-used controls compact: years/search/actions always visible.
          Main filters are fixed in a sticky 2-row toolbar.
        */}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ color: "#9fb1bb" }}>
            Роль для импорта: <strong>{uploadScope === "global" ? "global" : uploadScope}</strong>
          </div>
          <div style={{ color: "#9fb1bb" }}>
            Областей найдено: {groupedRows.length}
          </div>
          <div style={{ color: "#9fb1bb" }}>
            Режим сравнения: {selectedBranchIds.length ? `выбрано филиалов ${selectedBranchIds.length}` : "выключен"}
          </div>
          <div style={{ color: "#9fb1bb" }}>
            Диапазон лет: {normalizedYearBounds.from}-{normalizedYearBounds.to}
          </div>
          <div style={{ color: "#9fb1bb" }}>
            АППГ: {yoyConfig.currentYear || "—"} к {yoyConfig.previousYear || "—"}
          </div>
        </div>

        {message ? <div style={{ marginBottom: 10, color: "#9fd3ff" }}>{message}</div> : null}

        {importReport ? (
          <Card style={{ marginBottom: 12, background: "#121920", borderColor: "#334756" }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Отчет по последнему импорту</h3>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 8, color: "#c8d7de" }}>
              <span>Файл: {importReport.fileName}</span>
              <span>Строк: {importReport.rowsTotal}</span>
              <span>Успешно: {importReport.rowsSuccess}</span>
              <span>Ошибок: {importReport.rowsFailed}</span>
            </div>
            {importReport.errors?.length ? (
              <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #2f3d49", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "#0f151b" }}>
                      <th style={{ textAlign: "left", padding: 8 }}>Строка</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Поле</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Ошибка</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Значение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importReport.errors.map((err, idx) => (
                      <tr key={`${err.row}-${err.field}-${idx}`} style={{ borderTop: "1px solid #22303b" }}>
                        <td style={{ padding: 8 }}>{err.row}</td>
                        <td style={{ padding: 8 }}>{err.field}</td>
                        <td style={{ padding: 8 }}>{err.error}</td>
                        <td style={{ padding: 8, color: "#9fb1bb" }}>{err.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "#9fd3ff" }}>Ошибок нет.</div>
            )}
          </Card>
        ) : null}

        <div style={{ marginBottom: 8, color: "#9fb1bb" }}>
          Показано областей: {Math.min(visibleAreaCount, groupedRows.length)} из {groupedRows.length}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <Btn
            onClick={toggleAllAreas}
            style={{ background: "linear-gradient(180deg,#334155,#1f2937)", padding: "8px 12px", borderRadius: 8 }}
          >
            {areAllAreasCollapsed ? "Развернуть все" : "Свернуть все"}
          </Btn>
        </div>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => setSettingsOpen(true)}
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 110,
            background: "linear-gradient(180deg,#334155,#1f2937)",
            border: "1px solid #334756",
            color: "#eaf1f4",
            borderRadius: 999,
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 700,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          ⚙ Настройки
        </button>

        <div style={{ overflow: "auto", maxHeight: "70vh", border: "1px solid #2f3d49", borderRadius: 10, position: "relative" }}>
          <table style={{ width: "max-content", minWidth: tableMinWidth, borderCollapse: "separate", borderSpacing: 0, tableLayout: "auto" }}>
            <thead>
              <tr style={{ background: "#0f151b", height: 44 }}>
                <th
                  rowSpan={2}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    position: "sticky",
                    insetInlineStart: 0,
                    left: 0,
                    top: 0,
                    background: "#0f151b",
                    zIndex: 30,
                    border: "1px solid #334756",
                    minWidth: 220,
                    maxWidth: 220,
                    width: 220,
                    backgroundClip: "padding-box",
                    boxShadow: "3px 0 0 #4b5f70, 10px 0 12px rgba(0,0,0,.25)",
                    borderRight: "2px solid #4b5f70",
                  }}
                >
                  Область / Филиал
                </th>
                {yearHeaderGroups.map((g) => (
                  <th
                    key={`y-${g.year}`}
                    colSpan={Math.max(1, g.count) + 1}
                    style={{
                      textAlign: "center",
                      padding: 10,
                      whiteSpace: "nowrap",
                      position: "sticky",
                      top: 0,
                      zIndex: 6,
                      background: "#0f151b",
                      border: "1px solid #334756",
                      borderRight: "2px solid #4b5f70",
                    }}
                  >
                    {g.year}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  style={{ textAlign: "right", padding: 10, position: "sticky", top: 0, zIndex: 6, background: "#0f151b", border: "1px solid #334756", borderLeft: "2px solid #4b5f70" }}
                >
                  Покрытость задачами
                </th>
                <th
                  rowSpan={2}
                  style={{ textAlign: "right", padding: 10, position: "sticky", top: 0, zIndex: 6, background: "#0f151b", border: "1px solid #334756", borderLeft: "2px solid #4b5f70" }}
                >
                  Прирост к АППГ
                </th>
              </tr>
              <tr style={{ background: "#111922", height: 40 }}>
                {yearHeaderGroups.map((g) => (
                  <Fragment key={`yh-${g.year}`}>
                    {(columnsByYear[g.year] || []).map((c) => (
                      <th
                        key={c.key}
                        style={{
                          textAlign: "right",
                          padding: 8,
                          whiteSpace: "nowrap",
                          position: "sticky",
                          top: 44,
                          zIndex: 5,
                          background: "#111922",
                          border: "1px solid #334756",
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                    <th
                      key={`ytotal-${g.year}`}
                      style={{
                        textAlign: "right",
                        padding: 8,
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 44,
                        zIndex: 5,
                        background: "#111922",
                        border: "1px solid #334756",
                        borderRight: "2px solid #4b5f70",
                        fontWeight: 700,
                        color: "#c8d7de",
                      }}
                    >
                      Итого {g.year}
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleGroupedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + yearHeaderGroups.length + 3} style={{ padding: 14, color: "#9fb1bb", border: "1px solid #334756" }}>
                    Нет данных для отображения.
                  </td>
                </tr>
              ) : (
                visibleGroupedRows.map((areaNode) => {
                  const expanded = expandedAreas[areaNode.area] ?? true;
                  return (
                    <Fragment key={areaNode.area}>
                      <tr style={{ background: "#111922" }}>
                        <td
                          style={{
                            padding: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                            position: "sticky",
                            insetInlineStart: 0,
                            left: 0,
                            background: "#111922",
                            zIndex: 20,
                            minWidth: 220,
                            maxWidth: 220,
                            width: 220,
                            backgroundClip: "padding-box",
                            boxShadow: "3px 0 0 #4b5f70, 10px 0 12px rgba(0,0,0,.2)",
                            border: "1px solid #334756",
                            borderRight: "2px solid #4b5f70",
                          }}
                          onClick={() => toggleArea(areaNode.area)}
                        >
                          {expanded ? "▼" : "▶"} {areaNode.area}
                        </td>
                        {yearHeaderGroups.map((g) => (
                          <Fragment key={`ar-${g.year}`}>
                            {(columnsByYear[g.year] || []).map((c) => (
                              <td
                                key={c.key}
                                style={{
                                  textAlign: "right",
                                  padding: 10,
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                  border: "1px solid #334756",
                                }}
                              >
                                {formatAmount(areaNode.totals[c.key] || 0)}
                              </td>
                            ))}
                            <td
                              key={`ar-total-${g.year}`}
                              style={{
                                textAlign: "right",
                                padding: 10,
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                border: "1px solid #334756",
                                borderRight: "2px solid #4b5f70",
                                color: "#c8d7de",
                              }}
                            >
                              {formatAmount(calcYearSubtotal(areaNode.totals, g.year))}
                            </td>
                          </Fragment>
                        ))}
                        <td style={{ textAlign: "right", padding: 10, border: "1px solid #334756", borderLeft: "2px solid #4b5f70" }}>
                          <button
                            onClick={() => openCoveragePanel("region", areaNode.area, areaNode.branches.map((b) => b.id))}
                            style={{
                              background: "transparent",
                              border: "1px dashed #334756",
                              color: getCoverageColor(areaNode.coverage),
                              borderRadius: 6,
                              padding: "4px 6px",
                              cursor: "pointer",
                              fontWeight: 700,
                            }}
                          >
                            {formatCoverage(areaNode.coverage)}
                          </button>
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            padding: 10,
                            fontWeight: 700,
                            border: "1px solid #334756",
                            borderLeft: "2px solid #4b5f70",
                            color: Number(areaNode?.yoy?.delta || 0) > 0 ? "#22c55e" : Number(areaNode?.yoy?.delta || 0) < 0 ? "#ef4444" : "#c8d7de",
                          }}
                        >
                          {formatYoy(areaNode.yoy)}
                        </td>
                      </tr>
                      {expanded
                        ? areaNode.branches.map((branch) => (
                            <tr key={branch.id}>
                              <td
                                style={{
                                  padding: "9px 10px 9px 28px",
                                  position: "sticky",
                                  insetInlineStart: 0,
                                  left: 0,
                                  background: "#182129",
                                  zIndex: 15,
                                  minWidth: 220,
                                  maxWidth: 220,
                                  width: 220,
                                  backgroundClip: "padding-box",
                                  boxShadow: "3px 0 0 #4b5f70, 10px 0 12px rgba(0,0,0,.18)",
                                  border: "1px solid #334756",
                                  borderRight: "2px solid #4b5f70",
                                }}
                              >
                                {branch.name}
                              </td>
                              {yearHeaderGroups.map((g) => (
                                <Fragment key={`br-${branch.id}-${g.year}`}>
                                  {(columnsByYear[g.year] || []).map((c) => (
                                    <td
                                      key={c.key}
                                      style={{
                                        textAlign: "right",
                                        padding: 8,
                                        whiteSpace: "nowrap",
                                        border: "1px solid #334756",
                                      }}
                                    >
                                      {(() => {
                                        const isAtomicMonth = c.months?.length === 1;
                                        const month = isAtomicMonth ? c.months[0] : null;
                                        const year = c.year;
                                        const cellKey = isAtomicMonth ? factCellKey(branch.id, year, month) : "";
                                        const isEditing = isAtomicMonth && editingCellKey === cellKey;
                                        const isSaving = isAtomicMonth && savingCellKey === cellKey;

                                        if (editMode && isAtomicMonth && yearList.length === 1) {
                                          if (isEditing) {
                                            return (
                                              <input
                                                autoFocus
                                                value={editingCellValue}
                                                onChange={(e) => setEditingCellValue(e.target.value)}
                                                onBlur={() => saveEditedCell(branch.id, year, month)}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    void saveEditedCell(branch.id, year, month);
                                                  }
                                                  if (e.key === "Escape") {
                                                    e.preventDefault();
                                                    cancelEditCell();
                                                  }
                                                }}
                                                style={{
                                                  width: "100%",
                                                  textAlign: "right",
                                                  background: "#0f151b",
                                                  color: "#eaf1f4",
                                                  border: "1px solid #3b82f6",
                                                  borderRadius: 6,
                                                  padding: "4px 6px",
                                                }}
                                              />
                                            );
                                          }

                                          return (
                                            <button
                                              onClick={() => beginEditCell(branch.id, year, month, branch.values[c.key] || 0)}
                                              disabled={isSaving}
                                              style={{
                                                width: "100%",
                                                textAlign: "right",
                                                background: "transparent",
                                                color: "#eaf1f4",
                                                border: "1px dashed #334756",
                                                borderRadius: 6,
                                                padding: "4px 6px",
                                                cursor: "pointer",
                                              }}
                                              title="Нажмите для редактирования"
                                            >
                                              {isSaving ? "..." : formatAmount(branch.values[c.key] || 0)}
                                            </button>
                                          );
                                        }

                                        return formatAmount(branch.values[c.key] || 0);
                                      })()}
                                    </td>
                                  ))}
                                  <td
                                    key={`br-total-${branch.id}-${g.year}`}
                                    style={{
                                      textAlign: "right",
                                      padding: 8,
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                      border: "1px solid #334756",
                                      borderRight: "2px solid #4b5f70",
                                      color: "#c8d7de",
                                    }}
                                  >
                                    {formatAmount(calcYearSubtotal(branch.values, g.year))}
                                  </td>
                                </Fragment>
                              ))}
                              <td style={{ textAlign: "right", padding: 10, border: "1px solid #334756", borderLeft: "2px solid #4b5f70" }}>
                                <button
                                  onClick={() => openCoveragePanel("branch", branch.name, [branch.id])}
                                  style={{
                                    background: "transparent",
                                    border: "1px dashed #334756",
                                    color: getCoverageColor(branch.coverage),
                                    borderRadius: 6,
                                    padding: "4px 6px",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                  }}
                                >
                                  {formatCoverage(branch.coverage)}
                                </button>
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: 10,
                                  fontWeight: 700,
                                  border: "1px solid #334756",
                                  borderLeft: "2px solid #4b5f70",
                                  color: Number(branch?.yoy?.delta || 0) > 0 ? "#22c55e" : Number(branch?.yoy?.delta || 0) < 0 ? "#ef4444" : "#c8d7de",
                                }}
                              >
                                {formatYoy(branch.yoy)}
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {hasMoreAreas ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <Btn
              onClick={() => setVisibleAreaCount((v) => v + 30)}
              style={{ background: "linear-gradient(180deg,#2563eb,#1d4ed8)" }}
            >
              Показать еще
            </Btn>
          </div>
        ) : null}

        {coveragePanel.open ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(0,0,0,.45)",
              display: "flex",
              justifyContent: "flex-end",
            }}
            onClick={closeCoveragePanel}
          >
            <div
              style={{
                width: "min(560px, 96vw)",
                height: "100%",
                background: "#101820",
                borderLeft: "1px solid #334756",
                padding: 14,
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ color: "#9fb1bb", fontSize: 13 }}>Покрытость задачами</div>
                  <div style={{ fontWeight: 700 }}>{coveragePanel.title}</div>
                </div>
                <button
                  onClick={closeCoveragePanel}
                  style={{ background: "transparent", color: "#c8d7de", border: "1px solid #334756", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
                >
                  Закрыть
                </button>
              </div>

              {coveragePanel.loading ? <div style={{ color: "#9fb1bb" }}>Загрузка...</div> : null}

              {!coveragePanel.loading && coveragePanel.step === "clients" ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {coveragePanel.scope === "region" ? (
                    Object.entries(
                      (coveragePanel.clients || []).reduce((acc, c) => {
                        const bId = String(c.branch_id || "");
                        if (!acc[bId]) acc[bId] = [];
                        acc[bId].push(c);
                        return acc;
                      }, {}),
                    ).map(([bId, list]) => {
                      const branchName = (scopedBranches || []).find((b) => String(b.id) === bId)?.name || bId;
                      return (
                        <Card key={bId} style={{ background: "#121920", borderColor: "#334756" }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{branchName}</div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {list.map((client) => (
                              <div key={client.client_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                                <div>{client.client_name || client.client_id}</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ color: "#9fb1bb" }}>Задач: {client.tasks_count}</span>
                                  <button
                                    onClick={() => openClientInCoverage(client.client_id)}
                                    style={{ background: "transparent", border: "1px solid #334756", color: "#c8d7de", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                                  >
                                    ▼
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      );
                    })
                  ) : (
                    (coveragePanel.clients || []).map((client) => (
                      <Card key={client.client_id} style={{ background: "#121920", borderColor: "#334756" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <div>{client.client_name || client.client_id}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: "#9fb1bb" }}>Задач: {client.tasks_count}</span>
                            <button
                              onClick={() => openClientInCoverage(client.client_id)}
                              style={{ background: "transparent", border: "1px solid #334756", color: "#c8d7de", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                  {!coveragePanel.clients?.length ? <div style={{ color: "#9fb1bb" }}>Клиенты не найдены.</div> : null}
                </div>
              ) : null}

              {!coveragePanel.loading && coveragePanel.step === "client" && coveragePanel.selectedClient ? (
                <Card style={{ background: "#121920", borderColor: "#334756" }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div><strong>Клиент:</strong> {coveragePanel.selectedClient.name || "—"}</div>
                    <div><strong>Город:</strong> {coveragePanel.selectedClient.city || "—"}</div>
                    <div><strong>Статус:</strong> {coveragePanel.selectedClient.status_text || coveragePanel.selectedClient.status || "—"}</div>
                    <div><strong>Канал:</strong> {coveragePanel.selectedClient.sales_channel || "—"}</div>
                    <div><strong>Контакт:</strong> {coveragePanel.selectedClient.manager_contact || "—"}</div>
                    <div><strong>Инфо:</strong> {coveragePanel.selectedClient.info || "—"}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn
                        onClick={() => setCoveragePanel((prev) => ({ ...prev, step: "clients", selectedClient: null, tasks: [] }))}
                        style={{ background: "linear-gradient(180deg,#334155,#1f2937)" }}
                      >
                        Назад
                      </Btn>
                      <Btn onClick={() => openClientTasksInCoverage(coveragePanel.selectedClient.id)}>
                        Задачи
                      </Btn>
                    </div>
                  </div>
                </Card>
              ) : null}

              {!coveragePanel.loading && coveragePanel.step === "tasks" ? (
                <Card style={{ background: "#121920", borderColor: "#334756" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <Btn
                      onClick={() => setCoveragePanel((prev) => ({ ...prev, step: "client" }))}
                      style={{ background: "linear-gradient(180deg,#334155,#1f2937)" }}
                    >
                      Назад
                    </Btn>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {(coveragePanel.tasks || []).map((t) => (
                      <div key={t.task_id} style={{ border: "1px solid #334756", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontWeight: 700 }}>{t.title || "Без названия"}</div>
                        <div style={{ color: "#9fb1bb", marginTop: 4 }}>{t.result || "—"}</div>
                      </div>
                    ))}
                    {!coveragePanel.tasks?.length ? <div style={{ color: "#9fb1bb" }}>По клиенту задач нет.</div> : null}
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </Wrap>
  );
}

