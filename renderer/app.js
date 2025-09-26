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
  activeTab: 'home'
};

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

function persistState() {
  const payload = {
    settings: state.settings,
    categories: state.categories,
    currentCategory: state.currentCategory,
    history: state.history,
    activeSession: state.activeSession,
    activeTab: state.activeTab
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
          result: entry.result
        };
      });
      state.activeSession = stored.activeSession && stored.activeSession.startedAt ? stored.activeSession : null;
      if (typeof stored.activeTab === 'string') {
        if (stored.activeTab === 'logs' || stored.activeTab === 'history') {
          state.activeTab = 'logs';
        } else if (stored.activeTab === 'settings') {
          state.activeTab = 'settings';
        } else {
          state.activeTab = 'home';
        }
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
    plannedMinutes: state.settings.focusMinutes
  };

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

  state.history.unshift(completedSession);
  if (state.history.length > 200) {
    state.history.length = 200;
  }

  state.activeSession = null;
  renderHistoryList();
  persistState();
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

    activeItem.append(meta, timestamps, duration);
    items.push(activeItem);
  }

  state.history.forEach(session => {
    const item = document.createElement('li');
    item.className = 'history__item';

    const meta = document.createElement('div');
    meta.className = 'history__meta';

    const resultLabel = document.createElement('span');
    resultLabel.textContent = session.result === 'completed' ? '已完成' : session.result === 'reset' ? '已重設' : '已結束';
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

    item.append(meta, timestamps, duration);
    items.push(item);
  });

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'history__empty';
    empty.textContent = '目前沒有紀錄';
    items.push(empty);
  }

  historyList.append(...items);
}

function clearHistory() {
  state.history = [];
  persistState();
  renderHistoryList();
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
    renderHistoryList();
  }
  persistState();
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
  if (tab === 'settings' || tab === 'logs') {
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
  elements.homeTabs.forEach(tab => tab.addEventListener('click', handleTabClick));
}

function init() {
  loadPersistedState();
  bindEvents();
  updatePhaseVisuals();
  updateTimeDisplay();
  updateControls();
  updateCategoryUI();
  renderHistoryList();
  setActiveTab(state.activeTab);
  persistState();
}

init();
