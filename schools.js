(function () {
  'use strict';

  var STORAGE_KEY = 'exam-tracker.schools';
  var DATA_URL = 'schools.json';

  // Field captions are shared across every school card (like a spreadsheet
  // header row), so they're edited once here rather than per school.
  var DEFAULT_LABELS = {
    registered: 'Registered?',
    nextVisit: 'Next visit',
    scholarships: 'Scholarships (Art/DT)',
    moreInfoUrl: 'More info',
    generalNotes: 'General notes',
    keyDatesHeading: 'Key dates',
    stageLabel: 'Label',
    stageDate: 'Date',
    stageNotes: 'Notes'
  };

  var isEditor = location.hash.indexOf('edit') !== -1 ||
    location.search.indexOf('edit') !== -1;
  document.body.dataset.mode = isEditor ? 'edit' : 'view';

  var listEl = document.getElementById('schools-list');
  var addSchoolToolbar = document.getElementById('add-school-toolbar');
  var addSchoolButton = document.getElementById('add-school');
  var labelEditorSection = document.getElementById('label-editor');
  var labelEditorFields = document.getElementById('label-editor-fields');
  var themeToggle = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var noticeEl = document.getElementById('notice');
  var publishButton = document.getElementById('publish');
  var gateOverlay = document.getElementById('access-gate');
  var gateForm = document.getElementById('gate-form');
  var gatePasswordInput = document.getElementById('gate-password');
  var gateError = document.getElementById('gate-error');

  var readRaw = Common.readRaw;
  var writeRaw = Common.writeRaw;
  var makeId = Common.makeId;

  var loaded = isEditor ? load() : { schools: [], fieldLabels: DEFAULT_LABELS };
  var schools = loaded.schools;
  var fieldLabels = loaded.fieldLabels;
  var uidCounter = 0;

  // Collapsed by default; tracked separately from `schools` so a card's
  // open/closed state survives the full re-renders triggered elsewhere
  // (e.g. typing in the field-name editor re-renders every card).
  var openSchools = {};

  // --- Persistence -----------------------------------------------------------

  function normalizeStage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : makeId(),
      label: typeof raw.label === 'string' ? raw.label : '',
      date: typeof raw.date === 'string' ? raw.date : '',
      sortDate: typeof raw.sortDate === 'string' ? raw.sortDate : '',
      notes: typeof raw.notes === 'string' ? raw.notes : ''
    };
  }

  function normalizeSchool(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var stages = Array.isArray(raw.stages) ? raw.stages.map(normalizeStage).filter(Boolean) : [];
    return {
      id: typeof raw.id === 'string' ? raw.id : makeId(),
      name: typeof raw.name === 'string' ? raw.name : '',
      registered: typeof raw.registered === 'string' ? raw.registered : '',
      moreInfoUrl: typeof raw.moreInfoUrl === 'string' ? raw.moreInfoUrl : '',
      nextVisit: typeof raw.nextVisit === 'string' ? raw.nextVisit : '',
      scholarships: typeof raw.scholarships === 'string' ? raw.scholarships : '',
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      stages: stages
    };
  }

  function normalize(parsed) {
    if (!Array.isArray(parsed)) return { schools: [], changed: false };
    var result = parsed.map(normalizeSchool).filter(Boolean);
    return { schools: result, changed: result.length !== parsed.length };
  }

  function normalizeLabels(raw) {
    var result = {};
    Object.keys(DEFAULT_LABELS).forEach(function (key) {
      result[key] = (raw && typeof raw[key] === 'string' && raw[key].trim()) ? raw[key] : DEFAULT_LABELS[key];
    });
    return result;
  }

  function load() {
    var raw = readRaw(STORAGE_KEY);
    if (!raw) return { schools: [], fieldLabels: DEFAULT_LABELS };
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return { schools: [], fieldLabels: DEFAULT_LABELS };
    }
    return {
      schools: normalize(parsed.schools).schools,
      fieldLabels: normalizeLabels(parsed.fieldLabels)
    };
  }

  function save() {
    if (!isEditor) return;
    if (!writeRaw(STORAGE_KEY, JSON.stringify({ schools: schools, fieldLabels: fieldLabels }))) {
      setNotice('<strong>Could not save to browser storage</strong> — changes may not persist after a refresh.');
    }
  }

  // --- Rendering ---------------------------------------------------------

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function field(label, value, fieldName, type) {
    var id = 'f-' + (uidCounter++);
    return '' +
      '<div class="field">' +
      '<label for="' + id + '">' + esc(label) + '</label>' +
      '<p class="view-only field-value">' + (value && value.trim() ? esc(value) : '<span class="muted">&mdash;</span>') + '</p>' +
      '<input class="edit-only" id="' + id + '" type="' + (type || 'text') +
      '" data-field="' + fieldName + '" value="' + esc(value) + '">' +
      '</div>';
  }

  function linkField(label, value) {
    var id = 'f-' + (uidCounter++);
    var hasUrl = value && value.trim();
    return '' +
      '<div class="field">' +
      '<label for="' + id + '">' + esc(label) + '</label>' +
      '<p class="view-only field-value">' +
      (hasUrl ? '<a href="' + esc(value) + '" target="_blank" rel="noopener">Visit site &#8599;</a>' : '<span class="muted">&mdash;</span>') +
      '</p>' +
      '<input class="edit-only" id="' + id + '" type="url" data-field="moreInfoUrl" ' +
      'value="' + esc(value) + '" placeholder="https://...">' +
      '</div>';
  }

  function notesField(label, value, fieldName) {
    var id = 'f-' + (uidCounter++);
    return '' +
      '<div class="field field-full">' +
      '<label for="' + id + '">' + esc(label) + '</label>' +
      '<p class="view-only field-value notes-text">' + (value && value.trim() ? esc(value) : '<span class="muted">&mdash;</span>') + '</p>' +
      '<textarea class="edit-only" id="' + id + '" data-field="' + fieldName + '" rows="3">' + esc(value) + '</textarea>' +
      '</div>';
  }

  function sortDateField(value) {
    var id = 'f-' + (uidCounter++);
    return '' +
      '<div class="field edit-only">' +
      '<label for="' + id + '">Sort date <span class="hint">(for ordering only)</span></label>' +
      '<input id="' + id + '" type="date" data-field="sortDate" value="' + esc(value) + '">' +
      '</div>';
  }

  function renderStage(stage) {
    return '' +
      '<li class="stage-row" data-stage-id="' + esc(stage.id) + '">' +
      '<div class="stage-fields">' +
      field(fieldLabels.stageLabel, stage.label, 'label') +
      field(fieldLabels.stageDate, stage.date, 'date') +
      sortDateField(stage.sortDate) +
      '</div>' +
      notesField(fieldLabels.stageNotes, stage.notes, 'notes') +
      '<button type="button" class="delete stage-delete edit-only">Remove this date</button>' +
      '</li>';
  }

  function renderSchoolCard(school) {
    var stagesHtml = school.stages.map(renderStage).join('');
    var stagesEmpty = school.stages.length ? '' :
      '<p class="empty view-only stage-empty">No dates added yet.</p>';
    var countHint = school.stages.length ?
      ' <span class="muted">(' + school.stages.length + ')</span>' : '';

    return '' +
      '<section class="school-card" id="school-' + esc(school.id) + '" data-school-id="' + esc(school.id) + '">' +
      '<div class="school-card-head">' +
      '<h2 class="view-only">' + (school.name.trim() ? esc(school.name) : '<span class="muted">Untitled school</span>') + '</h2>' +
      '<input class="edit-only school-name-input" type="text" data-field="name" ' +
      'value="' + esc(school.name) + '" placeholder="School name">' +
      '<button type="button" class="delete school-delete edit-only">Delete school</button>' +
      '</div>' +
      '<details class="school-details"' + (openSchools[school.id] ? ' open' : '') + '>' +
      '<summary>Info &amp; key dates' + countHint + '</summary>' +
      '<div class="school-meta">' +
      field(fieldLabels.registered, school.registered, 'registered') +
      field(fieldLabels.nextVisit, school.nextVisit, 'nextVisit') +
      field(fieldLabels.scholarships, school.scholarships, 'scholarships') +
      linkField(fieldLabels.moreInfoUrl, school.moreInfoUrl) +
      '</div>' +
      notesField(fieldLabels.generalNotes, school.notes, 'notes') +
      '<h3 class="stage-heading">' + esc(fieldLabels.keyDatesHeading) + '</h3>' +
      '<ul class="stage-list">' + stagesHtml + '</ul>' +
      stagesEmpty +
      '<button type="button" class="secondary stage-add edit-only">+ Add date</button>' +
      '</details>' +
      '</section>';
  }

  function render() {
    if (!schools.length) {
      listEl.innerHTML = '<p class="empty">No schools added yet.</p>';
      return;
    }
    listEl.innerHTML = schools.map(renderSchoolCard).join('');
  }

  // Built once (not on every keystroke, so typing doesn't lose focus) — its
  // own 'input' listener below updates fieldLabels and re-renders the cards
  // that read those captions, but leaves this panel's DOM untouched.
  function renderLabelEditor() {
    if (!labelEditorFields) return;
    labelEditorFields.innerHTML = Object.keys(DEFAULT_LABELS).map(function (key) {
      var id = 'cap-' + key;
      return '' +
        '<div class="field">' +
        '<label for="' + id + '">' + esc(DEFAULT_LABELS[key]) + '</label>' +
        '<input id="' + id + '" type="text" data-caption="' + key + '" value="' + esc(fieldLabels[key]) + '">' +
        '</div>';
    }).join('');
  }

  if (labelEditorFields) {
    labelEditorFields.addEventListener('input', function (event) {
      var key = event.target.dataset.caption;
      if (!key) return;
      fieldLabels[key] = event.target.value.trim() ? event.target.value : DEFAULT_LABELS[key];
      save();
      render();
    });
  }

  // Native <details> toggle event doesn't bubble, but capturing listeners
  // still see it on the way down, so this still works via delegation.
  listEl.addEventListener('toggle', function (event) {
    if (!event.target.classList.contains('school-details')) return;
    var schoolEl = event.target.closest('[data-school-id]');
    if (schoolEl) openSchools[schoolEl.dataset.schoolId] = event.target.open;
  }, true);

  // --- Editing (event delegation) -----------------------------------------

  function findSchool(id) {
    return schools.filter(function (s) { return s.id === id; })[0];
  }

  function findStage(school, id) {
    return school.stages.filter(function (st) { return st.id === id; })[0];
  }

  listEl.addEventListener('input', function (event) {
    var target = event.target;
    var fieldName = target.dataset.field;
    if (!fieldName) return;

    var schoolEl = target.closest('[data-school-id]');
    if (!schoolEl) return;
    var school = findSchool(schoolEl.dataset.schoolId);
    if (!school) return;

    var stageEl = target.closest('[data-stage-id]');
    if (stageEl) {
      var stage = findStage(school, stageEl.dataset.stageId);
      if (stage) stage[fieldName] = target.value;
    } else {
      school[fieldName] = target.value;
    }
    save();
  });

  listEl.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;

    var schoolEl = button.closest('[data-school-id]');
    if (!schoolEl) return;
    var school = findSchool(schoolEl.dataset.schoolId);
    if (!school) return;

    if (button.classList.contains('stage-add')) {
      school.stages.push({ id: makeId(), label: '', date: '', sortDate: '', notes: '' });
      save();
      render();
      return;
    }

    if (button.classList.contains('stage-delete')) {
      var stageEl = button.closest('[data-stage-id]');
      var stage = stageEl && findStage(school, stageEl.dataset.stageId);
      var label = (stage && stage.label.trim()) || (stage && stage.date.trim()) || 'this date';
      if (!window.confirm('Remove ' + label + ' from ' + (school.name.trim() || 'this school') + '?')) return;
      school.stages = school.stages.filter(function (st) { return st.id !== stageEl.dataset.stageId; });
      save();
      render();
      return;
    }

    if (button.classList.contains('school-delete')) {
      if (!window.confirm('Delete ' + (school.name.trim() || 'this school') + ' and all its dates?')) return;
      schools = schools.filter(function (s) { return s.id !== school.id; });
      save();
      render();
    }
  });

  if (addSchoolButton) {
    addSchoolButton.addEventListener('click', function () {
      var id = makeId();
      schools.push({
        id: id, name: '', registered: '', moreInfoUrl: '',
        nextVisit: '', scholarships: '', notes: '', stages: []
      });
      openSchools[id] = true;
      save();
      render();
      var cards = listEl.querySelectorAll('.school-name-input');
      var last = cards[cards.length - 1];
      if (last) last.focus();
    });
  }

  // --- Publishing ----------------------------------------------------------

  function setNotice(html) {
    noticeEl.innerHTML = html;
    noticeEl.hidden = false;
  }

  function fetchPublished() {
    return Common.fetchJson(DATA_URL).then(function (data) {
      var list = data && Array.isArray(data.schools) ? data.schools : data;
      return {
        schools: normalize(list).schools,
        fieldLabels: normalizeLabels(data && data.fieldLabels),
        publishedAt: data && typeof data.publishedAt === 'string' ? data.publishedAt : null
      };
    });
  }

  publishButton.addEventListener('click', function () {
    var payload = {
      publishedAt: new Date().toISOString(),
      fieldLabels: fieldLabels,
      schools: schools
    };

    Common.downloadJson('schools.json', payload);

    setNotice(
      '<strong>Downloaded <code>schools.json</code> with ' + schools.length +
      ' ' + (schools.length === 1 ? 'school' : 'schools') + '.</strong>' +
      '<ol><li>Move it into your site folder, replacing the old <code>schools.json</code>.</li>' +
      '<li>Re-upload the folder to your host.</li>' +
      '<li>Family members reload the link to see the update.</li></ol>'
    );
  });

  // --- Init ------------------------------------------------------------------

  function startApp() {
    Common.initTheme({ themeToggle: themeToggle, themeLabel: themeLabel });

    if (isEditor) {
      publishButton.hidden = false;
      addSchoolToolbar.hidden = false;
      if (labelEditorSection) labelEditorSection.hidden = false;
      renderLabelEditor();
      setNotice(
        '<strong>Edit mode.</strong> Changes are saved in this browser only. ' +
        'Click <strong>Publish</strong> to produce the <code>schools.json</code> ' +
        'that family members see.'
      );
    }

    render();

    fetchPublished().then(function (published) {
      if (!isEditor) {
        schools = published.schools;
        fieldLabels = published.fieldLabels;
        if (published.schools.length) {
          setNotice('<strong>Read-only view.</strong>' + Common.describePublishTime(published.publishedAt));
        }
        render();
        return;
      }

      if (!schools.length && published.schools.length) {
        schools = published.schools;
        fieldLabels = published.fieldLabels;
        save();
        render();
        renderLabelEditor();
        setNotice(
          '<strong>Loaded ' + schools.length + ' published schools into this browser.</strong> ' +
          'Edit the fields directly, then click <strong>Publish</strong> to update the shared page.'
        );
      }
    }).catch(function () {
      if (isEditor) return;

      var fallback = load();
      schools = fallback.schools;
      fieldLabels = fallback.fieldLabels;
      render();

      if (schools.length) {
        setNotice(
          '<strong>Showing this browser\'s saved schools.</strong> ' +
          'The published <code>schools.json</code> could not be read — browsers block ' +
          'that when a page is opened from disk. Add <code>#edit</code> to the URL to make changes.'
        );
      } else {
        setNotice(
          '<strong>Nothing to show yet.</strong> ' +
          'Add <code>#edit</code> to the URL to add your first school.'
        );
      }
    });
  }

  Common.initGate({
    gateForm: gateForm,
    gatePasswordInput: gatePasswordInput,
    gateError: gateError
  }, startApp);
})();
