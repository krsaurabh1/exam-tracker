(function () {
  'use strict';

  var DATA_URL = 'schools.json';
  var TODO_URL = 'todo.json';
  var TODO_STORAGE_KEY = 'exam-tracker.todo';
  var MAX_SERIES = 8; // matches the --series-1..8 slots defined in style.css

  // Only the To Do note is editable on this page — Schools/Scores each own
  // their own data and their own #edit flow.
  var isEditor = location.hash.indexOf('edit') !== -1 ||
    location.search.indexOf('edit') !== -1;

  var themeToggle = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var noticeEl = document.getElementById('notice');
  var upcomingListEl = document.getElementById('upcoming-list');
  var undatedSection = document.getElementById('undated-section');
  var undatedListEl = document.getElementById('undated-list');
  var publishButton = document.getElementById('publish');
  var todoToolbar = document.getElementById('todo-toolbar');
  var todoFontSelect = document.getElementById('todo-font');
  var todoHint = document.getElementById('todo-hint');
  var todoContent = document.getElementById('todo-content');
  var gateForm = document.getElementById('gate-form');
  var gatePasswordInput = document.getElementById('gate-password');
  var gateError = document.getElementById('gate-error');

  var readRaw = Common.readRaw;
  var writeRaw = Common.writeRaw;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function setNotice(html) {
    noticeEl.innerHTML = html;
    noticeEl.hidden = false;
  }

  function setTodoHint(html) {
    todoHint.innerHTML = html;
    todoHint.hidden = false;
  }

  function daysUntil(sortDate) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var target = new Date(sortDate + 'T00:00:00');
    return Math.round((target - today) / 86400000);
  }

  function describeDays(n) {
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return 'In ' + n + ' days';
  }

  // Same school always gets the same color: assigned by its position in the
  // schools.json array, using the same validated --series-1..8 categorical
  // colors the score chart uses (see the note in scores.js).
  function buildColorMap(schools) {
    var map = {};
    schools.forEach(function (school, index) {
      map[school.id] = 'var(--series-' + ((index % MAX_SERIES) + 1) + ')';
    });
    return map;
  }

  function schoolBadge(school, colorMap) {
    return '' +
      '<span class="badge">' +
      '<span class="badge-dot" style="background:' + (colorMap[school.id] || 'var(--muted)') + '"></span>' +
      esc(school.name || 'Untitled school') +
      '</span>';
  }

  function renderUpcomingItem(item, colorMap) {
    var n = daysUntil(item.stage.sortDate);
    return '' +
      '<a class="upcoming-item" href="schools.html#school-' + esc(item.school.id) + '">' +
      '<div class="upcoming-when">' +
      '<span class="days-until">' + esc(describeDays(n)) + '</span>' +
      '<span class="upcoming-date">' + esc(item.stage.date) + '</span>' +
      '</div>' +
      '<div class="upcoming-what">' +
      schoolBadge(item.school, colorMap) +
      '<span class="upcoming-label">' + esc(item.stage.label || 'Untitled') + '</span>' +
      '</div>' +
      '</a>';
  }

  function renderUndatedItem(school, colorMap) {
    return '' +
      '<a class="upcoming-item" href="schools.html#school-' + esc(school.id) + '">' +
      '<div class="upcoming-what">' +
      schoolBadge(school, colorMap) +
      '<span class="upcoming-label muted">Add key dates on the Schools page &#8594;</span>' +
      '</div>' +
      '</a>';
  }

  function render(schools) {
    var todayStr = new Date().toISOString().slice(0, 10);
    var colorMap = buildColorMap(schools);
    var upcoming = [];
    var undatedSchools = [];

    schools.forEach(function (school) {
      var hasDatedStage = false;
      school.stages.forEach(function (stage) {
        if (stage.sortDate) {
          hasDatedStage = true;
          if (stage.sortDate >= todayStr) {
            upcoming.push({ school: school, stage: stage });
          }
        }
      });
      if (!hasDatedStage) undatedSchools.push(school);
    });

    upcoming.sort(function (a, b) {
      return a.stage.sortDate < b.stage.sortDate ? -1 : a.stage.sortDate > b.stage.sortDate ? 1 : 0;
    });

    upcomingListEl.innerHTML = upcoming.length ?
      upcoming.map(function (item) { return renderUpcomingItem(item, colorMap); }).join('') :
      '<p class="empty">No upcoming dates. Add some on the <a href="schools.html">Schools</a> page.</p>';

    if (undatedSchools.length) {
      undatedSection.hidden = false;
      undatedListEl.innerHTML = undatedSchools.map(function (school) { return renderUndatedItem(school, colorMap); }).join('');
    }
  }

  // --- To Do note -----------------------------------------------------------
  // A small contenteditable box. Typed formatting only ever produces the tags
  // below (document.execCommand's legacy behavior); this sanitizer is
  // defense-in-depth against anything pasted in, run before every save.

  var TODO_ALLOWED_TAGS = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, BR: 1, P: 1, DIV: 1, UL: 1, OL: 1, LI: 1, FONT: 1, SPAN: 1 };
  var TODO_STRIP_ENTIRELY = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1 };

  function sanitizeTodoNode(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) {
        var tag = child.tagName;
        if (TODO_STRIP_ENTIRELY[tag]) {
          node.removeChild(child);
          return;
        }
        Array.prototype.slice.call(child.attributes).forEach(function (attr) {
          if (!(tag === 'FONT' && attr.name === 'face')) child.removeAttribute(attr.name);
        });
        sanitizeTodoNode(child);
        if (!TODO_ALLOWED_TAGS[tag]) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        }
      } else if (child.nodeType !== 3) {
        node.removeChild(child);
      }
    });
  }

  function sanitizeTodoHtml(raw) {
    var container = document.createElement('div');
    container.innerHTML = raw || '';
    sanitizeTodoNode(container);
    return container.innerHTML;
  }

  function loadTodo() {
    var raw = readRaw(TODO_STORAGE_KEY);
    if (!raw) return '';
    try {
      var parsed = JSON.parse(raw);
      return typeof parsed.html === 'string' ? sanitizeTodoHtml(parsed.html) : '';
    } catch (err) {
      return '';
    }
  }

  function saveTodo() {
    if (!isEditor) return;
    writeRaw(TODO_STORAGE_KEY, JSON.stringify({ html: todoContent.innerHTML }));
  }

  var savedRange = null;
  function saveSelection() {
    var sel = window.getSelection();
    if (sel.rangeCount > 0) savedRange = sel.getRangeAt(0);
  }
  function restoreSelection() {
    if (!savedRange) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  if (isEditor) {
    todoContent.addEventListener('mouseup', saveSelection);
    todoContent.addEventListener('keyup', saveSelection);

    todoContent.addEventListener('paste', function (event) {
      event.preventDefault();
      var text = (event.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    todoContent.addEventListener('input', function () {
      sanitizeTodoNode(todoContent);
      saveTodo();
    });

    todoToolbar.addEventListener('mousedown', function (event) {
      if (event.target.closest('.todo-btn')) event.preventDefault();
    });

    todoToolbar.addEventListener('click', function (event) {
      var button = event.target.closest('.todo-btn');
      if (!button) return;
      restoreSelection();
      todoContent.focus();
      document.execCommand(button.dataset.command, false, null);
      saveTodo();
    });

    todoFontSelect.addEventListener('change', function () {
      if (!todoFontSelect.value) return;
      restoreSelection();
      todoContent.focus();
      document.execCommand('fontName', false, todoFontSelect.value);
      todoFontSelect.value = '';
      saveTodo();
    });

    publishButton.addEventListener('click', function () {
      var html = sanitizeTodoHtml(todoContent.innerHTML);
      Common.downloadJson('todo.json', { publishedAt: new Date().toISOString(), html: html });
      setTodoHint(
        '<strong>Downloaded <code>todo.json</code>.</strong>' +
        '<ol><li>Move it into your site folder, replacing the old <code>todo.json</code>.</li>' +
        '<li>Re-upload the folder to your host.</li>' +
        '<li>Family members reload the link to see the update.</li></ol>'
      );
    });
  }

  function startTodo() {
    if (!isEditor) {
      Common.fetchJson(TODO_URL).then(function (data) {
        var html = sanitizeTodoHtml(data && data.html);
        todoContent.innerHTML = html || '<span class="muted">Nothing here yet.</span>';
      }).catch(function () {
        todoContent.innerHTML = '<span class="muted">Nothing here yet.</span>';
      });
      return;
    }

    todoContent.contentEditable = 'true';
    publishButton.hidden = false;
    todoToolbar.hidden = false;
    setTodoHint('<strong>Edit mode.</strong> Changes are saved in this browser only. Click <strong>Publish To Do</strong> to update the shared page.');

    var localHtml = loadTodo();
    if (localHtml) {
      todoContent.innerHTML = localHtml;
      return;
    }

    Common.fetchJson(TODO_URL).then(function (data) {
      var html = sanitizeTodoHtml(data && data.html);
      if (html) {
        todoContent.innerHTML = html;
        saveTodo();
      }
    }).catch(function () {});
  }

  function startApp() {
    Common.initTheme({ themeToggle: themeToggle, themeLabel: themeLabel });
    startTodo();

    Common.fetchJson(DATA_URL).then(function (data) {
      var schools = data && Array.isArray(data.schools) ? data.schools : [];
      render(schools);
      if (data && data.publishedAt) {
        setNotice('<strong>Read-only view.</strong>' + Common.describePublishTime(data.publishedAt));
      }
    }).catch(function () {
      setNotice(
        '<strong>Could not load school data.</strong> ' +
        'Add or publish schools on the <a href="schools.html">Schools</a> page first.'
      );
      upcomingListEl.innerHTML = '';
    });
  }

  Common.initGate({
    gateForm: gateForm,
    gatePasswordInput: gatePasswordInput,
    gateError: gateError
  }, startApp);
})();
