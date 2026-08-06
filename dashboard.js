(function () {
  'use strict';

  var DATA_URL = 'schools.json';

  var themeToggle = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var noticeEl = document.getElementById('notice');
  var upcomingListEl = document.getElementById('upcoming-list');
  var undatedSection = document.getElementById('undated-section');
  var undatedListEl = document.getElementById('undated-list');
  var gateForm = document.getElementById('gate-form');
  var gatePasswordInput = document.getElementById('gate-password');
  var gateError = document.getElementById('gate-error');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function setNotice(html) {
    noticeEl.innerHTML = html;
    noticeEl.hidden = false;
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

  function renderUpcomingItem(item) {
    var n = daysUntil(item.stage.sortDate);
    return '' +
      '<a class="upcoming-item" href="schools.html#school-' + esc(item.school.id) + '">' +
      '<div class="upcoming-when">' +
      '<span class="days-until">' + esc(describeDays(n)) + '</span>' +
      '<span class="upcoming-date">' + esc(item.stage.date) + '</span>' +
      '</div>' +
      '<div class="upcoming-what">' +
      '<span class="badge">' + esc(item.school.name || 'Untitled school') + '</span>' +
      '<span class="upcoming-label">' + esc(item.stage.label || 'Untitled') + '</span>' +
      '</div>' +
      '</a>';
  }

  function renderUndatedItem(school) {
    return '' +
      '<a class="upcoming-item" href="schools.html#school-' + esc(school.id) + '">' +
      '<div class="upcoming-what">' +
      '<span class="badge">' + esc(school.name || 'Untitled school') + '</span>' +
      '<span class="upcoming-label muted">Add key dates on the Schools page &#8594;</span>' +
      '</div>' +
      '</a>';
  }

  function render(schools) {
    var todayStr = new Date().toISOString().slice(0, 10);
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
      upcoming.map(renderUpcomingItem).join('') :
      '<p class="empty">No upcoming dates. Add some on the <a href="schools.html">Schools</a> page.</p>';

    if (undatedSchools.length) {
      undatedSection.hidden = false;
      undatedListEl.innerHTML = undatedSchools.map(renderUndatedItem).join('');
    }
  }

  function startApp() {
    Common.initTheme({ themeToggle: themeToggle, themeLabel: themeLabel });

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
