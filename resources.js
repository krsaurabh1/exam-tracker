(function () {
  'use strict';

  var STORAGE_KEY = 'exam-tracker.resources';
  var DATA_URL = 'resources.json';

  var isEditor = location.hash.indexOf('edit') !== -1 ||
    location.search.indexOf('edit') !== -1;
  document.body.dataset.mode = isEditor ? 'edit' : 'view';

  var listEl = document.getElementById('resources-list');
  var addToolbar = document.getElementById('add-resource-toolbar');
  var addButton = document.getElementById('add-resource');
  var themeToggle = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var noticeEl = document.getElementById('notice');
  var publishButton = document.getElementById('publish');
  var gateForm = document.getElementById('gate-form');
  var gatePasswordInput = document.getElementById('gate-password');
  var gateError = document.getElementById('gate-error');

  var readRaw = Common.readRaw;
  var writeRaw = Common.writeRaw;
  var makeId = Common.makeId;

  var resources = isEditor ? load() : [];
  var uidCounter = 0;

  // --- Persistence -----------------------------------------------------------

  function normalizeResource(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : makeId(),
      title: typeof raw.title === 'string' ? raw.title : '',
      url: typeof raw.url === 'string' ? raw.url : '',
      notes: typeof raw.notes === 'string' ? raw.notes : ''
    };
  }

  function normalize(parsed) {
    if (!Array.isArray(parsed)) return { resources: [], changed: false };
    var result = parsed.map(normalizeResource).filter(Boolean);
    return { resources: result, changed: result.length !== parsed.length };
  }

  function load() {
    var raw = readRaw(STORAGE_KEY);
    if (!raw) return [];
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return [];
    }
    return normalize(parsed).resources;
  }

  function save() {
    if (!isEditor) return;
    if (!writeRaw(STORAGE_KEY, JSON.stringify(resources))) {
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
      '<input class="edit-only" id="' + id + '" type="' + (type || 'text') +
      '" data-field="' + fieldName + '" value="' + esc(value) + '">' +
      '</div>';
  }

  function renderResourceCard(resource) {
    var hasUrl = resource.url && resource.url.trim();
    var titleText = resource.title.trim() ? esc(resource.title) : 'Untitled link';

    return '' +
      '<section class="resource-card" data-resource-id="' + esc(resource.id) + '">' +
      '<div class="resource-card-head">' +
      '<h2 class="view-only">' +
      (hasUrl ?
        '<a href="' + esc(resource.url) + '" target="_blank" rel="noopener">' + titleText + '</a>' :
        '<span class="muted">' + titleText + '</span>') +
      '</h2>' +
      '<button type="button" class="delete resource-delete edit-only">Delete</button>' +
      '</div>' +
      '<p class="view-only resource-url muted">' + (hasUrl ? esc(resource.url) : '') + '</p>' +
      '<div class="resource-fields edit-only">' +
      field('Title', resource.title, 'title') +
      field('URL', resource.url, 'url', 'url') +
      '</div>' +
      '<p class="view-only resource-notes">' + (resource.notes.trim() ? esc(resource.notes) : '') + '</p>' +
      '<div class="field field-full edit-only">' +
      '<label for="n-' + esc(resource.id) + '">Notes</label>' +
      '<textarea id="n-' + esc(resource.id) + '" data-field="notes" rows="2">' + esc(resource.notes) + '</textarea>' +
      '</div>' +
      '</section>';
  }

  function render() {
    if (!resources.length) {
      listEl.innerHTML = '<p class="empty">No links added yet.</p>';
      return;
    }
    listEl.innerHTML = resources.map(renderResourceCard).join('');
  }

  // --- Editing (event delegation) -----------------------------------------

  function findResource(id) {
    return resources.filter(function (r) { return r.id === id; })[0];
  }

  listEl.addEventListener('input', function (event) {
    var target = event.target;
    var fieldName = target.dataset.field;
    if (!fieldName) return;
    var cardEl = target.closest('[data-resource-id]');
    if (!cardEl) return;
    var resource = findResource(cardEl.dataset.resourceId);
    if (!resource) return;
    resource[fieldName] = target.value;
    save();
  });

  listEl.addEventListener('click', function (event) {
    var button = event.target.closest('.resource-delete');
    if (!button) return;
    var cardEl = button.closest('[data-resource-id]');
    var resource = cardEl && findResource(cardEl.dataset.resourceId);
    if (!resource) return;
    if (!window.confirm('Delete ' + (resource.title.trim() || 'this link') + '?')) return;
    resources = resources.filter(function (r) { return r.id !== resource.id; });
    save();
    render();
  });

  if (addButton) {
    addButton.addEventListener('click', function () {
      resources.push({ id: makeId(), title: '', url: '', notes: '' });
      save();
      render();
      var inputs = listEl.querySelectorAll('.resource-fields input');
      var last = inputs[inputs.length - 2]; // the Title input of the last card
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
      var list = data && Array.isArray(data.resources) ? data.resources : data;
      return {
        resources: normalize(list).resources,
        publishedAt: data && typeof data.publishedAt === 'string' ? data.publishedAt : null
      };
    });
  }

  publishButton.addEventListener('click', function () {
    var payload = {
      publishedAt: new Date().toISOString(),
      resources: resources
    };

    Common.downloadJson('resources.json', payload);

    setNotice(
      '<strong>Downloaded <code>resources.json</code> with ' + resources.length +
      ' ' + (resources.length === 1 ? 'link' : 'links') + '.</strong>' +
      '<ol><li>Move it into your site folder, replacing the old <code>resources.json</code>.</li>' +
      '<li>Re-upload the folder to your host.</li>' +
      '<li>Family members reload the link to see the update.</li></ol>'
    );
  });

  // --- Init ------------------------------------------------------------------

  function startApp() {
    Common.initTheme({ themeToggle: themeToggle, themeLabel: themeLabel });

    if (isEditor) {
      publishButton.hidden = false;
      addToolbar.hidden = false;
      setNotice(
        '<strong>Edit mode.</strong> Changes are saved in this browser only. ' +
        'Click <strong>Publish</strong> to produce the <code>resources.json</code> ' +
        'that family members see.'
      );
    }

    render();

    fetchPublished().then(function (published) {
      if (!isEditor) {
        resources = published.resources;
        if (published.resources.length) {
          setNotice('<strong>Read-only view.</strong>' + Common.describePublishTime(published.publishedAt));
        }
        render();
        return;
      }

      if (!resources.length && published.resources.length) {
        resources = published.resources;
        save();
        render();
        setNotice(
          '<strong>Loaded ' + resources.length + ' published links into this browser.</strong> ' +
          'Edit the fields directly, then click <strong>Publish</strong> to update the shared page.'
        );
      }
    }).catch(function () {
      if (isEditor) return;

      resources = load();
      render();

      if (resources.length) {
        setNotice(
          '<strong>Showing this browser\'s saved links.</strong> ' +
          'The published <code>resources.json</code> could not be read — browsers block ' +
          'that when a page is opened from disk. Add <code>#edit</code> to the URL to make changes.'
        );
      } else {
        setNotice(
          '<strong>Nothing to show yet.</strong> ' +
          'Add <code>#edit</code> to the URL to add your first link.'
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
