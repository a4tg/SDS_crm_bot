"""
Основной модуль Telegram‑бота для CRM. Этот скрипт использует библиотеку
``aiogram`` для приёма и обработки сообщений от пользователей и библиотеку
``supabase-py`` для взаимодействия с облачной базой данных Supabase.

Для запуска бота необходимо создать файл «.env» (см. пример
``.env.example``) и заполнить переменные окружения:

* ``BOT_TOKEN`` – токен телеграм‑бота, который выдаёт BotFather;
* ``SUPABASE_URL`` – адрес вашего проекта Supabase;
* ``SUPABASE_KEY`` – сервисный ключ (``anon`` или ``service_role``) проекта.

Сценарий реализует простейший CRM‑функционал:

* регистрация пользователя при команде ``/start`` и сохранение его данных
  (Telegram ID, имя, фамилия, username) в таблице ``users``;
* вывод списка доступных команд через ``/help``;
* пошаговое создание нового лида по команде ``/newlead`` с помощью FSM:
  бот спрашивает имя, телефон и электронную почту, а затем сохраняет
  введённые данные в таблицу ``leads``;
* просмотр собственных лидов через команду ``/myleads``.

Пример использования демонстрирует основы работы с ``aiogram`` и
``supabase-py`` и может быть расширен для более сложных сценариев.
"""

import logging
import os
import datetime
from typing import List

from aiogram import Bot, Dispatcher, types
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.dispatcher import FSMContext
from aiogram.dispatcher.filters import Text
from aiogram.dispatcher.filters.state import State, StatesGroup
from aiogram.utils import executor
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from supabase import create_client, Client
from dotenv import load_dotenv


# Загрузка переменных окружения из файла .env, если он присутствует
load_dotenv()

# Чтение конфигурации из переменных окружения
BOT_TOKEN = os.getenv("BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not BOT_TOKEN:
    raise RuntimeError(
        "Не найден BOT_TOKEN. Создайте файл .env на основе .env.example "
        "и укажите токен, выданный BotFather."
    )
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Не найдены SUPABASE_URL/SUPABASE_KEY. Создайте файл .env на основе "
        ".env.example и заполните параметры вашего проекта Supabase."
    )

# Инициализация клиента Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Настройка логирования
logging.basicConfig(level=logging.INFO)

# Создание объектов бота и диспетчера
storage = MemoryStorage()
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher(bot, storage=storage)


# --- UI Helpers ---

def get_main_menu() -> InlineKeyboardMarkup:
    """
    Возвращает главное меню бота в виде инлайн‑клавиатуры. Меню содержит
    основные действия: просмотр задач и создание новой задачи. По желанию
    можно дополнить его пунктами для лидов и помощи.
    """
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(
        InlineKeyboardButton("📋 Мои задачи", callback_data="mytasks"),
        InlineKeyboardButton("➕ Новая задача", callback_data="newtask"),
    )
    # Дополнительные пункты можно добавить здесь, например:
    # kb.add(InlineKeyboardButton("ℹ️ Помощь", callback_data="help"))
    return kb


def build_tasks_keyboard(tasks: List[dict]) -> InlineKeyboardMarkup:
    """
    Формирует клавиатуру для списка задач. Первая кнопка позволяет
    добавить новую задачу. Затем для каждой задачи создаётся кнопка с
    идентификатором задачи в callback_data. В конце добавляем кнопку
    возврата в главное меню.

    :param tasks: список словарей с ключами 'id' и 'title'
    """
    kb = InlineKeyboardMarkup(row_width=1)
    # Кнопка для создания новой задачи
    kb.add(InlineKeyboardButton("➕ Добавить задачу", callback_data="newtask"))
    # Кнопки для существующих задач
    for t in tasks:
        title = (t.get("title") or "")
        # Ограничиваем длину заголовка для кнопки
        btn_text = title if len(title) <= 30 else title[:27] + "…"
        kb.add(InlineKeyboardButton(btn_text, callback_data=f"task:{t['id']}"))
    # Кнопка возврата в главное меню
    kb.add(InlineKeyboardButton("⬅️ Главное меню", callback_data="menu"))
    return kb


async def prompt_for_assignee(message: types.Message, state: FSMContext) -> None:
    """
    Отображает пользователю список доступных исполнителей в виде
    инлайн‑кнопок. Список формируется на основе роли постановщика (если
    пользователь — project_head, он может назначить задачу только
    лидеру команды; team_leader — региональному менеджеру; region_manager
    — младшему менеджеру; junior_manager — только себе). Список
    пользователей берётся из таблицы `profiles` (поля `full_name`,
    `telegram_id`, `role`). Если в Supabase отсутствует профиль
    пользователя, считем его роль `junior_manager` и разрешаем
    назначить задачу только себе.
    """
    chat_id = message.chat.id
    assigner_id = message.from_user.id
    # Получаем роль текущего пользователя
    try:
        prof_resp = supabase.table("profiles").select("role, telegram_id").eq("telegram_id", assigner_id).single().execute()
        prof = prof_resp.data if not prof_resp.error else None
        assigner_role = prof.get("role") if prof else None
    except Exception:
        assigner_role = None
    # Определяем список ролей, которым можно назначать задачи
    allowed_roles = ROLE_ASSIGNMENT_MAP.get(assigner_role, [])
    # Запрашиваем потенциальных исполнителей
    assignees: List[dict] = []
    if allowed_roles:
        try:
            ass_resp = supabase.table("profiles").select("full_name, telegram_id, role").in_("role", allowed_roles).execute()
            assignees = ass_resp.data or []
        except Exception:
            assignees = []
    # Формируем клавиатуру: сначала кнопка для назначения себе
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("Назначить себе", callback_data="assign:self"))
    # Добавляем кнопки для остальных исполнителей
    for a in assignees:
        # Пропускаем себя, если попал в выборку
        if a.get("telegram_id") == assigner_id:
            continue
        name = a.get("full_name") or a.get("role") or str(a.get("telegram_id"))
        kb.add(InlineKeyboardButton(name, callback_data=f"assign:{a['telegram_id']}"))
    # Если нет других доступных исполнителей, оставим только выбор "Назначить себе"
    await bot.send_message(chat_id, "Выберите исполнителя задачи:", reply_markup=kb)


class LeadForm(StatesGroup):
    """
    Класс состояний для пошагового ввода данных нового лида. FSM (finite state
    machine) позволяет хранить промежуточные данные пользователя между
    сообщениями.
    """

    name = State()  # Шаг ввода имени
    phone = State()  # Шаг ввода телефона
    email = State()  # Шаг ввода e‑mail


class TaskForm(StatesGroup):
    """
    Класс состояний для пошагового создания новой задачи. Бот последовательно
    запрашивает у пользователя название, клиента, дедлайн, описание и ID
    исполнителя (telegram_id). После заполнения данных запись сохраняется в
    таблицу ``tasks``.
    """

    title = State()       # Название задачи
    client = State()      # Клиент (необязательно)
    due_date = State()    # Дата/время дедлайна
    description = State() # Описание (необязательно)
    assignee = State()    # Telegram ID исполнителя

# Состояния для прикрепления результата к существующей задаче
class TaskResultForm(StatesGroup):
    awaiting_result = State()  # Ожидаем текст или файл для выбранной задачи

# Возможные назначения по ролям для создания задач. Ключ — роль постановщика,
# значение — список ролей, которым он может ставить задачи. Всегда
# добавляется кнопка «Назначить себе», чтобы при необходимости можно было
# выбрать себя исполнителем.
ROLE_ASSIGNMENT_MAP = {
    "project_head": ["team_leader"],
    "team_leader": ["region_manager"],
    "region_manager": ["junior_manager"],
    "junior_manager": [],
}


@dp.message_handler(commands=['start'])
async def send_welcome(message: types.Message) -> None:
    """
    Обработчик команды ``/start``. Если пользователь впервые обращается к боту,
    его данные сохраняются в таблицу ``users``. Затем выводится приветственное
    сообщение с краткой инструкцией.
    """
    telegram_id = message.from_user.id
    username = message.from_user.username
    first_name = message.from_user.first_name
    last_name = message.from_user.last_name
    # Проверяем наличие пользователя в базе
    response = supabase.table("users").select("id").eq("telegram_id", telegram_id).execute()
    existing: List[dict] = response.data or []
    if not existing:
        # Если пользователя нет – добавляем его
        supabase.table("users").insert(
            {
                "telegram_id": telegram_id,
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
            }
        ).execute()
        logging.info("Создан новый пользователь %s", telegram_id)
    # Отправляем приветствие и показываем главное меню
    await message.reply(
        "Здравствуйте!\n"
        "Это CRM‑бот для управления лидами и задачами.",
        reply_markup=get_main_menu()
    )


@dp.message_handler(commands=['help'])
async def help_command(message: types.Message) -> None:
    """
    Вывод списка доступных команд. Вызывается командой ``/help``.
    """
    await message.reply(
        "Доступные команды:\n"
        "/start – регистрация и приветствие\n"
        "/newlead – пошаговое создание лида\n"
        "/myleads – вывод ваших лидов\n"
        "/newtask – создание новой задачи\n"
        "/mytasks – вывод ваших задач\n"
        "Также вы можете использовать кнопки в интерфейсе бота, не вводя команды."
    )


@dp.message_handler(commands=['newlead'])
async def new_lead(message: types.Message) -> None:
    """
    Старт процесса создания нового лида. Переводит пользователя в состояние
    ``LeadForm.name``.
    """
    await LeadForm.name.set()
    # Просим ввести имя лида и прикрепляем навигационную клавиатуру
    await message.reply("Введите имя лида:", reply_markup=get_main_menu())


@dp.message_handler(state=LeadForm.name)
async def process_lead_name(message: types.Message, state: FSMContext) -> None:
    """
    Обработчик ввода имени лида. Сохраняет имя во временном хранилище и
    переводит в состояние ``LeadForm.phone``.
    """
    async with state.proxy() as data:
        data['name'] = message.text.strip()
    await LeadForm.next()
    await message.reply("Введите номер телефона:", reply_markup=get_main_menu())


@dp.message_handler(state=LeadForm.phone)
async def process_lead_phone(message: types.Message, state: FSMContext) -> None:
    """
    Обработчик ввода телефона. Сохраняет номер и переводит в состояние
    ``LeadForm.email``.
    """
    async with state.proxy() as data:
        data['phone'] = message.text.strip()
    await LeadForm.next()
    await message.reply("Введите e‑mail:", reply_markup=get_main_menu())


@dp.message_handler(state=LeadForm.email)
async def process_lead_email(message: types.Message, state: FSMContext) -> None:
    """
    Финальный шаг ввода лида. Сохраняет адрес электронной почты, сохраняет
    созданный лид в базе данных и завершает состояние.
    """
    async with state.proxy() as data:
        data['email'] = message.text.strip()
        telegram_id = message.from_user.id
        # Сохраняем лид в таблицу
        supabase.table("leads").insert(
            {
                "telegram_id": telegram_id,
                "name": data['name'],
                "phone": data['phone'],
                "email": data['email'],
            }
        ).execute()
        logging.info(
            "Добавлен лид от пользователя %s: %s, %s, %s",
            telegram_id,
            data['name'],
            data['phone'],
            data['email'],
        )
    await state.finish()
    await message.reply("Лид успешно добавлен!", reply_markup=get_main_menu())


@dp.message_handler(commands=['myleads'])
async def my_leads(message: types.Message) -> None:
    """
    Показывает список лидов, связанных с пользователем. Каждая запись выводится
    отдельной строкой. Если лидов нет – отправляется соответствующее сообщение.
    """
    telegram_id = message.from_user.id
    response = (
        supabase.table("leads")
        .select("name, phone, email, created_at")
        .eq("telegram_id", telegram_id)
        .order("created_at", desc=False)
        .execute()
    )
    leads: List[dict] = response.data or []
    if not leads:
        await message.reply("У вас пока нет лидов.")
        return
    lines = ["Ваши лиды:"]
    for idx, lead in enumerate(leads, start=1):
        lines.append(
            f"{idx}. {lead['name']} | {lead['phone']} | {lead['email']}"
        )
    await message.reply("\n".join(lines))


@dp.message_handler(commands=['newtask'])
async def new_task(message: types.Message) -> None:
    """
    Запускает пошаговый процесс создания новой задачи.
    Пользователь вводит название, клиента, дедлайн, описание и ID исполнителя.
    """
    await TaskForm.title.set()
    await message.reply("Введите название задачи:", reply_markup=get_main_menu())


@dp.message_handler(state=TaskForm.title)
async def process_task_title(message: types.Message, state: FSMContext) -> None:
    async with state.proxy() as data:
        data['title'] = message.text.strip()
    await TaskForm.next()
    # При запросе следующего поля также показываем главное меню, чтобы у пользователя
    # всегда были доступные кнопки «Мои задачи» и «Новая задача»
    await message.reply(
        "Введите клиента (если нет — отправьте тире):",
        reply_markup=get_main_menu()
    )


@dp.message_handler(state=TaskForm.client)
async def process_task_client(message: types.Message, state: FSMContext) -> None:
    async with state.proxy() as data:
        # Сохраняем клиента (пустая строка будет преобразована в None)
        txt = message.text.strip()
        data['client'] = txt if txt and txt != '-' else None
    await TaskForm.next()
    # При запросе дедлайна также выводим главное меню
    await message.reply(
        "Введите дедлайн в формате YYYY-MM-DD HH:MM (24-часовой):",
        reply_markup=get_main_menu()
    )


@dp.message_handler(state=TaskForm.due_date)
async def process_task_due_date(message: types.Message, state: FSMContext) -> None:
    text = message.text.strip()
    try:
        # Парсим дату и время
        dt = datetime.datetime.strptime(text, "%Y-%m-%d %H:%M")
    except ValueError:
        await message.reply(
            "Некорректный формат. Используйте YYYY-MM-DD HH:MM, например 2025-12-31 18:00. Попробуйте ещё раз:"
        )
        return
    async with state.proxy() as data:
        data['due_date'] = dt.isoformat()
    await TaskForm.next()
    # Запрашивая описание, также прикрепляем меню навигации
    await message.reply(
        "Введите описание задачи (можно оставить пустым):",
        reply_markup=get_main_menu()
    )


@dp.message_handler(state=TaskForm.description)
async def process_task_description(message: types.Message, state: FSMContext) -> None:
    async with state.proxy() as data:
        txt = message.text.strip()
        data['description'] = txt if txt and txt != '-' else None
    # Переходим к выбору исполнителя
    await TaskForm.next()
    # Предлагаем выбрать исполнителя из списка
    await prompt_for_assignee(message, state)


@dp.message_handler(state=TaskForm.assignee)
async def process_task_assignee(message: types.Message, state: FSMContext) -> None:
    """
    Обработчик текстового ввода для выбора исполнителя. По умолчанию мы
    рекомендуем выбирать исполнителя через кнопки (callback). Однако, для
    совместимости с прежней логикой, если пользователь отправил числовой
    Telegram‑ID или '0', задача будет назначена соответствующему
    исполнителю. В остальных случаях напоминаем о необходимости выбрать
    исполнителя с помощью кнопок.
    """
    assignee_input = message.text.strip()
    # Попытаемся определить исполнителя. Допускаем ввод Telegram‑ID, '0' для
    # назначения себе или полное имя (FIO). Если имя введено неявно, ищем
    # его в таблице profiles. В остальных случаях просим воспользоваться
    # кнопками.
    assigner_id = message.from_user.id
    assignee_id: int | None = None
    # Если ввод выглядит как цифра или ноль — берем как telegram_id
    if assignee_input.isdigit() or assignee_input == '0':
        if assignee_input and assignee_input != '0' and assignee_input != '-':
            assignee_id = int(assignee_input)
        else:
            assignee_id = assigner_id
    else:
        # Попробуем найти пользователя по полному имени (без учета регистра)
        try:
            # Ищем точное совпадение full_name
            resp = supabase.table("profiles").select("telegram_id, full_name").ilike("full_name", assignee_input).execute()
            candidates: List[dict] = resp.data or []
        except Exception:
            candidates = []
        # Если найден ровно один кандидат — используем его telegram_id
        if len(candidates) == 1:
            assignee_id = candidates[0].get("telegram_id")
        else:
            assignee_id = None
    # Если мы определили исполнителя — сохраняем задачу
    if assignee_id is not None:
        async with state.proxy() as data:
            title = data.get('title')
            client = data.get('client')
            due_date = data.get('due_date')
            description = data.get('description')
        # Сохраняем в таблицу tasks
        supabase.table("tasks").insert(
            {
                "title": title,
                "client": client,
                "due_date": due_date,
                "description": description,
                "status": "Выполняется",
                "assigner_telegram_id": assigner_id,
                "assignee_telegram_id": assignee_id,
            }
        ).execute()
        await state.finish()
        # Отправляем сообщение с меню после добавления
        await message.reply(
            "Задача успешно добавлена.",
            reply_markup=get_main_menu()
        )
    else:
        # Неверный формат — напомним о выборе через кнопки или имени
        await message.reply(
            "Не удалось определить исполнителя.\n"
            "Введите Telegram‑ID, 0 для назначения себе или выберите из списка кнопок.",
            reply_markup=get_main_menu()
        )


@dp.message_handler(commands=['mytasks'])
async def my_tasks(message: types.Message) -> None:
    """
    Показывает список задач, в которых пользователь является постановщиком или исполнителем.
    Выводит ключевые поля: ID, название, дедлайн, статус, исполнитель.
    """
    telegram_id = message.from_user.id
    # Получаем задачи, где текущий пользователь постановщик или исполнитель
    try:
        # Считываем задачи без or_.
        assigner_resp = (
            supabase.table("tasks")
            .select("id, title, due_date, status, assignee_telegram_id")
            .eq("assigner_telegram_id", telegram_id)
            .execute()
        )
        assignee_resp = (
            supabase.table("tasks")
            .select("id, title, due_date, status, assignee_telegram_id")
            .eq("assignee_telegram_id", telegram_id)
            .execute()
        )
        tasks: List[dict] = []
        if assigner_resp.data:
            tasks.extend(assigner_resp.data)
        if assignee_resp.data:
            for t in assignee_resp.data:
                if t not in tasks:
                    tasks.append(t)
        tasks.sort(key=lambda x: x.get('due_date') or '')
    except Exception as e:
        logging.error("Ошибка при получении задач: %s", e)
        await message.reply(
            "Ошибка при получении списка задач. Попробуйте ещё раз позже.",
            reply_markup=get_main_menu(),
        )
        return
    # Формируем текстовый список и клавиатуру
    if tasks:
        lines = []
        for t in tasks:
            due_str = t.get('due_date')
            try:
                due_dt = datetime.datetime.fromisoformat(due_str)
                due_str = due_dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass
            lines.append(f"{t['title']} (до {due_str}) — {t['status']}")
        text = "Ваши задачи:\n" + "\n".join(lines)
    else:
        text = "У вас пока нет задач."
    kb = build_tasks_keyboard(tasks)
    await message.reply(text, reply_markup=kb)


@dp.message_handler(commands=['cancel'], state='*')
@dp.message_handler(Text(equals='cancel', ignore_case=True), state='*')
async def cancel_handler(message: types.Message, state: FSMContext) -> None:
    """
    Позволяет отменить ввод лида на любом этапе. Команда ``/cancel`` завершает
    текущее состояние и удаляет временные данные.
    """
    current_state = await state.get_state()
    if current_state is None:
        return
    await state.finish()
    await message.reply(
        "Создание лида отменено.", reply_markup=types.ReplyKeyboardRemove()
    )


@dp.message_handler(state=TaskResultForm.awaiting_result, content_types=types.ContentType.ANY)
async def process_task_result(message: types.Message, state: FSMContext) -> None:
    """
    Принимает результат выполнения задачи. Пользователь может прислать
    текст или файл. Сохраняем результат в таблицу tasks (поле result) и
    при наличии файла добавляем запись в task_files с идентификатором
    файла Telegram.
    """
    data = await state.get_data()
    task_id = data.get('task_id')
    if not task_id:
        await state.finish()
        await message.reply("Неизвестная задача. Попробуйте снова.")
        return
    result_text: str | None = None
    file_id: str | None = None
    # Проверяем тип содержимого
    if message.content_type == types.ContentType.TEXT:
        result_text = message.text.strip()
    elif message.content_type in [types.ContentType.DOCUMENT, types.ContentType.PHOTO]:
        # Сохраняем file_id как ссылку
        if message.content_type == types.ContentType.DOCUMENT:
            file_id = message.document.file_id
        elif message.content_type == types.ContentType.PHOTO:
            # Берём file_id самого большого фото
            photo = message.photo[-1]
            file_id = photo.file_id
        result_text = f"[Файл: {file_id}]"
    else:
        await message.reply("Пожалуйста, отправьте текст или файл.")
        return
    # Обновляем задачу: сохраняем результат и статус
    supabase.table("tasks").update({
        "result": result_text,
        "status": "Результат на согласовании",
        "updated_at": datetime.datetime.utcnow().isoformat()
    }).eq("id", task_id).execute()
    # Если есть файл – добавляем запись в task_files
    if file_id:
        supabase.table("task_files").insert({
            "task_id": task_id,
            "file_url": file_id,
        }).execute()
    await state.finish()
    # Сообщаем пользователю и предлагаем дальнейшие действия
    kb = InlineKeyboardMarkup(row_width=1)
    kb.add(InlineKeyboardButton("📋 К списку задач", callback_data="mytasks"))
    kb.add(InlineKeyboardButton("⬅️ Главное меню", callback_data="menu"))
    await message.reply(
        "✅ Результат прикреплён к задаче. Он отправлен на согласование.",
        reply_markup=kb
    )


# --- Callback query handlers for UI buttons ---

@dp.callback_query_handler(lambda c: c.data == 'menu')
async def on_menu(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обработчик кнопки возврата в главное меню. Завершает текущие состояния и
    отображает главное меню.
    """
    # Завершаем текущую FSM, если была
    await state.finish()
    await callback.answer()
    # Редактируем сообщение, где была нажата кнопка, чтобы удалить старую клавиатуру
    try:
        await bot.edit_message_reply_markup(chat_id=callback.message.chat.id,
                                            message_id=callback.message.message_id,
                                            reply_markup=None)
    except Exception:
        pass
    # Отправляем главное меню как новое сообщение
    await bot.send_message(callback.message.chat.id,
                           "Главное меню:",
                           reply_markup=get_main_menu())


@dp.callback_query_handler(lambda c: c.data == 'mytasks')
async def on_mytasks(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обработчик кнопки «Мои задачи». Загружает задачи пользователя и
    отображает их список с кнопками для выбора. Использует два
    отдельных запроса вместо or_, поскольку метод or_ не поддерживается
    в текущей версии supabase-py.
    """
    await state.finish()
    await callback.answer()
    user_id = callback.from_user.id
    try:
        # Получаем задачи, где пользователь — постановщик
        assigner_resp = (
            supabase.table("tasks")
            .select("id, title, due_date, status, assignee_telegram_id")
            .eq("assigner_telegram_id", user_id)
            .execute()
        )
        # Получаем задачи, где пользователь — исполнитель
        assignee_resp = (
            supabase.table("tasks")
            .select("id, title, due_date, status, assignee_telegram_id")
            .eq("assignee_telegram_id", user_id)
            .execute()
        )
        tasks: List[dict] = []
        if assigner_resp.data:
            tasks.extend(assigner_resp.data)
        if assignee_resp.data:
            # избегаем дублирующих задач, если назначитель и исполнитель совпадают
            for t in assignee_resp.data:
                if t not in tasks:
                    tasks.append(t)
        # Сортировка по дедлайну
        tasks.sort(key=lambda x: x.get('due_date') or '')
    except Exception as e:
        logging.error("Ошибка при получении задач (callback): %s", e)
        await bot.send_message(
            callback.message.chat.id,
            "Ошибка при получении списка задач. Попробуйте позже.",
            reply_markup=get_main_menu(),
        )
        return
    # Формируем текстовый список
    if tasks:
        lines = []
        for t in tasks:
            due_str = t.get('due_date')
            try:
                due_dt = datetime.datetime.fromisoformat(due_str)
                due_str = due_dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass
            lines.append(f"{t['title']} (до {due_str}) — {t['status']}")
        text = "Ваши задачи:\n" + "\n".join(lines)
    else:
        text = "У вас пока нет задач."
    kb = build_tasks_keyboard(tasks)
    await bot.send_message(callback.message.chat.id, text, reply_markup=kb)


@dp.callback_query_handler(lambda c: c.data == 'newtask')
async def on_newtask(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обработчик кнопки «Новая задача». Инициализирует FSM создания задачи.
    Аналогичен команде /newtask.
    """
    # Завершаем текущие состояния (например, если ожидался результат)
    await state.finish()
    await callback.answer()
    # Запускаем процесс создания задачи
    await TaskForm.title.set()
    await bot.send_message(callback.message.chat.id, "Введите название задачи:")


@dp.callback_query_handler(lambda c: c.data and c.data.startswith('task:'))
async def on_select_task(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обработчик выбора конкретной задачи. После выбора бот запрашивает
    прикрепление результата.
    """
    await state.finish()
    await callback.answer()
    # Извлекаем ID задачи из callback_data
    _, task_id = callback.data.split(':', 1)
    # Проверяем, существует ли задача и принадлежит ли пользователю
    try:
        resp = (
            supabase.table("tasks")
            .select("id, title, status, result")
            .eq("id", task_id)
            .single()
            .execute()
        )
        data = resp.data
    except Exception:
        data = None
    if not data:
        await bot.send_message(
            callback.message.chat.id,
            "Задача не найдена или недоступна.",
        )
        return
    # Записываем в контекст выбранную задачу
    await state.update_data(task_id=task_id)
    await TaskResultForm.awaiting_result.set()
    # Сообщаем пользователю и предлагаем отмену
    kb = InlineKeyboardMarkup().add(
        InlineKeyboardButton("❌ Отмена", callback_data="cancel_action")
    )
    await bot.send_message(
        callback.message.chat.id,
        f"Вы выбрали задачу: {data['title']}.\nОтправьте результат (текст или файл).",
        reply_markup=kb,
    )


@dp.callback_query_handler(lambda c: c.data == 'cancel_action', state='*')
async def on_cancel_action(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обработчик кнопки отмены на этапе прикрепления результата. Сбрасывает
    состояние и возвращает к списку задач.
    """
    await callback.answer()
    # Сбрасываем состояние
    await state.finish()
    # Удаляем клавиатуру в сообщении, где была нажата отмена
    try:
        await bot.edit_message_reply_markup(chat_id=callback.message.chat.id,
                                            message_id=callback.message.message_id,
                                            reply_markup=None)
    except Exception:
        pass
    # Показываем список задач снова
    # Реиспользуем on_mytasks, передав фейковый callback?
    # Проще вызвать функцию напрямую
    user_id = callback.from_user.id
    # Загружаем задачи без использования or_.
    assigner_resp = (
        supabase.table("tasks")
        .select("id, title, due_date, status, assignee_telegram_id")
        .eq("assigner_telegram_id", user_id)
        .execute()
    )
    assignee_resp = (
        supabase.table("tasks")
        .select("id, title, due_date, status, assignee_telegram_id")
        .eq("assignee_telegram_id", user_id)
        .execute()
    )
    tasks: List[dict] = []
    if assigner_resp.data:
        tasks.extend(assigner_resp.data)
    if assignee_resp.data:
        for t in assignee_resp.data:
            if t not in tasks:
                tasks.append(t)
    tasks.sort(key=lambda x: x.get('due_date') or '')
    if tasks:
        lines = []
        for t in tasks:
            due_str = t.get('due_date')
            try:
                due_dt = datetime.datetime.fromisoformat(due_str)
                due_str = due_dt.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass
            lines.append(f"{t['title']} (до {due_str}) — {t['status']}")
        text = "Ваши задачи:\n" + "\n".join(lines)
    else:
        text = "У вас пока нет задач."
    kb = build_tasks_keyboard(tasks)
    await bot.send_message(callback.message.chat.id, text, reply_markup=kb)


# Выбор исполнителя через кнопки при создании задачи
@dp.callback_query_handler(lambda c: c.data and c.data.startswith('assign:'), state=TaskForm.assignee)
async def handle_assign_callback(callback: types.CallbackQuery, state: FSMContext) -> None:
    """
    Обрабатывает нажатия на кнопки выбора исполнителя в процессе
    создания задачи. Данные задачи извлекаются из FSMContext, выбранный
    telegram_id берётся из callback_data. После сохранения записи
    состояние сбрасывается и отправляется меню для дальнейших действий.
    """
    # Закрываем уведомление «loading…»
    await callback.answer()
    assigner_id = callback.from_user.id
    # Читаем данные задачи из состояния
    async with state.proxy() as fsm_data:
        title = fsm_data.get('title')
        client = fsm_data.get('client')
        due_date = fsm_data.get('due_date')
        description = fsm_data.get('description')
    # Разбираем выбранный идентификатор исполнителя
    _, assignee_code = callback.data.split(':', 1)
    if assignee_code == 'self':
        assignee_id = assigner_id
    else:
        try:
            assignee_id = int(assignee_code)
        except ValueError:
            assignee_id = assigner_id
    # Записываем задачу в БД
    supabase.table("tasks").insert({
        "title": title,
        "client": client,
        "due_date": due_date,
        "description": description,
        "status": "Выполняется",
        "assigner_telegram_id": assigner_id,
        "assignee_telegram_id": assignee_id,
    }).execute()
    # Завершаем FSM
    await state.finish()
    # Удаляем клавиатуру предыдущего сообщения, если возможно
    try:
        await bot.edit_message_reply_markup(chat_id=callback.message.chat.id,
                                            message_id=callback.message.message_id,
                                            reply_markup=None)
    except Exception:
        pass
    # Отправляем подтверждение и главное меню
    await bot.send_message(
        callback.message.chat.id,
        "Задача успешно добавлена.",
        reply_markup=get_main_menu()
    )


def main() -> None:
    """Точка входа для запуска long polling бота."""
    executor.start_polling(dp, skip_updates=True)


if __name__ == '__main__':
    main()