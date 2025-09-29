const Phase = Object.freeze({
  FOCUS: 'focus',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break'
});

const phaseLabels = {
  [Phase.FOCUS]: '專注',
  [Phase.SHORT_BREAK]: '短休息',
  [Phase.LONG_BREAK]: '長休息'
};

const elements = {
  appContainer: document.querySelector('.app'),
  timeDisplay: document.getElementById('timeDisplay'),
  progressBar: document.getElementById('progressBar'),
  phaseChip: document.getElementById('phaseChip'),
  categorySelect: document.getElementById('categorySelect'),
  categoryForm: document.getElementById('categoryForm'),
  categoryInput: document.getElementById('categoryInput'),
  categoryList: document.getElementById('categoryList'),
  historyList: document.getElementById('historyList'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  homeTabs: Array.from(document.querySelectorAll('.app-tabs__tab')),
  homePanels: Array.from(document.querySelectorAll('.app-panel')),
  timeline: document.getElementById('timeline'),
  currentTodoTitle: document.getElementById('currentTodoTitle'),
  currentTodoTags: document.getElementById('currentTodoTags'),
  todoForm: document.getElementById('todoForm'),
  todoInput: document.getElementById('todoInput'),
  todoTagsInput: document.getElementById('todoTagsInput'),
  todoTagSuggestions: document.getElementById('todoTagSuggestions'),
  todoList: document.getElementById('todoList'),
  clearTodosBtn: document.getElementById('clearTodosBtn'),
  clearActiveTodoBtn: document.getElementById('clearActiveTodoBtn'),
  todoDiscussionOverlay: document.getElementById('todoDiscussionOverlay'),
  todoDiscussionTitle: document.getElementById('todoDiscussionTitle'),
  todoDiscussionList: document.getElementById('todoDiscussionList'),
  todoDiscussionEmpty: document.getElementById('todoDiscussionEmpty'),
  todoDiscussionForm: document.getElementById('todoDiscussionForm'),
  todoDiscussionInput: document.getElementById('todoDiscussionInput'),
  todoDiscussionClose: document.getElementById('todoDiscussionClose'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  addTimeBtn: document.getElementById('addTimeBtn'),
  subtractTimeBtn: document.getElementById('subtractTimeBtn'),
  settingsForm: document.getElementById('settingsForm'),
  focusInput: document.getElementById('focusInput'),
  shortBreakInput: document.getElementById('shortBreakInput'),
  longBreakInput: document.getElementById('longBreakInput'),
  longBreakIntervalInput: document.getElementById('longBreakIntervalInput'),
  autoStartBreaks: document.getElementById('autoStartBreaks')
};

const defaults = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: true
};

const defaultCategories = ['未分類'];
const STORAGE_KEY = 'pomodoro-timer-state-v1';

const TIMELINE_PX_PER_MINUTE = 1.6;
const TIMELINE_MIN_DAY_HEIGHT = 160;
const TIMELINE_MIN_SESSION_HEIGHT = 28;
const TIMELINE_MIN_SPAN_MS = 60 * 1000;
const TIMELINE_SESSION_GAP = 12;
const TIMELINE_TODO_GAP = 12;

const state = {
  settings: { ...defaults },
  currentPhase: Phase.FOCUS,
  remainingSeconds: defaults.focusMinutes * 60,
  phaseTotalSeconds: defaults.focusMinutes * 60,
  completedFocusSessions: 0,
  isRunning: false,
  timerId: null,
  categories: [...defaultCategories],
  currentCategory: defaultCategories[0],
  history: [],
  activeSession: null,
  todos: [],
  activeTodoId: null,
  activeTab: 'home',
  activeDiscussionTodoId: null
};

function normalizeTags(tags) {
  const seen = new Set();
  const result = [];

  if (!Array.isArray(tags)) {
    return result;
  }

  tags.forEach(tag => {
    const trimmed = String(tag || '').trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  });

  return result;
}

function parseTagsInput(raw) {
  if (!raw) {
    return [];
  }

  const parts = raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  return normalizeTags(parts);
}

function getInputTags() {
  return parseTagsInput(elements.todoTagsInput?.value || '');
}

function setInputTags(tags) {
  if (!elements.todoTagsInput) {
    return;
  }

  elements.todoTagsInput.value = normalizeTags(tags).join(', ');
  renderTagSuggestions();
}

function normalizeCategories(categories) {
  const input = Array.isArray(categories) ? categories.map(category => String(category).trim()) : [];
  const ordered = [...defaultCategories, ...input];
  const seen = new Set();
  const result = [];

  ordered.forEach(category => {
    if (category && !seen.has(category)) {
      seen.add(category);
      result.push(category);
    }
  });

  return result.length ? result : [...defaultCategories];
}

function normalizeDiscussion(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const seen = new Set();

  return entries
    .map(entry => {
      const id = entry?.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const text = String(entry?.text || '').trim();
      const createdAt = entry?.createdAt || new Date().toISOString();

      if (!text) {
        return null;
      }

      return {
        id,
        text,
        createdAt
      };
    })
    .filter(Boolean)
    .filter(entry => {
      if (seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });
}

function getDisplayTodoTitle(entry) {
  if (!entry) {
    return '';
  }

  const storedTitle = typeof entry.todoTitle === 'string' ? entry.todoTitle.trim() : '';
  if (storedTitle) {
    return storedTitle;
  }

  if (entry.todoId) {
    const todo = state.todos.find(item => item.id === entry.todoId);
    if (todo) {
      const title = String(todo.title || '').trim();
      return title || '(未命名)';
    }
  }

  return '';
}

function getDateKey(isoString) {
  if (!isoString) {
    return null;
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeValue(isoString) {
  if (!isoString) {
    return null;
  }

  const date = new Date(isoString);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function persistState() {
  const payload = {
    settings: state.settings,
    categories: state.categories,
    currentCategory: state.currentCategory,
    history: state.history,
    activeSession: state.activeSession,
    todos: state.todos,
    activeTab: state.activeTab,
    activeTodoId: state.activeTodoId,
    activeDiscussionTodoId: state.activeDiscussionTodoId
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('無法儲存設定至 localStorage', error);
  }
}

function loadPersistedState() {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      return;
    }

    const stored = JSON.parse(serialized);

    if (stored && typeof stored === 'object') {
      const nextSettings = stored.settings && typeof stored.settings === 'object' ? stored.settings : {};
      state.settings = {
        ...defaults,
        ...nextSettings
      };

      state.categories = normalizeCategories(stored.categories);
      state.currentCategory = state.categories.includes(stored.currentCategory)
        ? stored.currentCategory
        : state.categories[0];
      const parsedTodos = Array.isArray(stored.todos)
        ? stored.todos.map(todo => ({
            id: todo.id || crypto.randomUUID?.() || String(Date.now()),
            title: String(todo.title || '').trim(),
            completed: Boolean(todo.completed),
            createdAt: todo.createdAt || new Date().toISOString(),
            completedAt: todo.completedAt || null,
            tags: normalizeTags(todo.tags || []),
            discussion: normalizeDiscussion(todo.discussion || [])
          }))
        : [];

      const resolveStoredTodoTitle = todoId => {
        if (!todoId) {
          return '';
        }
        const matched = parsedTodos.find(todo => todo.id === todoId);
        if (!matched) {
          return '';
        }
        const title = String(matched.title || '').trim();
        return title || '(未命名)';
      };

      state.history = Array.isArray(stored.history) ? stored.history.slice(0, 200) : [];
      state.history = state.history.map(entry => {
        const startedAt = entry.startedAt;
        const endedAt = entry.endedAt;
        let durationSeconds = entry.durationSeconds;

        if ((durationSeconds === undefined || durationSeconds === null) && startedAt && endedAt) {
          const start = new Date(startedAt);
          const end = new Date(endedAt);
          if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            durationSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
          }
        }

        return {
          startedAt,
          endedAt,
          category: entry.category,
          durationSeconds,
          result: entry.result,
          plannedMinutes: entry.plannedMinutes,
          tags: normalizeTags(entry.tags || []),
          todoId: entry.todoId,
          todoTitle:
            (typeof entry.todoTitle === 'string' ? entry.todoTitle.trim() : '') || resolveStoredTodoTitle(entry.todoId)
        };
      });
      state.activeSession = stored.activeSession && stored.activeSession.startedAt ? { ...stored.activeSession } : null;
      if (state.activeSession) {
        state.activeSession.tags = normalizeTags(state.activeSession.tags || [state.activeSession.category]);
        const storedTodoTitle =
          (typeof state.activeSession.todoTitle === 'string' ? state.activeSession.todoTitle.trim() : '') ||
          resolveStoredTodoTitle(state.activeSession.todoId);
        state.activeSession.todoTitle = storedTodoTitle || null;
      }
      if (typeof stored.activeTab === 'string') {
        if (stored.activeTab === 'logs' || stored.activeTab === 'history') {
          state.activeTab = 'logs';
        } else if (stored.activeTab === 'settings') {
          state.activeTab = 'settings';
        } else if (stored.activeTab === 'timeline') {
          state.activeTab = 'timeline';
        } else if (stored.activeTab === 'todo') {
          state.activeTab = 'todo';
        } else {
          state.activeTab = 'home';
        }
      }
      state.todos = parsedTodos;
      if (stored.activeTodoId && parsedTodos.some(todo => todo.id === stored.activeTodoId)) {
        state.activeTodoId = stored.activeTodoId;
      }
      if (stored.activeDiscussionTodoId && parsedTodos.some(todo => todo.id === stored.activeDiscussionTodoId)) {
        state.activeDiscussionTodoId = stored.activeDiscussionTodoId;
      }
    }
  } catch (error) {
    console.error('無法讀取 localStorage，改用預設值', error);
  }

  state.currentPhase = Phase.FOCUS;
  state.phaseTotalSeconds = getPhaseDuration(Phase.FOCUS);
  state.remainingSeconds = state.phaseTotalSeconds;

  if (elements.focusInput) {
    elements.focusInput.value = state.settings.focusMinutes;
  }
  if (elements.shortBreakInput) {
    elements.shortBreakInput.value = state.settings.shortBreakMinutes;
  }
  if (elements.longBreakInput) {
    elements.longBreakInput.value = state.settings.longBreakMinutes;
  }
  if (elements.longBreakIntervalInput) {
    elements.longBreakIntervalInput.value = state.settings.longBreakInterval;
  }
  if (elements.autoStartBreaks) {
    elements.autoStartBreaks.checked = state.settings.autoStartBreaks;
  }
}

function recordSessionStart() {
  if (state.currentPhase !== Phase.FOCUS) {
    return;
  }

  const isFreshCycle = state.remainingSeconds === state.phaseTotalSeconds;
  if (!isFreshCycle) {
    return;
  }

  state.activeSession = {
    startedAt: new Date().toISOString(),
    category: state.currentCategory,
    plannedMinutes: state.settings.focusMinutes,
    tags: normalizeTags([state.currentCategory]),
    todoTitle: null
  };

  if (state.activeTodoId) {
    const activeTodo = state.todos.find(todo => todo.id === state.activeTodoId);
    if (activeTodo) {
      state.activeSession.todoId = activeTodo.id;
      const combinedTags = normalizeTags([
        state.currentCategory,
        ...(activeTodo.tags || [])
      ]);
      state.activeSession.tags = combinedTags;
      const title = String(activeTodo.title || '').trim();
      state.activeSession.todoTitle = title || '(未命名)';
    }
  }

  renderHistoryList();
  persistState();
}

function finalizeActiveSession(result = 'completed') {
  if (!state.activeSession) {
    return;
  }

  const end = new Date();
  const start = new Date(state.activeSession.startedAt);
  const durationSeconds = Number.isNaN(start.getTime())
    ? 0
    : Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));

  const completedSession = {
    ...state.activeSession,
    endedAt: end.toISOString(),
    durationSeconds,
    result
  };

  completedSession.tags = normalizeTags(completedSession.tags || [completedSession.category]);
  completedSession.todoTitle = getDisplayTodoTitle(completedSession) || null;

  state.history.unshift(completedSession);
  if (state.history.length > 200) {
    state.history.length = 200;
  }

  if (completedSession.todoId && result === 'completed') {
    const todo = state.todos.find(item => item.id === completedSession.todoId);
    if (todo && !todo.completed) {
      todo.completed = true;
      todo.completedAt = completedSession.endedAt;
    }
  }

  state.activeSession = null;
  if (completedSession.todoId && completedSession.result === 'completed' && state.activeTodoId === completedSession.todoId) {
    setActiveTodo(null);
  } else {
    renderTodos();
    renderHistoryList();
    persistState();
  }
}

function renderHistoryList() {
  if (!elements.historyList) {
    return;
  }

  const { historyList } = elements;
  historyList.innerHTML = '';

  const items = [];

  if (state.activeSession) {
    const now = new Date();
    const start = new Date(state.activeSession.startedAt);
    const durationSeconds = Number.isNaN(start.getTime())
      ? 0
      : Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));

    const activeItem = document.createElement('li');
    activeItem.className = 'history__item history__item--active';

    const meta = document.createElement('div');
    meta.className = 'history__meta';
    const label = document.createElement('span');
    label.textContent = '進行中';
    label.style.fontWeight = '600';
    const categoryChip = document.createElement('span');
    categoryChip.className = 'history__category';
    categoryChip.textContent = state.activeSession.category || defaultCategories[0];
    meta.append(label, categoryChip);

    const timestamps = document.createElement('div');
    timestamps.className = 'history__timestamps';
    timestamps.innerHTML = `<span>開始：${formatDateTime(state.activeSession.startedAt)}</span>`;

    const duration = document.createElement('div');
    duration.className = 'history__duration';
    duration.textContent = `已進行：${formatDuration(durationSeconds)}`;

    const todoTitle = getDisplayTodoTitle(state.activeSession);

    if (state.activeSession.tags?.length) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'history__tags';
      tagsRow.textContent = `標籤：${normalizeTags(state.activeSession.tags).join(', ')}`;
      timestamps.appendChild(tagsRow);
    }

    const parts = [meta, timestamps];

    if (todoTitle) {
      const todoRow = document.createElement('div');
      todoRow.className = 'history__todo';
      todoRow.textContent = `工作：${todoTitle}`;
      parts.push(todoRow);
    }

    parts.push(duration);

    activeItem.append(...parts);
    items.push(activeItem);
  }

  state.history.forEach(session => {
    const item = document.createElement('li');
    item.className = 'history__item';

    const meta = document.createElement('div');
    meta.className = 'history__meta';

    const resultLabel = document.createElement('span');
    const resultText =
      session.result === 'completed'
        ? '已完成'
        : session.result === 'reset'
          ? '已重設'
          : session.result === 'updated'
            ? '已更新'
            : '已結束';
    resultLabel.textContent = resultText;
    resultLabel.style.fontWeight = '600';

    const categoryChip = document.createElement('span');
    categoryChip.className = 'history__category';
    categoryChip.textContent = session.category || defaultCategories[0];

    meta.append(resultLabel, categoryChip);

    const timestamps = document.createElement('div');
    timestamps.className = 'history__timestamps';
    timestamps.innerHTML = `
      <span>開始：${formatDateTime(session.startedAt)}</span>
      <span>結束：${formatDateTime(session.endedAt)}</span>
    `;

    const duration = document.createElement('div');
    duration.className = 'history__duration';
    duration.textContent = `耗時：${formatDuration(session.durationSeconds ?? 0)}`;

    const todoTitle = getDisplayTodoTitle(session);

    if (session.tags?.length) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'history__tags';
      tagsRow.textContent = `標籤：${normalizeTags(session.tags).join(', ')}`;
      timestamps.appendChild(tagsRow);
    }

    const parts = [meta, timestamps];

    if (todoTitle) {
      const todoRow = document.createElement('div');
      todoRow.className = 'history__todo';
      todoRow.textContent = `工作：${todoTitle}`;
      parts.push(todoRow);
    }

    parts.push(duration);

    item.append(...parts);
    items.push(item);
  });

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'history__empty';
    empty.textContent = '目前沒有紀錄';
    items.push(empty);
  }

  historyList.append(...items);
  renderTimeline();
}

function clearHistory() {
  state.history = [];
  persistState();
  renderHistoryList();
}

function renderTimeline() {
  if (!elements.timeline) {
    return;
  }

  const container = elements.timeline;
  container.innerHTML = '';

  const dayGroups = new Map();

  const ensureGroup = key => {
    if (!dayGroups.has(key)) {
      dayGroups.set(key, {
        sessions: [],
        todos: []
      });
    }
    return dayGroups.get(key);
  };

  const addSessionToGroup = session => {
    const key = getDateKey(session.startedAt || session.endedAt);
    if (!key) {
      return;
    }
    ensureGroup(key).sessions.push(session);
  };

  if (state.activeSession) {
    addSessionToGroup({
      ...state.activeSession,
      isActive: true
    });
  }

  state.history.forEach(session => {
    addSessionToGroup({
      ...session,
      isActive: false
    });
  });

  state.todos.forEach(todo => {
    if (!todo.completed || !todo.completedAt) {
      return;
    }
    const key = getDateKey(todo.completedAt);
    if (!key) {
      return;
    }
    ensureGroup(key).todos.push({
      id: todo.id,
      title: String(todo.title || '').trim() || '(未命名)',
      completedAt: todo.completedAt,
      tags: normalizeTags(todo.tags || [])
    });
  });

  if (!dayGroups.size) {
    const empty = document.createElement('p');
    empty.className = 'timeline__empty';
    empty.textContent = '目前沒有紀錄';
    container.appendChild(empty);
    return;
  }

  const sortedKeys = Array.from(dayGroups.keys()).sort((a, b) => (a < b ? 1 : -1));

  sortedKeys.forEach(key => {
    const group = dayGroups.get(key);
    const times = [];

    const pushTime = value => {
      if (Number.isFinite(value)) {
        times.push(value);
      }
    };

    const sessions = group.sessions
      .map(entry => {
        const startMs = getTimeValue(entry.startedAt) ?? getTimeValue(entry.endedAt);
        let endMs = entry.isActive ? Date.now() : getTimeValue(entry.endedAt);

        if (!Number.isFinite(endMs) && Number.isFinite(startMs) && Number.isFinite(entry.durationSeconds)) {
          endMs = startMs + entry.durationSeconds * 1000;
        }

        if (!Number.isFinite(startMs)) {
          return null;
        }

        if (!Number.isFinite(endMs) || endMs < startMs) {
          endMs = startMs;
        }

        pushTime(startMs);
        pushTime(endMs);

        return {
          ...entry,
          startMs,
          endMs
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startMs - b.startMs);

    const todos = group.todos
      .map(todo => {
        const completedMs = getTimeValue(todo.completedAt);
        if (!Number.isFinite(completedMs)) {
          return null;
        }
        pushTime(completedMs);
        return {
          ...todo,
          completedMs
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.completedMs - b.completedMs);

    if (!times.length) {
      return;
    }

    const minMs = Math.min(...times);
    const maxMsActual = Math.max(...times);
    const actualSpan = Math.max(maxMsActual - minMs, 1);
    const spanForHeight = Math.max(actualSpan, TIMELINE_MIN_SPAN_MS);
    const desiredHeight = (spanForHeight / 60000) * TIMELINE_PX_PER_MINUTE;
    const dayHeight = Math.max(desiredHeight, TIMELINE_MIN_DAY_HEIGHT);
    const scale = dayHeight / actualSpan;

    const daySection = document.createElement('div');
    daySection.className = 'timeline__day';

    const dateHeading = document.createElement('div');
    dateHeading.className = 'timeline__date';
    dateHeading.textContent = formatDayLabel(key);
    daySection.appendChild(dateHeading);

    const columnHead = document.createElement('div');
    columnHead.className = 'timeline__columns-head';
    columnHead.innerHTML = '<span>番茄鐘</span><span>待辦完成</span>';
    daySection.appendChild(columnHead);

    const columns = document.createElement('div');
    columns.className = 'timeline__columns';
    columns.style.setProperty('--timeline-day-height', `${dayHeight}px`);

    const sessionsColumn = document.createElement('div');
    sessionsColumn.className = 'timeline__column timeline__column--sessions';
    sessionsColumn.style.setProperty('--timeline-day-height', `${dayHeight}px`);

    const todosColumn = document.createElement('div');
    todosColumn.className = 'timeline__column timeline__column--todos';
    todosColumn.style.setProperty('--timeline-day-height', `${dayHeight}px`);

    const sessionWrappers = [];
    const todoEntries = [];

    const sessionLayouts = sessions.map(entry => {
      const startOffset = Math.max((entry.startMs - minMs) * scale, 0);
      const endOffset = Math.max((entry.endMs - minMs) * scale, startOffset);
      const baseHeight = Math.max(endOffset - startOffset, TIMELINE_MIN_SESSION_HEIGHT);
      return { entry, startOffset, baseHeight };
    });

    sessionLayouts.forEach(layout => {
      const { entry, startOffset, baseHeight } = layout;

      const wrapper = document.createElement('div');
      wrapper.className = 'timeline__session';
      if (entry.isActive) {
        wrapper.classList.add('timeline__session--active');
      }
      wrapper.style.top = `${startOffset}px`;
      wrapper.style.minHeight = `${baseHeight}px`;
      wrapper.dataset.initialTop = String(startOffset);
      wrapper.dataset.baseHeight = String(baseHeight);

      const bar = document.createElement('span');
      bar.className = 'timeline__session-bar';
      wrapper.appendChild(bar);

      const card = document.createElement('div');
      card.className = 'timeline__session-card';

      const heading = document.createElement('div');
      heading.className = 'timeline__heading';
      const rangeText = document.createElement('span');
      rangeText.className = 'timeline__range';
      const startLabel = formatTimeOfDay(entry.startedAt ?? entry.endedAt);
      const endLabel = entry.isActive
        ? '進行中'
        : entry.endedAt
          ? formatTimeOfDay(entry.endedAt)
          : formatTimeOfDay(entry.startedAt);
      rangeText.textContent = `${startLabel} - ${endLabel}`;

      const categoryChip = document.createElement('span');
      categoryChip.className = 'timeline__category';
      categoryChip.textContent = entry.category || defaultCategories[0];

      heading.append(rangeText, categoryChip);
      card.appendChild(heading);

      const details = document.createElement('div');
      details.className = 'timeline__details';

      const todoTitle = getDisplayTodoTitle(entry);
      if (todoTitle) {
        const todoRow = document.createElement('span');
        todoRow.className = 'timeline__todo';
        todoRow.textContent = `工作：${todoTitle}`;
        details.appendChild(todoRow);
      }

      if (entry.plannedMinutes) {
        const planned = document.createElement('span');
        planned.textContent = `預計：${entry.plannedMinutes} 分`;
        details.appendChild(planned);
      }

      if (entry.isActive) {
        const now = new Date();
        const start = new Date(entry.startedAt);
        const durationSeconds = Number.isNaN(start.getTime())
          ? 0
          : Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
        const durationEl = document.createElement('span');
        durationEl.textContent = `已進行：${formatDuration(durationSeconds)}`;
        details.appendChild(durationEl);

        const statusEl = document.createElement('span');
        statusEl.textContent = '狀態：進行中';
        details.appendChild(statusEl);
      } else {
        const durationEl = document.createElement('span');
        durationEl.textContent = `耗時：${formatDuration(entry.durationSeconds ?? 0)}`;
        details.appendChild(durationEl);

        const status = document.createElement('span');
        const label =
          entry.result === 'completed'
            ? '已完成'
            : entry.result === 'reset'
              ? '已重設'
              : entry.result === 'updated'
                ? '已更新'
                : '已結束';
        status.textContent = `狀態：${label}`;
        details.appendChild(status);
      }

      if (entry.tags?.length) {
        const tagsRow = document.createElement('span');
        tagsRow.className = 'timeline__tags';
        tagsRow.textContent = `標籤：${normalizeTags(entry.tags).join(', ')}`;
        details.appendChild(tagsRow);
      }

      card.appendChild(details);
      wrapper.appendChild(card);
      sessionsColumn.appendChild(wrapper);
      sessionWrappers.push({ wrapper, card, layout });
    });

    if (!sessions.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'timeline__placeholder';
      placeholder.textContent = '沒有時間紀錄';
      sessionsColumn.appendChild(placeholder);
    }

    const todoLayouts = todos.map(todo => ({
      todo,
      top: Math.max((todo.completedMs - minMs) * scale, 0)
    }));

    todoLayouts.forEach(layout => {
      const { todo, top } = layout;

      const item = document.createElement('div');
      item.className = 'timeline__todo-entry';
      item.style.top = `${top}px`;
      item.dataset.initialTop = String(top);

      const dot = document.createElement('span');
      dot.className = 'timeline__todo-dot';
      item.appendChild(dot);

      const card = document.createElement('div');
      card.className = 'timeline__todo-card';

      const timeLabel = document.createElement('span');
      timeLabel.className = 'timeline__todo-time';
      timeLabel.textContent = `完成：${formatTimeOfDay(todo.completedAt)}`;
      card.appendChild(timeLabel);

      const title = document.createElement('p');
      title.className = 'timeline__todo-title';
      title.textContent = todo.title;
      card.appendChild(title);

      if (todo.tags?.length) {
        const tags = document.createElement('span');
        tags.className = 'timeline__todo-tags';
        tags.textContent = `標籤：${normalizeTags(todo.tags).join(', ')}`;
        card.appendChild(tags);
      }

      item.appendChild(card);
      todosColumn.appendChild(item);
      todoEntries.push({ item, layout });
    });

    if (!todos.length) {
      const placeholder = document.createElement('div');
      placeholder.className = 'timeline__placeholder';
      placeholder.textContent = '沒有待辦完成';
      todosColumn.appendChild(placeholder);
    }

    columns.append(sessionsColumn, todosColumn);
    daySection.appendChild(columns);
    container.appendChild(daySection);

    requestAnimationFrame(() => {
      let requiredHeight = dayHeight;

      const sessionMeta = sessionWrappers
        .map(({ wrapper, card, layout }) => ({
          wrapper,
          card,
          initialTop: layout.startOffset,
          baseHeight: layout.baseHeight
        }))
        .sort((a, b) => a.initialTop - b.initialTop);

      let lastSessionBottom = -Infinity;
      sessionMeta.forEach(meta => {
        const { wrapper, card, initialTop, baseHeight } = meta;
        let top = initialTop;
        const measuredHeight = wrapper.offsetHeight;
        const cardHeight = card ? card.offsetHeight + 8 : 0;
        let height = Math.max(measuredHeight, cardHeight, baseHeight, TIMELINE_MIN_SESSION_HEIGHT);

        if (top < lastSessionBottom + TIMELINE_SESSION_GAP) {
          top = lastSessionBottom + TIMELINE_SESSION_GAP;
        }

        wrapper.style.top = `${top}px`;
        wrapper.style.minHeight = `${height}px`;
        wrapper.style.height = `${height}px`;

        lastSessionBottom = top + height;
        requiredHeight = Math.max(requiredHeight, lastSessionBottom);
      });

      const todoMeta = todoEntries
        .map(({ item, layout }) => ({
          item,
          initialTop: layout.top
        }))
        .sort((a, b) => a.initialTop - b.initialTop);

      let lastTodoBottom = -Infinity;
      todoMeta.forEach(meta => {
        const { item, initialTop } = meta;
        let top = initialTop;
        const actualHeight = item.offsetHeight || 0;

        if (top < lastTodoBottom + TIMELINE_TODO_GAP) {
          top = lastTodoBottom + TIMELINE_TODO_GAP;
        }

        item.style.top = `${top}px`;

        lastTodoBottom = top + actualHeight;
        requiredHeight = Math.max(requiredHeight, lastTodoBottom);
      });

      const finalHeight = Math.ceil(requiredHeight + 44);
      columns.style.height = `${finalHeight}px`;
      sessionsColumn.style.height = `${finalHeight}px`;
      todosColumn.style.height = `${finalHeight}px`;
    });
  });
}

function createTodoItem(todo) {
  const item = document.createElement('li');
  item.className = 'todo-item';
  item.dataset.id = todo.id;
  if (todo.completed) {
    item.classList.add('todo-item--completed');
  }

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(todo.completed);
  checkbox.dataset.action = 'toggle';
  item.appendChild(checkbox);

  const content = document.createElement('div');
  content.className = 'todo-item__content';

  const title = document.createElement('p');
  title.className = 'todo-item__title';
  title.textContent = todo.title || '(未命名)';
  content.appendChild(title);

  const meta = document.createElement('span');
  meta.className = 'todo-item__meta';
  meta.textContent = `新增：${formatDateTime(todo.createdAt)}`;
  content.appendChild(meta);

  if (todo.completed && todo.completedAt) {
    const completedMeta = document.createElement('span');
    completedMeta.className = 'todo-item__meta';
    completedMeta.textContent = `完成：${formatDateTime(todo.completedAt)}`;
    content.appendChild(completedMeta);
  }

  if (todo.tags?.length) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'todo-item__tags';
    normalizeTags(todo.tags).forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'todo-item__tag';
      chip.textContent = tag;
      tagsContainer.appendChild(chip);
    });
    content.appendChild(tagsContainer);
  }

  item.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'todo-item__actions';

  const discussionBtn = document.createElement('button');
  discussionBtn.type = 'button';
  discussionBtn.dataset.action = 'discussion';
  const discussionCount = Array.isArray(todo.discussion) ? todo.discussion.length : 0;
  discussionBtn.textContent = discussionCount ? `問題紀錄 (${discussionCount})` : '問題紀錄';
  actions.appendChild(discussionBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.dataset.action = 'remove';
  removeBtn.textContent = '刪除';
  actions.appendChild(removeBtn);

  if (!todo.completed) {
    const activateBtn = document.createElement('button');
    activateBtn.type = 'button';
    activateBtn.dataset.action = 'activate';
    activateBtn.textContent = state.activeTodoId === todo.id ? '已選擇' : '設為目前';
    if (state.activeTodoId === todo.id) {
      activateBtn.disabled = true;
    }
    actions.appendChild(activateBtn);
  }

  item.appendChild(actions);
  return item;
}

function renderTodos() {
  if (!elements.todoList) {
    return;
  }

  const list = elements.todoList;
  list.innerHTML = '';

  const activeTodos = state.todos.filter(todo => !todo.completed);
  const completedTodos = state.todos.filter(todo => todo.completed);

  if (!activeTodos.length && !completedTodos.length) {
    const empty = document.createElement('li');
    empty.className = 'todo-empty';
    empty.textContent = '目前沒有待辦事項';
    list.appendChild(empty);
    renderTagSuggestions();
    return;
  }

  const fragment = document.createDocumentFragment();

  const appendSection = (title, todos) => {
    if (!todos.length) {
      return;
    }

    const section = document.createElement('div');
    section.className = 'todo-section';

    const heading = document.createElement('h3');
    heading.className = 'todo-section__heading';
    heading.textContent = title;
    section.appendChild(heading);

    const items = document.createElement('div');
    items.className = 'todo-section__items';

    todos.forEach(todo => {
      items.appendChild(createTodoItem(todo));
    });

    section.appendChild(items);
    fragment.appendChild(section);
  };

  appendSection('待辦事項', activeTodos);
  appendSection('已完成', completedTodos);

  list.appendChild(fragment);
  renderTagSuggestions();
  updateActiveTodoUI();
  if (state.activeDiscussionTodoId) {
    renderTodoDiscussion();
  }
}

function renderTagSuggestions() {
  if (!elements.todoTagSuggestions) {
    return;
  }

  const container = elements.todoTagSuggestions;
  container.innerHTML = '';

  const suggestions = new Set();
  state.categories.forEach(category => suggestions.add(category));
  state.todos.forEach(todo => normalizeTags(todo.tags || []).forEach(tag => suggestions.add(tag)));
  if (state.currentCategory) {
    suggestions.add(state.currentCategory);
  }

  const tags = Array.from(suggestions).filter(Boolean).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const inputTags = new Set(getInputTags());

  if (!tags.length) {
    return;
  }

  tags.forEach(tag => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'todo-tag-chip';
    if (inputTags.has(tag)) {
      chip.classList.add('todo-tag-chip--active');
    }
    chip.dataset.tag = tag;
    chip.textContent = tag;
    container.appendChild(chip);
  });
}

function handleTagSuggestionClick(event) {
  const target = event.target.closest('.todo-tag-chip');
  if (!target) {
    return;
  }

  const { tag } = target.dataset;
  if (!tag) {
    return;
  }

  const current = new Set(getInputTags());
  if (current.has(tag)) {
    current.delete(tag);
  } else {
    current.add(tag);
  }

  setInputTags(Array.from(current));
}

function addTodo(title) {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }

  const tags = normalizeTags(getInputTags());
  if (!tags.length && state.currentCategory) {
    tags.push(state.currentCategory);
  }

  const todo = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: trimmed,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
    tags,
    discussion: []
  };

  state.todos.unshift(todo);
  persistState();
  renderTodos();
  if (elements.todoInput) {
    elements.todoInput.value = '';
  }
  setInputTags([]);
}

function toggleTodo(id) {
  const todo = state.todos.find(item => item.id === id);
  if (!todo) {
    return;
  }

  todo.completed = !todo.completed;
  todo.completedAt = todo.completed ? new Date().toISOString() : null;
  persistState();
  renderTodos();
  if (state.activeTodoId === id && todo.completed) {
    setActiveTodo(null);
  }
}

function removeTodo(id) {
  const index = state.todos.findIndex(item => item.id === id);
  if (index === -1) {
    return;
  }

  state.todos.splice(index, 1);
  if (state.activeDiscussionTodoId === id) {
    closeTodoDiscussion();
  }
  persistState();
  renderTodos();
  if (state.activeTodoId === id) {
    setActiveTodo(null);
  }
}

function clearCompletedTodos() {
  state.todos = state.todos.filter(todo => !todo.completed);
  if (state.activeDiscussionTodoId && !state.todos.some(todo => todo.id === state.activeDiscussionTodoId)) {
    closeTodoDiscussion();
  }
  persistState();
  renderTodos();
  if (state.activeTodoId && !state.todos.some(todo => todo.id === state.activeTodoId)) {
    setActiveTodo(null);
  }
}

function setActiveTodo(id) {
  if (id && !state.todos.some(todo => todo.id === id)) {
    id = null;
  }

  state.activeTodoId = id;

  const activeTodo = id ? state.todos.find(todo => todo.id === id) : null;

  if (activeTodo) {
    if (activeTodo.tags?.length) {
      const matchingCategory = normalizeTags(activeTodo.tags).find(tag => state.categories.includes(tag));
      if (matchingCategory) {
        state.currentCategory = matchingCategory;
        renderCategoryList();
        updatePhaseVisuals();
      }
    }
    setInputTags(activeTodo.tags || []);
  } else {
    setInputTags([]);
  }

  renderTodos();
  renderHistoryList();
  persistState();
}

function updateActiveTodoUI() {
  if (!elements.currentTodoTitle) {
    return;
  }

  const activeTodo = state.activeTodoId ? state.todos.find(todo => todo.id === state.activeTodoId) : null;

  elements.currentTodoTitle.textContent = activeTodo ? activeTodo.title : '未選擇';

  if (elements.currentTodoTags) {
    elements.currentTodoTags.textContent = activeTodo && activeTodo.tags?.length
      ? `標籤：${normalizeTags(activeTodo.tags).join(', ')}`
      : '';
  }

  if (elements.clearActiveTodoBtn) {
    elements.clearActiveTodoBtn.hidden = !activeTodo;
  }

  if (elements.categorySelect && activeTodo) {
    renderCategoryList();
  }

  if (elements.todoList) {
    elements.todoList.querySelectorAll('.todo-item').forEach(item => {
      item.classList.toggle('todo-item--active', item.dataset.id === state.activeTodoId);
    });
  }
}

function getActiveDiscussionTodo() {
  if (!state.activeDiscussionTodoId) {
    return null;
  }
  return state.todos.find(todo => todo.id === state.activeDiscussionTodoId) || null;
}

function openTodoDiscussion(id) {
  if (!elements.todoDiscussionOverlay) {
    return;
  }

  if (!state.todos.some(todo => todo.id === id)) {
    return;
  }

  state.activeDiscussionTodoId = id;
  renderTodoDiscussion({ focusInput: true, scrollToEnd: true });
  if (elements.todoDiscussionInput) {
    elements.todoDiscussionInput.value = '';
  }
  persistState();
}

function closeTodoDiscussion() {
  state.activeDiscussionTodoId = null;
  if (elements.todoDiscussionOverlay) {
    elements.todoDiscussionOverlay.hidden = true;
  }
  document.body.classList.remove('task-dialog-open');
  if (elements.todoDiscussionInput) {
    elements.todoDiscussionInput.value = '';
  }
  persistState();
}

function renderTodoDiscussion({ focusInput = false, scrollToEnd = false } = {}) {
  const overlay = elements.todoDiscussionOverlay;
  const titleEl = elements.todoDiscussionTitle;
  const list = elements.todoDiscussionList;
  const empty = elements.todoDiscussionEmpty;
  if (!overlay || !titleEl || !list || !empty) {
    return;
  }

  const todo = getActiveDiscussionTodo();

  if (!todo) {
    overlay.hidden = true;
    document.body.classList.remove('task-dialog-open');
    if (state.activeDiscussionTodoId) {
      state.activeDiscussionTodoId = null;
      persistState();
    }
    return;
  }

  const normalized = normalizeDiscussion(todo.discussion || []);
  todo.discussion = normalized;

  overlay.hidden = false;
  document.body.classList.add('task-dialog-open');

  titleEl.textContent = todo.title || '(未命名)';
  list.innerHTML = '';

  if (!normalized.length) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    normalized.forEach(entry => {
      const item = document.createElement('li');
      item.className = 'task-discussion__item';
      item.dataset.id = entry.id;

      const meta = document.createElement('div');
      meta.className = 'task-discussion__meta';

      const time = document.createElement('span');
      time.textContent = formatDateTime(entry.createdAt);
      meta.appendChild(time);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'task-discussion__remove';
      remove.dataset.action = 'delete-discussion';
      remove.dataset.id = entry.id;
      remove.textContent = '刪除';
      meta.appendChild(remove);

      const text = document.createElement('p');
      text.className = 'task-discussion__text';
      text.textContent = entry.text;

      item.append(meta, text);
      list.appendChild(item);
    });
  }

  if (focusInput && elements.todoDiscussionInput) {
    elements.todoDiscussionInput.focus();
  }

  if (scrollToEnd && list.lastElementChild) {
    list.lastElementChild.scrollIntoView({ block: 'end' });
  }
}

function handleTodoDiscussionSubmit(event) {
  event.preventDefault();

  const todo = getActiveDiscussionTodo();
  if (!todo || !elements.todoDiscussionInput) {
    return;
  }

  const value = elements.todoDiscussionInput.value.trim();
  if (!value) {
    elements.todoDiscussionInput.focus();
    return;
  }

  const newEntry = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: value,
    createdAt: new Date().toISOString()
  };

  todo.discussion = normalizeDiscussion([...(todo.discussion || []), newEntry]);
  elements.todoDiscussionInput.value = '';
  renderTodoDiscussion({ focusInput: true, scrollToEnd: true });
  renderTodos();
  persistState();
}

function handleTodoDiscussionListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.action !== 'delete-discussion') {
    return;
  }

  const todo = getActiveDiscussionTodo();
  if (!todo) {
    return;
  }

  const { id } = target.dataset;
  if (!id) {
    return;
  }

  todo.discussion = normalizeDiscussion((todo.discussion || []).filter(entry => entry.id !== id));
  renderTodoDiscussion();
  renderTodos();
  persistState();
}

function handleTodoDiscussionOverlayClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target === elements.todoDiscussionOverlay || target.dataset.dialogClose !== undefined) {
    closeTodoDiscussion();
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && !elements.todoDiscussionOverlay?.hidden) {
    closeTodoDiscussion();
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.max(totalSeconds % 60, 0)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getPhaseDuration(phase) {
  const { focusMinutes, shortBreakMinutes, longBreakMinutes } = state.settings;

  if (phase === Phase.FOCUS) {
    return focusMinutes * 60;
  }
  if (phase === Phase.SHORT_BREAK) {
    return shortBreakMinutes * 60;
  }
  return longBreakMinutes * 60;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return '—';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '—';
  }

  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;

  return `${minutes} 分 ${remainingSeconds.toString().padStart(2, '0')} 秒`;
}

function formatTimeOfDay(isoString) {
  if (!isoString) {
    return '—';
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('zh-TW', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatDayLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return new Intl.DateTimeFormat('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).format(date);
}

function updatePhaseVisuals() {
  if (elements.phaseChip) {
    elements.phaseChip.textContent = phaseLabels[state.currentPhase];
  }
  elements.startBtn.textContent = 'Start';
  document.body.dataset.phase = state.currentPhase;
}

function updateProgress() {
  if (state.phaseTotalSeconds <= 0) {
    elements.progressBar.style.width = '100%';
    return;
  }

  const progress = 1 - state.remainingSeconds / state.phaseTotalSeconds;
  elements.progressBar.style.width = `${Math.min(Math.max(progress, 0), 1) * 100}%`;
}

function updateTimeDisplay() {
  elements.timeDisplay.textContent = formatTime(state.remainingSeconds);
  updateProgress();
}

function updateControls() {
  elements.startBtn.disabled = state.isRunning;
  elements.pauseBtn.disabled = !state.isRunning;
  elements.subtractTimeBtn.disabled = state.remainingSeconds <= 60;
}

function tick() {
  state.remainingSeconds -= 1;
  updateTimeDisplay();

  if (state.remainingSeconds <= 0) {
    handlePhaseCompletion();
  }
}

function startTimer() {
  if (state.isRunning) {
    return;
  }

  recordSessionStart();
  state.isRunning = true;
  state.timerId = setInterval(tick, 1000);
  updateControls();
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  state.isRunning = false;
  updateControls();
}

function pauseTimer() {
  if (!state.isRunning) {
    return;
  }

  stopTimer();
  elements.startBtn.textContent = 'Resume';
}

function resetTimer() {
  const phase = state.currentPhase;
  if (phase === Phase.FOCUS) {
    finalizeActiveSession('reset');
  }
  stopTimer();
  setPhase(phase, { keepCompleted: true });
}

function setPhase(phase, { keepCompleted = false, startRunning = false } = {}) {
  state.currentPhase = phase;

  if (!keepCompleted && phase === Phase.FOCUS) {
    state.completedFocusSessions = 0;
  }

  state.phaseTotalSeconds = getPhaseDuration(phase);
  state.remainingSeconds = state.phaseTotalSeconds;

  updatePhaseVisuals();
  updateTimeDisplay();
  stopTimer();

  if (startRunning) {
    startTimer();
  }
}

function handlePhaseCompletion() {
  stopTimer();

  if (state.currentPhase === Phase.FOCUS) {
    finalizeActiveSession('completed');
    state.completedFocusSessions += 1;
    const shouldTakeLongBreak =
      state.completedFocusSessions % state.settings.longBreakInterval === 0;

    setPhase(shouldTakeLongBreak ? Phase.LONG_BREAK : Phase.SHORT_BREAK, {
      keepCompleted: true,
      startRunning: state.settings.autoStartBreaks
    });
  } else {
    setPhase(Phase.FOCUS, { keepCompleted: true });
  }
}

function adjustTime(deltaSeconds) {
  const newRemaining = Math.max(state.remainingSeconds + deltaSeconds, 60);
  const change = newRemaining - state.remainingSeconds;
  state.remainingSeconds = newRemaining;
  state.phaseTotalSeconds = Math.max(state.phaseTotalSeconds + change, state.remainingSeconds);
  updateTimeDisplay();
}

function updateCategorySelect() {
  if (!elements.categorySelect) {
    return;
  }

  const { categorySelect } = elements;
  categorySelect.innerHTML = '';

  state.categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.appendChild(option);
  });

  if (!state.categories.includes(state.currentCategory)) {
    state.currentCategory = state.categories[0] || '';
  }

  if (state.currentCategory) {
    categorySelect.value = state.currentCategory;
  }
}

function renderCategoryList() {
  if (!elements.categoryList) {
    return;
  }

  const { categoryList } = elements;
  categoryList.innerHTML = '';

  state.categories.forEach(category => {
    const item = document.createElement('li');
    item.className = 'category-list__item';
    if (category === state.currentCategory) {
      item.classList.add('category-list__item--active');
    }

    const name = document.createElement('span');
    name.className = 'category-list__name';
    name.textContent = category;
    name.title = category;
    item.appendChild(name);

    const isDefaultCategory = defaultCategories.includes(category);
    const canRemove = state.categories.length > 1 && !isDefaultCategory;
    if (canRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'category-remove-btn';
      removeBtn.dataset.category = category;
      removeBtn.textContent = '移除';
      item.appendChild(removeBtn);
    }

    categoryList.appendChild(item);
  });

  if (!categoryList.children.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'category-empty';
    emptyItem.textContent = '尚未新增分類';
    categoryList.appendChild(emptyItem);
  }

}

function updateCategoryUI() {
  updateCategorySelect();
  renderCategoryList();
  renderTagSuggestions();
}

function addCategory(value) {
  const name = value.trim();
  if (!name || state.categories.includes(name)) {
    return;
  }

  state.categories.push(name);
  state.currentCategory = name;
  if (state.activeSession) {
    state.activeSession.category = state.currentCategory;
  }
  updateCategoryUI();
  elements.categoryInput.value = '';
  if (elements.categorySelect) {
    elements.categorySelect.focus();
  }
  persistState();
  renderHistoryList();
}

function removeCategory(name) {
  if (!state.categories.includes(name) || state.categories.length === 1) {
    return;
  }

  state.categories = state.categories.filter(category => category !== name);

  if (state.currentCategory === name) {
    state.currentCategory = state.categories[0] || '';
    if (state.activeSession) {
      state.activeSession.category = state.currentCategory;
      const currentTags = normalizeTags(state.activeSession.tags || []);
      currentTags.unshift(state.currentCategory);
      state.activeSession.tags = normalizeTags(currentTags);
    }
  }

  updateCategoryUI();
  persistState();
  renderHistoryList();
}

function handleCategorySubmit(event) {
  event.preventDefault();
  addCategory(elements.categoryInput.value);
}

function handleCategoryChange(event) {
  const { value } = event.target;
  if (!state.categories.includes(value)) {
    return;
  }

  state.currentCategory = value;
  renderCategoryList();
  if (state.activeSession) {
    state.activeSession.category = value;
    const currentTags = normalizeTags(state.activeSession.tags || []);
    currentTags.unshift(value);
    state.activeSession.tags = normalizeTags(currentTags);
    renderHistoryList();
  }
  persistState();
}

function handleTodoSubmit(event) {
  event.preventDefault();
  if (!elements.todoInput) {
    return;
  }
  addTodo(elements.todoInput.value || '');
}

function handleTodoListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const item = target.closest('.todo-item');
  if (!item) {
    return;
  }

  const { id } = item.dataset;
  if (!id) {
    return;
  }

  const action = target.dataset.action;

  if (action === 'toggle') {
    return;
  } else if (action === 'remove') {
    removeTodo(id);
  } else if (action === 'activate') {
    setActiveTodo(id);
  } else if (action === 'discussion') {
    openTodoDiscussion(id);
  }
}

function handleCategoryListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const { category } = target.dataset;
  if (!category) {
    return;
  }

  removeCategory(category);
}

function handleTabClick(event) {
  const target = event.currentTarget;
  const tab = target?.dataset?.tab;
  if (!tab) {
    return;
  }

  setActiveTab(tab);
  persistState();
}

function setActiveTab(tab) {
  let targetTab = 'home';
  if (tab === 'settings' || tab === 'logs' || tab === 'timeline' || tab === 'todo') {
    targetTab = tab;
  }
  state.activeTab = targetTab;

  elements.homeTabs.forEach(button => {
    const isActive = button.dataset.tab === targetTab;
    button.classList.toggle('app-tabs__tab--active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  elements.homePanels.forEach(panel => {
    const isActive = panel.dataset.panel === targetTab;
    panel.classList.toggle('app-panel--active', isActive);
    panel.hidden = !isActive;
  });

  if (targetTab === 'todo') {
    renderTagSuggestions();
  }
}

function applySettings(event) {
  event.preventDefault();

  const focusMinutes = clampNumber(elements.focusInput.value, 1, 120, defaults.focusMinutes);
  const shortBreakMinutes = clampNumber(
    elements.shortBreakInput.value,
    1,
    60,
    defaults.shortBreakMinutes
  );
  const longBreakMinutes = clampNumber(
    elements.longBreakInput.value,
    1,
    90,
    defaults.longBreakMinutes
  );
  const longBreakInterval = clampNumber(
    elements.longBreakIntervalInput.value,
    1,
    12,
    defaults.longBreakInterval
  );

  state.settings = {
    focusMinutes,
    shortBreakMinutes,
    longBreakMinutes,
    longBreakInterval,
    autoStartBreaks: elements.autoStartBreaks.checked
  };

  if (state.activeSession) {
    state.activeSession.plannedMinutes = focusMinutes;
  }

  elements.focusInput.value = focusMinutes;
  elements.shortBreakInput.value = shortBreakMinutes;
  elements.longBreakInput.value = longBreakMinutes;
  elements.longBreakIntervalInput.value = longBreakInterval;
  elements.autoStartBreaks.checked = state.settings.autoStartBreaks;

  if (state.activeSession && state.currentPhase === Phase.FOCUS) {
    finalizeActiveSession('updated');
  }

  stopTimer();
  if (state.currentPhase === Phase.FOCUS) {
    setPhase(Phase.FOCUS, { keepCompleted: true });
  } else if (state.currentPhase === Phase.SHORT_BREAK) {
    setPhase(Phase.SHORT_BREAK, { keepCompleted: true });
  } else {
    setPhase(Phase.LONG_BREAK, { keepCompleted: true });
  }

  persistState();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return fallback;
  }
  return Math.min(Math.max(number, min), max);
}

function bindEvents() {
  elements.startBtn.addEventListener('click', startTimer);
  elements.pauseBtn.addEventListener('click', pauseTimer);
  elements.resetBtn.addEventListener('click', resetTimer);
  elements.addTimeBtn.addEventListener('click', () => adjustTime(60));
  elements.subtractTimeBtn.addEventListener('click', () => adjustTime(-60));
  elements.settingsForm.addEventListener('submit', applySettings);
  elements.categoryForm.addEventListener('submit', handleCategorySubmit);
  elements.categorySelect.addEventListener('change', handleCategoryChange);
  elements.categoryList.addEventListener('click', handleCategoryListClick);
  if (elements.clearHistoryBtn) {
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
  }
  if (elements.todoForm) {
    elements.todoForm.addEventListener('submit', handleTodoSubmit);
  }
  if (elements.todoList) {
    elements.todoList.addEventListener('click', handleTodoListClick);
    elements.todoList.addEventListener('change', event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
        return;
      }
      const item = target.closest('.todo-item');
      if (!item?.dataset?.id) {
        return;
      }
      toggleTodo(item.dataset.id);
    });
  }
  if (elements.clearTodosBtn) {
    elements.clearTodosBtn.addEventListener('click', clearCompletedTodos);
  }
  if (elements.todoTagSuggestions) {
    elements.todoTagSuggestions.addEventListener('click', handleTagSuggestionClick);
  }
  if (elements.todoTagsInput) {
    elements.todoTagsInput.addEventListener('input', renderTagSuggestions);
  }
  if (elements.clearActiveTodoBtn) {
    elements.clearActiveTodoBtn.addEventListener('click', () => setActiveTodo(null));
  }
  if (elements.todoDiscussionForm) {
    elements.todoDiscussionForm.addEventListener('submit', handleTodoDiscussionSubmit);
  }
  if (elements.todoDiscussionList) {
    elements.todoDiscussionList.addEventListener('click', handleTodoDiscussionListClick);
  }
  if (elements.todoDiscussionClose) {
    elements.todoDiscussionClose.addEventListener('click', closeTodoDiscussion);
  }
  if (elements.todoDiscussionOverlay) {
    elements.todoDiscussionOverlay.addEventListener('click', handleTodoDiscussionOverlayClick);
  }
  elements.homeTabs.forEach(tab => tab.addEventListener('click', handleTabClick));
  document.addEventListener('keydown', handleGlobalKeydown);
}

function init() {
  loadPersistedState();
  bindEvents();
  updatePhaseVisuals();
  updateTimeDisplay();
  updateControls();
  updateCategoryUI();
  renderHistoryList();
  renderTodos();
  updateActiveTodoUI();
  setActiveTab(state.activeTab);
  persistState();
}

init();
