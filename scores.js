(function () {
  'use strict';

  var STORAGE_KEY = 'exam-tracker.entries';
  var SORT_KEY = 'exam-tracker.sort';
  var CHART_KEY = 'exam-tracker.chart';
  var DATA_URL = 'data.json';

  var SORTABLE = ['subject', 'testType', 'date', 'percent'];

  // Visitors get a read-only view of the published data.json.
  // Adding "#edit" to the URL turns on the form, delete buttons and Publish.
  // This is a convenience, not a lock: edits only ever touch this browser's
  // own copy, and updating what others see requires access to the host.
  var isEditor = location.hash.indexOf('edit') !== -1 ||
    location.search.indexOf('edit') !== -1;
  document.body.dataset.mode = isEditor ? 'edit' : 'view';

  var form = document.getElementById('entry-form');
  var subjectInput = document.getElementById('subject');
  var testTypeInput = document.getElementById('test-type');
  var dateInput = document.getElementById('date');
  var scoreInput = document.getElementById('score');
  var outOfInput = document.getElementById('out-of');
  var subjectOptions = document.getElementById('subject-options');
  var errorEl = document.getElementById('form-error');
  var tableWrap = document.querySelector('.table-wrap');
  var thead = document.querySelector('#entries-table thead');
  var tbody = document.getElementById('entries-body');
  var emptyEl = document.getElementById('empty-state');
  var summaryEl = document.getElementById('summary');
  var countEl = document.getElementById('stat-count');
  var averageEl = document.getElementById('stat-average');
  var bestEl = document.getElementById('stat-best');
  var themeToggle = document.getElementById('theme-toggle');
  var themeLabel = document.getElementById('theme-label');
  var noticeEl = document.getElementById('notice');
  var publishButton = document.getElementById('publish');
  var chartSection = document.getElementById('chart-section');
  var chartSubject = document.getElementById('chart-subject');
  var chartRange = document.getElementById('chart-range');
  var chartSvg = document.getElementById('chart');
  var chartPlot = document.getElementById('chart-plot');
  var chartResetZoom = document.getElementById('chart-reset-zoom');
  var chartTooltip = document.getElementById('chart-tooltip');
  var chartLegend = document.getElementById('chart-legend');
  var chartNote = document.getElementById('chart-note');
  var chartSub = document.getElementById('chart-sub');
  var formSubmitButton = document.getElementById('form-submit');
  var formCancelButton = document.getElementById('form-cancel');
  var tableToolbar = document.getElementById('table-toolbar');
  var exportCsvButton = document.getElementById('export-csv');
  var gateOverlay = document.getElementById('access-gate');
  var gateForm = document.getElementById('gate-form');
  var gatePasswordInput = document.getElementById('gate-password');
  var gateError = document.getElementById('gate-error');

  // --- Persistence ---------------------------------------------------------

  var readRaw = Common.readRaw;
  var writeRaw = Common.writeRaw;
  var makeId = Common.makeId;

  var entries = isEditor ? load() : [];
  var sort = loadSort();
  var editingId = null; // id of the entry currently loaded into the form, or null when adding

  // Shared by the local copy and the fetched data.json: both are untrusted
  // input that may predate the testType / outOf fields.
  function normalize(parsed) {
    if (!Array.isArray(parsed)) return { entries: [], changed: false };

    var migrated = false;

    var result = parsed.map(function (entry) {
      if (!entry || typeof entry !== 'object') return null;
      if (typeof entry.subject !== 'string' || typeof entry.date !== 'string') return null;

      var score = Number(entry.score);
      if (!isFinite(score) || score < 0) return null;

      // Entries saved before "Out of" existed were always out of 100.
      var outOf = Number(entry.outOf);
      if (!isFinite(outOf) || outOf <= 0) {
        outOf = 100;
        migrated = true;
      }

      var testType = typeof entry.testType === 'string' ? entry.testType : '';
      if (typeof entry.testType !== 'string') migrated = true;

      var id = typeof entry.id === 'string' ? entry.id : makeId();
      if (typeof entry.id !== 'string') migrated = true;

      return {
        id: id,
        subject: entry.subject,
        testType: testType,
        date: entry.date,
        score: score,
        outOf: outOf
      };
    }).filter(Boolean);

    return {
      entries: result,
      changed: migrated || result.length !== parsed.length
    };
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

    var normalized = normalize(parsed);
    if (normalized.changed) {
      // Write the upgraded shape back so the migration happens once.
      writeRaw(STORAGE_KEY, JSON.stringify(normalized.entries));
    }
    return normalized.entries;
  }

  function save() {
    if (!isEditor) return;
    if (!writeRaw(STORAGE_KEY, JSON.stringify(entries))) {
      showError('Could not save to browser storage — entries may not persist after a refresh.');
    }
  }

  function loadSort() {
    var raw = readRaw(SORT_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && SORTABLE.indexOf(parsed.column) !== -1 &&
            (parsed.direction === 'asc' || parsed.direction === 'desc')) {
          return { column: parsed.column, direction: parsed.direction };
        }
      } catch (err) {}
    }
    return { column: 'date', direction: 'desc' };
  }

  function saveSort() {
    writeRaw(SORT_KEY, JSON.stringify(sort));
  }

  // --- Derived values ------------------------------------------------------

  function percentOf(entry) {
    if (!(entry.outOf > 0)) return 0;
    return Math.round((entry.score / entry.outOf) * 100);
  }

  function trimNumber(value) {
    // 42 -> "42", 42.5 -> "42.5"
    return String(Math.round(value * 100) / 100);
  }

  function formatDate(iso) {
    var parts = iso.split('-');
    if (parts.length !== 3) return iso;
    // Built from local parts so the displayed day matches what was entered.
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  // --- Sorting -------------------------------------------------------------

  function compareText(a, b) {
    return (a || '').localeCompare(b || '', undefined, { sensitivity: 'base' });
  }

  function sortedEntries() {
    var column = sort.column;
    var factor = sort.direction === 'asc' ? 1 : -1;

    return entries.slice().sort(function (a, b) {
      var primary = 0;

      if (column === 'subject') {
        primary = compareText(a.subject, b.subject);
      } else if (column === 'testType') {
        primary = compareText(a.testType, b.testType);
      } else if (column === 'percent') {
        primary = percentOf(a) - percentOf(b);
      } else {
        primary = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      }

      if (primary !== 0) return primary * factor;

      // Stable, predictable tie-breakers: newest date, then subject.
      if (column !== 'date' && a.date !== b.date) return a.date < b.date ? 1 : -1;
      return compareText(a.subject, b.subject);
    });
  }

  function renderSortIndicators() {
    var headers = thead.querySelectorAll('th');
    Array.prototype.forEach.call(headers, function (th) {
      var button = th.querySelector('.sort');
      if (!button) return;

      var isActive = button.dataset.column === sort.column;
      var indicator = button.querySelector('.indicator');

      button.dataset.active = isActive ? 'true' : 'false';
      indicator.textContent = isActive
        ? (sort.direction === 'asc' ? '▲' : '▼')
        : '↕';
      th.setAttribute('aria-sort', isActive
        ? (sort.direction === 'asc' ? 'ascending' : 'descending')
        : 'none');

      var next = isActive && sort.direction === 'asc' ? 'descending' : 'ascending';
      button.title = 'Sort ' + next;
    });
  }

  thead.addEventListener('click', function (event) {
    var button = event.target.closest('.sort');
    if (!button) return;

    var column = button.dataset.column;
    if (SORTABLE.indexOf(column) === -1) return;

    if (sort.column === column) {
      sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sort.column = column;
      // Text reads best A-Z; dates and scores best highest-first.
      sort.direction = (column === 'subject' || column === 'testType') ? 'asc' : 'desc';
    }

    saveSort();
    render();
  });

  // --- Rendering -----------------------------------------------------------

  function buildRow(entry) {
    var row = document.createElement('tr');
    if (entry.id === editingId) row.className = 'editing-row';
    var percent = percentOf(entry);

    var subjectCell = document.createElement('td');
    subjectCell.textContent = entry.subject;

    var typeCell = document.createElement('td');
    if (entry.testType) {
      typeCell.textContent = entry.testType;
    } else {
      typeCell.textContent = '—';
      typeCell.className = 'muted';
    }

    var dateCell = document.createElement('td');
    dateCell.textContent = formatDate(entry.date);

    var scoreCell = document.createElement('td');
    scoreCell.className = 'numeric';
    scoreCell.textContent = trimNumber(entry.score);

    var outOfCell = document.createElement('td');
    outOfCell.className = 'numeric';
    outOfCell.textContent = trimNumber(entry.outOf);

    var percentCell = document.createElement('td');
    percentCell.className = 'numeric percent ' + (percent >= 75 ? 'is-good' : percent < 40 ? 'is-warn' : '');
    percentCell.textContent = percent + '%';

    var cells = [subjectCell, typeCell, dateCell, scoreCell, outOfCell, percentCell];

    if (isEditor) {
      var actionCell = document.createElement('td');
      actionCell.className = 'actions';

      var editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'edit';
      editButton.textContent = 'Edit';
      editButton.dataset.id = entry.id;
      editButton.setAttribute('aria-label', 'Edit ' + entry.subject + ' ' +
        (entry.testType || 'entry') + ' on ' + formatDate(entry.date));

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'delete';
      button.textContent = 'Delete';
      button.dataset.id = entry.id;
      button.setAttribute('aria-label', 'Delete ' + entry.subject + ' ' +
        (entry.testType || 'entry') + ' on ' + formatDate(entry.date));

      actionCell.appendChild(editButton);
      actionCell.appendChild(button);
      cells.push(actionCell);
    }

    cells.forEach(function (cell) { row.appendChild(cell); });

    return row;
  }

  function renderSubjectSuggestions() {
    var seen = Object.create(null);
    subjectOptions.textContent = '';
    entries.forEach(function (entry) {
      var name = entry.subject;
      if (seen[name]) return;
      seen[name] = true;
      var option = document.createElement('option');
      option.value = name;
      subjectOptions.appendChild(option);
    });
  }

  function renderSummary() {
    var total = entries.reduce(function (sum, entry) {
      return sum + percentOf(entry);
    }, 0);
    var best = entries.reduce(function (max, entry) {
      return Math.max(max, percentOf(entry));
    }, 0);

    countEl.textContent = String(entries.length);
    averageEl.textContent = Math.round(total / entries.length) + '%';
    bestEl.textContent = best + '%';
  }

  function render() {
    tbody.textContent = '';

    var rows = document.createDocumentFragment();
    sortedEntries().forEach(function (entry) {
      rows.appendChild(buildRow(entry));
    });
    tbody.appendChild(rows);

    var hasEntries = entries.length > 0;
    tableWrap.hidden = !hasEntries;
    emptyEl.hidden = hasEntries;
    summaryEl.hidden = !hasEntries;
    tableToolbar.hidden = !hasEntries;

    if (hasEntries) renderSummary();
    renderSortIndicators();
    renderSubjectSuggestions();
    renderChart();
  }

  // --- Chart ---------------------------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Eight validated categorical slots. A 9th series never gets a generated or
  // recycled hue — the tail folds out of the "all subjects" view instead and
  // stays chartable one at a time via the dropdown.
  var MAX_SERIES = 8;

  var chartOptions = loadChartOptions();
  var hoverLayer = null;
  var hoverTimes = [];
  var hoverIndex = null;
  var plot = null; // geometry of the last render, for hover math

  // Drag-to-zoom state. Not persisted — a fresh view of the data always
  // starts fully zoomed out; the filters resetting it is intentional too,
  // since a new subject/range has a different time domain.
  var chartZoom = null;
  var isDragging = false;
  var dragStartX = null;
  var dragCurrentX = null;
  var dragRectEl = null;
  var DRAG_THRESHOLD = 6;

  function loadChartOptions() {
    var raw = readRaw(CHART_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.subject === 'string' && typeof parsed.range === 'string') {
          return { subject: parsed.subject, range: parsed.range };
        }
      } catch (err) {}
    }
    return { subject: '', range: 'all' };
  }

  function saveChartOptions() {
    writeRaw(CHART_KEY, JSON.stringify(chartOptions));
  }

  function svg(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    for (var key in attrs) {
      if (attrs[key] !== null && attrs[key] !== undefined) {
        node.setAttribute(key, String(attrs[key]));
      }
    }
    return node;
  }

  function timeOf(iso) {
    var parts = iso.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
  }

  // Slot assignment depends only on the data, never on the current filter, so
  // narrowing to one subject can't repaint the others.
  function slotFor(subject) {
    var counts = Object.create(null);
    entries.forEach(function (entry) {
      counts[entry.subject] = (counts[entry.subject] || 0) + 1;
    });

    var ranked = Object.keys(counts).sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return a.localeCompare(b);
    });

    var index = ranked.indexOf(subject);
    return { slot: index > -1 && index < MAX_SERIES ? index + 1 : 0, ranked: ranked };
  }

  function buildSeries() {
    var ranking = slotFor('');
    var ranked = ranking.ranked;
    var charted = ranked.slice(0, MAX_SERIES);

    var cutoff = null;
    if (chartOptions.range !== 'all') {
      var days = Number(chartOptions.range);
      if (isFinite(days) && days > 0) {
        var now = new Date();
        var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        cutoff = start.getTime() - (days - 1) * 86400000;
      }
    }

    var wanted = chartOptions.subject ? [chartOptions.subject] : charted;
    var byName = Object.create(null);

    wanted.forEach(function (name) {
      // A subject outside the top eight has no slot of its own; shown alone it
      // borrows slot 1, where there is nothing to confuse it with.
      var slot = ranked.indexOf(name) < MAX_SERIES ? ranked.indexOf(name) + 1 : 1;
      byName[name] = { subject: name, slot: slot, points: [] };
    });

    entries.forEach(function (entry) {
      var series = byName[entry.subject];
      if (!series) return;
      var time = timeOf(entry.date);
      if (!isFinite(time)) return;
      if (cutoff !== null && time < cutoff) return;
      series.points.push({
        time: time,
        date: entry.date,
        percent: percentOf(entry),
        testType: entry.testType
      });
    });

    return wanted.map(function (name) {
      return byName[name];
    }).filter(function (series) {
      return series.points.length > 0;
    }).map(function (series) {
      series.points.sort(function (a, b) { return a.time - b.time; });
      return series;
    });
  }

  function populateSubjectFilter() {
    var subjects = [];
    var seen = Object.create(null);
    entries.forEach(function (entry) {
      if (seen[entry.subject]) return;
      seen[entry.subject] = true;
      subjects.push(entry.subject);
    });
    subjects.sort(function (a, b) { return a.localeCompare(b); });

    if (subjects.indexOf(chartOptions.subject) === -1) chartOptions.subject = '';

    chartSubject.textContent = '';
    var all = document.createElement('option');
    all.value = '';
    all.textContent = 'All subjects';
    chartSubject.appendChild(all);

    subjects.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      chartSubject.appendChild(option);
    });

    chartSubject.value = chartOptions.subject;
    chartRange.value = chartOptions.range;
  }

  function xTickFormat(spanDays) {
    if (spanDays > 400) return { year: 'numeric', month: 'short' };
    return { month: 'short', day: 'numeric' };
  }

  function renderChart() {
    if (!entries.length) {
      chartSection.hidden = true;
      return;
    }
    chartSection.hidden = false;

    populateSubjectFilter();

    var series = buildSeries();
    chartSvg.textContent = '';
    hideTooltip();
    hoverIndex = null;
    hoverLayer = null;

    // Legend is the dependable identity channel for two or more series;
    // a single series is named by the heading instead.
    chartLegend.textContent = '';
    chartLegend.hidden = series.length < 2;

    chartSub.textContent = chartOptions.subject
      ? '% score over time — ' + chartOptions.subject
      : '% score over time';

    if (!series.length) {
      chartNote.textContent = 'No entries in the selected range.';
      chartNote.hidden = false;
      chartSvg.setAttribute('height', '0');
      return;
    }

    var width = Math.max(320, Math.round(chartPlot.clientWidth || 640));
    var height = 320;

    // Up to four series carry direct end-labels; past that the legend and
    // tooltip do the work alone.
    var labelSeries = series.length <= 4;

    // Reserve exactly as much right margin as the widest end-label needs, so a
    // label is never clipped or pushed outside the plot. ~6.3px per character
    // at 11px semibold, measured against the rendered font.
    var labelTexts = series.map(function (s) {
      var last = s.points[s.points.length - 1];
      return series.length === 1 ? last.percent + '%' : s.subject + ' ' + last.percent + '%';
    });
    var widestLabel = labelTexts.reduce(function (max, text) {
      return Math.max(max, text.length);
    }, 0);
    var labelRoom = Math.min(160, Math.round(widestLabel * 6.3) + 14);

    var pad = {
      top: 16,
      right: labelSeries ? Math.max(24, labelRoom) : 16,
      bottom: 34,
      left: 40
    };

    // A long subject name shouldn't squeeze the plot itself — drop to the
    // legend rather than give up the chart area.
    if (labelSeries && width - pad.left - pad.right < 220) {
      labelSeries = false;
      pad.right = 16;
    }

    var plotW = width - pad.left - pad.right;
    var plotH = height - pad.top - pad.bottom;

    var times = [];
    series.forEach(function (s) {
      s.points.forEach(function (p) { times.push(p.time); });
    });
    var fullMinT = Math.min.apply(null, times);
    var fullMaxT = Math.max.apply(null, times);
    if (fullMinT === fullMaxT) {
      // A single date would give a zero-width domain; show it centred.
      fullMinT -= 15 * 86400000;
      fullMaxT += 15 * 86400000;
    }

    // A drag-to-zoom selection narrows the time domain, clamped back to the
    // full data range so it can never be dragged wider than the data itself.
    var minT = fullMinT, maxT = fullMaxT;
    if (chartZoom) {
      minT = Math.max(fullMinT, Math.min(chartZoom.start, fullMaxT));
      maxT = Math.max(fullMinT, Math.min(chartZoom.end, fullMaxT));
      if (maxT <= minT) {
        minT = fullMinT;
        maxT = fullMaxT;
        chartZoom = null;
      }
    }

    function px(time) {
      return pad.left + ((time - minT) / (maxT - minT)) * plotW;
    }
    // The axis floor sits at 50%, not 0% — small score differences are what
    // matter here, so the lower half of the scale would just be dead space.
    function py(percent) {
      var clamped = Math.max(50, Math.min(100, percent));
      return pad.top + (1 - (clamped - 50) / 50) * plotH;
    }

    chartSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    chartSvg.setAttribute('width', String(width));
    chartSvg.setAttribute('height', String(height));
    plot = { width: width, minT: minT, maxT: maxT, left: pad.left, plotW: plotW,
             top: pad.top, plotH: plotH, py: py, px: px };

    chartResetZoom.hidden = !chartZoom;

    // Gridlines — solid hairlines, one step off the surface.
    [50, 60, 70, 80, 90, 100].forEach(function (value) {
      var y = py(value);
      chartSvg.appendChild(svg('line', {
        class: 'grid-line', x1: pad.left, x2: pad.left + plotW, y1: y, y2: y
      }));
      var label = svg('text', {
        class: 'axis-text', x: pad.left - 8, y: y + 4, 'text-anchor': 'end'
      });
      label.textContent = value + '%';
      chartSvg.appendChild(label);
    });

    chartSvg.appendChild(svg('line', {
      class: 'axis-line',
      x1: pad.left, x2: pad.left + plotW,
      y1: pad.top + plotH, y2: pad.top + plotH
    }));

    // X ticks
    var tickCount = Math.max(2, Math.min(5, Math.floor(plotW / 110)));
    var spanDays = (maxT - minT) / 86400000;
    var format = xTickFormat(spanDays);
    var lastLabel = null;
    for (var i = 0; i < tickCount; i++) {
      var t = minT + ((maxT - minT) * i) / (tickCount - 1);
      var text = new Date(t).toLocaleDateString(undefined, format);
      if (text === lastLabel) continue;
      lastLabel = text;
      var anchor = i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle';
      var tick = svg('text', {
        class: 'axis-text', x: px(t), y: pad.top + plotH + 18, 'text-anchor': anchor
      });
      tick.textContent = text;
      chartSvg.appendChild(tick);
    }

    // Series lines and markers, clipped to the plot rect so a zoomed-in
    // view doesn't bleed a line into the axis-label margins.
    var clipId = 'chart-clip';
    var clipPath = svg('clipPath', { id: clipId });
    clipPath.appendChild(svg('rect', { x: pad.left, y: pad.top, width: plotW, height: plotH }));
    chartSvg.appendChild(clipPath);
    var seriesGroup = svg('g', { 'clip-path': 'url(#' + clipId + ')' });
    chartSvg.appendChild(seriesGroup);

    var endLabels = [];
    series.forEach(function (s) {
      var stroke = 'var(--series-' + s.slot + ')';

      var d = s.points.map(function (p, index) {
        return (index === 0 ? 'M' : 'L') + px(p.time).toFixed(1) + ' ' + py(p.percent).toFixed(1);
      }).join(' ');

      var path = svg('path', { class: 'series-line', d: d });
      path.style.stroke = stroke;
      seriesGroup.appendChild(path);

      // Dots would clutter a dense series; keep just the ends past 40 points.
      var dense = s.points.length > 40;
      s.points.forEach(function (p, index) {
        var isEnd = index === 0 || index === s.points.length - 1;
        if (dense && !isEnd) return;
        var dot = svg('circle', {
          class: 'series-dot', cx: px(p.time), cy: py(p.percent), r: 4
        });
        dot.style.fill = stroke;
        seriesGroup.appendChild(dot);
      });

      // Only label the series' true last point when it's actually in view —
      // zoomed away from it, the label would float outside the plot.
      var last = s.points[s.points.length - 1];
      if (last.time >= minT && last.time <= maxT) {
        endLabels.push({
          y: py(last.percent),
          x: px(last.time) + 9,
          text: labelTexts[series.indexOf(s)]
        });
      }

      var item = document.createElement('li');
      var key = document.createElement('span');
      key.className = 'key';
      key.style.background = stroke;
      item.appendChild(key);
      var name = document.createElement('span');
      name.textContent = s.subject;
      item.appendChild(name);
      chartLegend.appendChild(item);
    });

    // Direct end-labels, but never stacked on top of each other.
    if (labelSeries) {
      endLabels.sort(function (a, b) { return a.y - b.y; });
      var lastY = -Infinity;
      endLabels.forEach(function (label) {
        if (label.y - lastY < 13) return;
        lastY = label.y;
        var text = svg('text', {
          class: 'end-label', x: label.x, y: label.y + 4
        });
        text.textContent = label.text;
        chartSvg.appendChild(text);
      });
    }

    // Hover layer sits above the marks; the overlay is the hit target.
    hoverLayer = svg('g', { 'pointer-events': 'none' });
    chartSvg.appendChild(hoverLayer);
    chartSvg.appendChild(svg('rect', {
      x: pad.left, y: pad.top, width: plotW, height: plotH,
      fill: 'transparent', class: 'hover-overlay'
    }));

    // One entry per unique date, so the crosshair snaps to real data.
    // Points outside the current zoom window are skipped — the hover can't
    // land somewhere the chart doesn't currently draw.
    var unique = Object.create(null);
    series.forEach(function (s) {
      s.points.forEach(function (p) {
        if (p.time < minT || p.time > maxT) return;
        if (!unique[p.time]) unique[p.time] = [];
        unique[p.time].push({ series: s, point: p });
      });
    });
    hoverTimes = Object.keys(unique).map(Number).sort(function (a, b) { return a - b; });
    plot.groups = unique;

    var omitted = slotFor('').ranked.length - MAX_SERIES;
    if (!chartOptions.subject && omitted > 0) {
      chartNote.textContent = 'Showing the ' + MAX_SERIES + ' subjects with the most entries. ' +
        omitted + ' more ' + (omitted === 1 ? 'is' : 'are') +
        ' available one at a time from the Subject menu.';
      chartNote.hidden = false;
    } else {
      chartNote.textContent = '';
      chartNote.hidden = true;
    }

    chartSvg.setAttribute('aria-label',
      'Line chart of percent score over time for ' +
      series.map(function (s) { return s.subject; }).join(', ') +
      '. The table below lists every entry.');
  }

  // --- Chart hover & keyboard ----------------------------------------------

  function hideTooltip() {
    chartTooltip.hidden = true;
    chartTooltip.textContent = '';
    if (hoverLayer) hoverLayer.textContent = '';
  }

  function showHover(index) {
    if (!plot || !hoverTimes.length) return;
    hoverIndex = Math.max(0, Math.min(hoverTimes.length - 1, index));

    var time = hoverTimes[hoverIndex];
    var rows = plot.groups[time] || [];
    var x = plot.px(time);

    hoverLayer.textContent = '';
    hoverLayer.appendChild(svg('line', {
      class: 'crosshair', x1: x, x2: x, y1: plot.top, y2: plot.top + plot.plotH
    }));

    rows.forEach(function (row) {
      var dot = svg('circle', {
        class: 'hover-dot', cx: x, cy: plot.py(row.point.percent), r: 5.5
      });
      dot.style.fill = 'var(--series-' + row.series.slot + ')';
      hoverLayer.appendChild(dot);
    });

    // Built with textContent — subject and test type are user-entered text.
    chartTooltip.textContent = '';
    var head = document.createElement('div');
    head.className = 'tip-date';
    head.textContent = formatDate(rows.length ? rows[0].point.date : '');
    chartTooltip.appendChild(head);

    rows.forEach(function (row) {
      var line = document.createElement('div');
      line.className = 'tip-row';

      var key = document.createElement('span');
      key.className = 'tip-key';
      key.style.background = 'var(--series-' + row.series.slot + ')';
      line.appendChild(key);

      var value = document.createElement('span');
      value.className = 'tip-value';
      value.textContent = row.point.percent + '%';
      line.appendChild(value);

      var name = document.createElement('span');
      name.className = 'tip-name';
      name.textContent = row.series.subject +
        (row.point.testType ? ' · ' + row.point.testType : '');
      line.appendChild(name);

      chartTooltip.appendChild(line);
    });

    chartTooltip.hidden = false;

    // Position in CSS pixels, allowing for any scaling of the SVG.
    var scale = chartSvg.clientWidth ? chartSvg.clientWidth / plot.width : 1;
    var tipWidth = chartTooltip.offsetWidth;
    var left = x * scale + 14;
    if (left + tipWidth > chartPlot.clientWidth) left = x * scale - tipWidth - 14;
    chartTooltip.style.left = Math.max(0, left) + 'px';
    chartTooltip.style.top = (plot.top + 4) + 'px';
  }

  function svgXFromClient(clientX) {
    var rect = chartSvg.getBoundingClientRect();
    var scale = rect.width && plot ? plot.width / rect.width : 1;
    return (clientX - rect.left) * scale;
  }

  function svgYFromClient(clientY) {
    var rect = chartSvg.getBoundingClientRect();
    var scale = rect.width && plot ? plot.width / rect.width : 1;
    return (clientY - rect.top) * scale;
  }

  function nearestIndex(clientX) {
    var svgX = svgXFromClient(clientX);

    var best = 0;
    var bestDistance = Infinity;
    hoverTimes.forEach(function (time, index) {
      var distance = Math.abs(plot.px(time) - svgX);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  // --- Drag-to-zoom ----------------------------------------------------

  function updateDragRect() {
    var x = Math.min(dragStartX, dragCurrentX);
    var w = Math.abs(dragCurrentX - dragStartX);
    if (!dragRectEl) {
      dragRectEl = svg('rect', { class: 'zoom-brush' });
      chartSvg.appendChild(dragRectEl);
    }
    dragRectEl.setAttribute('x', x);
    dragRectEl.setAttribute('y', plot.top);
    dragRectEl.setAttribute('width', w);
    dragRectEl.setAttribute('height', plot.plotH);
  }

  function removeDragRect() {
    if (dragRectEl && dragRectEl.parentNode) dragRectEl.parentNode.removeChild(dragRectEl);
    dragRectEl = null;
  }

  chartSvg.addEventListener('pointerdown', function (event) {
    if (!plot) return;
    var x = svgXFromClient(event.clientX);
    var y = svgYFromClient(event.clientY);
    if (x < plot.left || x > plot.left + plot.plotW) return;
    if (y < plot.top || y > plot.top + plot.plotH) return;
    isDragging = true;
    dragStartX = x;
    dragCurrentX = x;
    hideTooltip();
    if (chartSvg.setPointerCapture) {
      try { chartSvg.setPointerCapture(event.pointerId); } catch (err) {}
    }
  });

  chartSvg.addEventListener('pointermove', function (event) {
    if (!plot) return;
    if (isDragging) {
      dragCurrentX = Math.max(plot.left, Math.min(plot.left + plot.plotW, svgXFromClient(event.clientX)));
      updateDragRect();
      return;
    }
    if (!hoverTimes.length) return;
    showHover(nearestIndex(event.clientX));
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
    removeDragRect();

    var x1 = dragStartX, x2 = dragCurrentX;
    dragStartX = null;
    dragCurrentX = null;
    if (!plot || Math.abs(x2 - x1) < DRAG_THRESHOLD) return;

    var lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    var t1 = plot.minT + ((lo - plot.left) / plot.plotW) * (plot.maxT - plot.minT);
    var t2 = plot.minT + ((hi - plot.left) / plot.plotW) * (plot.maxT - plot.minT);
    chartZoom = { start: t1, end: t2 };
    renderChart();
  }

  chartSvg.addEventListener('pointerup', endDrag);
  chartSvg.addEventListener('pointercancel', endDrag);

  chartSvg.addEventListener('dblclick', function () {
    if (!chartZoom) return;
    chartZoom = null;
    renderChart();
  });

  chartResetZoom.addEventListener('click', function () {
    chartZoom = null;
    renderChart();
  });

  chartSvg.addEventListener('pointerleave', hideTooltip);
  chartSvg.addEventListener('blur', hideTooltip);

  chartSvg.addEventListener('focus', function () {
    if (hoverTimes.length && hoverIndex === null) showHover(hoverTimes.length - 1);
  });

  chartSvg.addEventListener('keydown', function (event) {
    if (!hoverTimes.length) return;
    var current = hoverIndex === null ? hoverTimes.length - 1 : hoverIndex;

    if (event.key === 'ArrowRight') showHover(current + 1);
    else if (event.key === 'ArrowLeft') showHover(current - 1);
    else if (event.key === 'Home') showHover(0);
    else if (event.key === 'End') showHover(hoverTimes.length - 1);
    else if (event.key === 'Escape') { hideTooltip(); hoverIndex = null; return; }
    else return;

    event.preventDefault();
  });

  chartSubject.addEventListener('change', function () {
    chartOptions.subject = chartSubject.value;
    chartZoom = null;
    saveChartOptions();
    renderChart();
  });

  chartRange.addEventListener('change', function () {
    chartOptions.range = chartRange.value;
    chartZoom = null;
    saveChartOptions();
    renderChart();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderChart, 120);
  });

  // --- Add & delete --------------------------------------------------------

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function startEdit(entry) {
    editingId = entry.id;
    subjectInput.value = entry.subject;
    testTypeInput.value = entry.testType;
    dateInput.value = entry.date;
    scoreInput.value = trimNumber(entry.score);
    outOfInput.value = trimNumber(entry.outOf);
    clearError();

    formSubmitButton.textContent = 'Save changes';
    formCancelButton.hidden = false;
    render();
    subjectInput.focus();
  }

  function cancelEdit() {
    editingId = null;
    form.reset();
    outOfInput.value = '100';
    clearError();

    formSubmitButton.textContent = 'Add entry';
    formCancelButton.hidden = true;
    render();
  }

  formCancelButton.addEventListener('click', cancelEdit);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearError();

    var subject = subjectInput.value.trim();
    var testType = testTypeInput.value.trim();
    var date = dateInput.value;
    var rawScore = scoreInput.value.trim();
    var rawOutOf = outOfInput.value.trim();

    if (!subject) {
      showError('Enter a subject name.');
      subjectInput.focus();
      return;
    }
    if (!testType) {
      showError('Enter a test type, e.g. Quiz or Final.');
      testTypeInput.focus();
      return;
    }
    if (!date) {
      showError('Choose a date.');
      dateInput.focus();
      return;
    }

    var score = Number(rawScore);
    if (rawScore === '' || !isFinite(score) || score < 0) {
      showError('Score must be a number of 0 or more.');
      scoreInput.focus();
      return;
    }

    var outOf = Number(rawOutOf);
    if (rawOutOf === '' || !isFinite(outOf) || outOf <= 0) {
      showError('"Out of" must be a number greater than 0.');
      outOfInput.focus();
      return;
    }
    if (score > outOf) {
      showError('Score cannot be greater than the "out of" total.');
      scoreInput.focus();
      return;
    }

    if (editingId) {
      var target = entries.filter(function (item) { return item.id === editingId; })[0];
      if (target) {
        target.subject = subject;
        target.testType = testType;
        target.date = date;
        target.score = score;
        target.outOf = outOf;
      }

      editingId = null;
      formSubmitButton.textContent = 'Add entry';
      formCancelButton.hidden = true;

      save();
      render();
      form.reset();
      outOfInput.value = '100';
      return;
    }

    entries.push({
      id: makeId(),
      subject: subject,
      testType: testType,
      date: date,
      score: score,
      outOf: outOf
    });

    save();
    render();

    // Keep subject, test type and "out of" — consecutive entries usually share them.
    scoreInput.value = '';
    dateInput.value = '';
    dateInput.focus();
  });

  tbody.addEventListener('click', function (event) {
    var editButton = event.target.closest('.edit');
    if (editButton) {
      var editEntry = entries.filter(function (item) { return item.id === editButton.dataset.id; })[0];
      if (editEntry) startEdit(editEntry);
      return;
    }

    var button = event.target.closest('.delete');
    if (!button) return;

    var id = button.dataset.id;
    var entry = entries.filter(function (item) { return item.id === id; })[0];
    if (!entry) return;

    var label = entry.subject + (entry.testType ? ' — ' + entry.testType : '');
    if (!window.confirm('Delete this entry?\n\n' + label + '\n' + formatDate(entry.date))) {
      return;
    }

    entries = entries.filter(function (item) { return item.id !== id; });
    if (editingId === id) cancelEdit();
    save();
    render();
  });

  // --- Export ----------------------------------------------------------------

  function csvField(value) {
    var text = String(value);
    if (/[",\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function entriesToCsv(list) {
    var header = ['Subject', 'Test type', 'Date', 'Score', 'Out of', '% Score'];
    var rows = list.map(function (entry) {
      return [
        entry.subject,
        entry.testType,
        entry.date,
        trimNumber(entry.score),
        trimNumber(entry.outOf),
        percentOf(entry)
      ].map(csvField).join(',');
    });
    return [header.join(',')].concat(rows).join('\r\n') + '\r\n';
  }

  exportCsvButton.addEventListener('click', function () {
    var csv = entriesToCsv(sortedEntries());
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'exam-scores.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  });

  // --- Publishing ----------------------------------------------------------

  function setNotice(html) {
    noticeEl.innerHTML = html;
    noticeEl.hidden = false;
  }

  function fetchPublished() {
    return Common.fetchJson(DATA_URL).then(function (data) {
      var list = data && Array.isArray(data.entries) ? data.entries : data;
      return {
        entries: normalize(list).entries,
        publishedAt: data && typeof data.publishedAt === 'string' ? data.publishedAt : null
      };
    });
  }

  var describePublishTime = Common.describePublishTime;

  publishButton.addEventListener('click', function () {
    var payload = {
      publishedAt: new Date().toISOString(),
      entries: entries
    };

    Common.downloadJson('data.json', payload);

    setNotice(
      '<strong>Downloaded <code>data.json</code> with ' + entries.length +
      ' ' + (entries.length === 1 ? 'entry' : 'entries') + '.</strong>' +
      '<ol><li>Move it into your site folder, replacing the old <code>data.json</code>.</li>' +
      '<li>Re-upload the folder to your host.</li>' +
      '<li>Family members reload the link to see the update.</li></ol>'
    );
  });

  // --- Init ----------------------------------------------------------------

  function startApp() {
    Common.initTheme({ themeToggle: themeToggle, themeLabel: themeLabel });

    if (isEditor) {
      publishButton.hidden = false;
      form.hidden = false;
      setNotice(
        '<strong>Edit mode.</strong> Changes are saved in this browser only. ' +
        'Click <strong>Publish</strong> to produce the <code>data.json</code> ' +
        'that family members see.'
      );
    }

    render();

    fetchPublished().then(function (published) {
      if (!isEditor) {
        entries = published.entries;
        if (published.entries.length) {
          setNotice('<strong>Read-only view.</strong>' +
            describePublishTime(published.publishedAt));
        }
        render();
        return;
      }

      // First time editing on a new device: start from what's already published
      // instead of an empty table.
      if (!entries.length && published.entries.length) {
        entries = published.entries;
        save();
        render();
        setNotice(
          '<strong>Loaded ' + entries.length + ' published entries into this browser.</strong> ' +
          'Add or delete entries, then click <strong>Publish</strong> to update the shared page.'
        );
      }
    }).catch(function () {
      if (isEditor) return;

      // No published file reachable — opening from disk blocks the read, and there
      // may be no data.json yet. Fall back to this browser's own entries so the
      // page is still useful; add "#edit" to change them.
      entries = load();
      render();

      if (entries.length) {
        setNotice(
          '<strong>Showing this browser\'s saved entries.</strong> ' +
          'The published <code>data.json</code> could not be read — browsers block ' +
          'that when a page is opened from disk. Add <code>#edit</code> to the URL to make changes.'
        );
      } else {
        setNotice(
          '<strong>Nothing to show yet.</strong> ' +
          'Add <code>#edit</code> to the URL to enter your first entry.'
        );
      }
    });
  }

  // --- Access gate -----------------------------------------------------------
  // The config (required / hash) lives in gate-init.js so the lock state can
  // be resolved before first paint, with no flash of real content. Nothing
  // here is real server-side security — it's a deterrent for casual visitors
  // and search engines, not protection against someone reading the page source.

  Common.initGate({
    gateForm: gateForm,
    gatePasswordInput: gatePasswordInput,
    gateError: gateError
  }, startApp);
})();
