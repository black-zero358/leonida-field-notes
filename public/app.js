(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page || 'chapter';
  const script = document.currentScript || document.querySelector('script[src*="app.js"]');
  const assetRoot = new URL('.', script?.src || document.baseURI);
  const menu = $('site-menu');
  // A downloaded copy uses explicit filenames; hosted routes use directory URLs.
  if (location.protocol === 'file:') {
    for (const link of document.querySelectorAll('a[href$="/"]')) {
      const url = new URL(link.href);
      if (url.protocol === 'file:') link.href += 'index.html';
    }
  }

  function pageUrl(destination) {
    return new URL(menu.querySelector('[data-page-link="' + destination + '"]').href);
  }

  function redirectOldBookmark() {
    if (page !== 'chapter') return false;
    const fragment = location.hash.slice(1);
    const destination = /^person-[a-z0-9-]+$/.test(fragment) ? 'people' : fragment;
    if (!['weapons', 'missions', 'people', 'references'].includes(destination)) return false;
    const url = pageUrl(destination);
    url.search = location.search;
    if (destination !== fragment) url.hash = fragment;
    location.replace(url.href);
    return true;
  }
  if (redirectOldBookmark()) return;

  const guide = window.GUIDE_DATA;
  if (!guide?.chapters?.length) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '手记资料未能载入，请刷新页面。';
    document.querySelector('main').prepend(message);
    return;
  }
  const chapters = guide.chapters;
  const sources = new Map(guide.sources.map(source => [source.id, source]));
  const key = 'leonida-field-notes.v1';
  const dialog = $('progress-dialog');
  const first = chapters[0];
  const fresh = () => ({chapter: first.id, reached: 0, lang: 'zh-Hans', records: {}});
  const blank = () => ({active: '', done: [], owned: []});
  let state = load();
  let draft;
  let toastTimer;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function symbol(name) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS(icon.namespaceURI, 'use');
    use.setAttribute('href', '#i-' + name);
    icon.setAttribute('aria-hidden', 'true');
    icon.append(use);
    return icon;
  }

  function chapterOf(data) {
    return chapters.find(chapter => chapter.id === data.chapter) || first;
  }

  function record(data, chapter = chapterOf(data)) {
    return data.records[chapter.id] ||= blank();
  }

  function uniq(values, valid) {
    return [...new Set(Array.isArray(values) ? values.filter(value => valid.has(value)) : [])];
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      if (!value || !chapters.some(chapter => chapter.id === value.chapter)) return null;
      const data = fresh();
      data.chapter = value.chapter;
      data.lang = value.lang === 'zh-Hant' ? 'zh-Hant' : 'zh-Hans';
      data.reached = Math.min(chapters.length - 1, Math.max(chapters.findIndex(c => c.id === data.chapter), Number.isInteger(value.reached) ? value.reached : 0));
      for (const chapter of chapters.slice(0, data.reached + 1)) {
        const saved = value.records?.[chapter.id];
        if (!saved) continue;
        const missions = new Set(chapter.missions.map(mission => mission.id));
        data.records[chapter.id] = {
          active: missions.has(saved.active) ? saved.active : '',
          done: uniq(saved.done, missions),
          owned: uniq(saved.owned, new Set([...chapter.weapons, ...(chapter.fieldNotes || [])].map(item => item.id))),
        };
      }
      return data;
    } catch {
      return null;
    }
  }

  function load() {
    const saved = readSaved();
    const data = saved || fresh();
    const params = new URLSearchParams(location.hash.slice(1));
    const at = params.get('at');
    if (at) {
      if (!saved) {
        const index = chapters.findIndex(chapter => chapter.missions.some(mission => mission.id === at));
        if (index >= 0) {
          data.reached = index;
          data.chapter = chapters[index].id;
          record(data).active = at;
          persist(data);
        }
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
    return data;
  }

  function persist(data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  function notify(message) {
    clearTimeout(toastTimer);
    $('live').textContent = message;
    toastTimer = setTimeout(() => { $('live').textContent = ''; }, 2800);
  }

  function localized(item, property = 'title', lang = state.lang) {
    return (lang === 'zh-Hant' && item[property + 'Hant']) || item[property] || item.original;
  }

  function setList(id, children, fallback) {
    $(id).replaceChildren(...(children.length ? children : [node('p', 'empty', fallback)]));
  }

  function observedMissions(chapter, rec) {
    const visited = new Set([...rec.done, rec.active].filter(Boolean));
    const byId = new Map(chapter.missions.map(mission => [mission.id, mission]));
    const queue = [...visited];
    while (queue.length) {
      const current = byId.get(queue.pop());
      for (const ancestor of current?.verifiedPrior || []) {
        if (visited.has(ancestor)) continue;
        visited.add(ancestor);
        queue.push(ancestor);
      }
    }
    return visited;
  }

  function missionLabel(mission, lang = state.lang) {
    return localized(mission, 'title', lang);
  }

  function missionTitleBlock(mission) {
    const block = node('div');
    block.append(node('b', '', missionLabel(mission)));
    if (mission.original) block.append(node('span', 'en-name', mission.original));
    return block;
  }

  function missionStatus(mission, rec, visited) {
    if (rec.done.includes(mission.id)) return '已完成';
    if (rec.active === mission.id) return '进行中';
    return visited.has(mission.id) ? '前置任务' : '未标记';
  }

  function entrySources(references) {
    const links = (references || []).filter(ref => /^https?:\/\//.test(ref.url));
    if (!links.length) return null;
    const details = node('details', 'entry-links');
    const summary = node('summary', '', '核对来源');
    summary.append(symbol('chevron'));
    const list = node('div');
    for (const source of links) {
      const a = node('a', '', source.label || source.title);
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      list.append(a);
    }
    details.append(summary, list);
    return details;
  }

  function collectionButton(rec, item) {
    const button = node('button', 'collect');
    button.type = 'button';
    function label() {
      const marked = rec.owned.includes(item.id);
      button.setAttribute('aria-pressed', String(marked));
      button.replaceChildren(symbol(marked ? 'check' : 'mark'), document.createTextNode(marked ? '已取得' : '标记已取得'));
    }
    label();
    button.addEventListener('click', () => {
      const remove = rec.owned.includes(item.id);
      rec.owned = remove ? rec.owned.filter(id => id !== item.id) : [...rec.owned, item.id];
      const saved = persist(state);
      label();
      notify(saved ? (remove ? '已取消取得标记' : '已记录取得这件物品') : '记录仅在本次打开期间有效');
      button.dispatchEvent(new Event('collectionchange'));
    });
    return button;
  }

  function renderFieldNotes(chapter, rec, visited) {
    const entries = chapter.fieldNotes || [];
    const box = $('field-notes');
    box.open = false;
    box.hidden = !entries.length;
    const kinds = {recoverable: '可以补拿', conditional: '条件窗口', unconfirmed: '永久错过性待核', optional: '可选事项'};
    const byId = new Map(chapter.missions.map(mission => [mission.id, mission]));
    $('field-list').replaceChildren(...entries.map(entry => {
      const article = node('article', 'field-note');
      article.append(node('span', 'field-kind', kinds[entry.kind] || '收集提示'), node('h3', '', localized(entry)), node('p', '', entry.tip));
      const first = byId.get(entry.from);
      const last = byId.get(entry.until);
      if (first || last) {
        const when = [];
        if (first) when.push('起始任务 · ' + missionLabel(first));
        if (last) when.push('截止任务 · ' + missionLabel(last));
        if (last && visited.has(last.id) && rec.active !== last.id) when.push('已过该节点');
        article.append(node('p', 'field-window', when.join('　')));
      }
      if (entry.collectible || entry.id === 'gils-kalinga') article.append(collectionButton(rec, entry));
      const refs = entrySources((entry.sources || []).map(id => sources.get(id)).filter(Boolean));
      if (refs) article.append(refs);
      return article;
    }));
  }

  function referenceTable(className, label, headings, rows) {
    const table = node('table', className);
    table.setAttribute('aria-label', label);
    const head = table.createTHead().insertRow();
    for (const title of headings) {
      const th = node('th', '', title);
      th.scope = 'col';
      head.append(th);
    }
    table.createTBody().append(...rows);
    return table;
  }

  function disclosure(label, content) {
    const details = node('details', 'notes-disclosure');
    const summary = node('summary', '', label);
    summary.append(symbol('chevron'));
    details.append(summary, content);
    return details;
  }

  function weaponWindow(weapon, rec, visited) {
    if (rec.done.includes(weapon.expiresAt) || (visited.has(weapon.expiresAt) && rec.active !== weapon.expiresAt)) return 'expired';
    if (rec.active && rec.active === weapon.availableAfter) return 'active';
    return 'upcoming';
  }

  function renderWeapons(chapter, rec, visited) {
    $('weapon-count').textContent = chapter.weapons.length + ' 件';
    const rows = chapter.weapons.map(weapon => {
      const row = node('tr', 'weapon-card');
      const name = row.insertCell();
      name.append(node('h3', '', localized(weapon)), node('span', 'en-name', weapon.original));
      const windowMission = chapter.missions.find(mission => mission.id === weapon.availableAfter);
      const windowState = weaponWindow(weapon, rec, visited);
      const status = {expired: '领取窗口已结束', active: '当前任务可领取', upcoming: '任务内限定'}[windowState];
      const timing = row.insertCell();
      timing.append(node('span', 'weapon-status ' + windowState, status), node('span', 'weapon-window', windowMission ? missionLabel(windowMission) : weapon.timing));
      const hint = disclosure('领取提示', node('p', 'weapon-description', weapon.tip));
      hint.className = 'pickup-info';
      hint.open = windowState === 'active';
      timing.append(hint);
      const actions = row.insertCell();
      actions.append(collectionButton(rec, weapon));
      const refs = entrySources((weapon.sources || []).map(id => sources.get(id)).filter(Boolean));
      if (refs) actions.append(refs);
      return row;
    });
    setList('weapon-list', rows.length ? [referenceTable('weapon-table', '本章限定武器', ['物品', '领取窗口', '收录'], rows)] : [], chapter.weaponsNote || '本章暂未收录经核实的永久错过武器。');
  }

  function renderMissions(chapter, rec, visited) {
    const known = [];
    const ahead = [];
    const all = [];
    const priority = [rec.active, 'gone-fishing', 'unwanted-attention', 'buck-me', ...rec.done.slice().reverse()];
    for (const mission of chapter.missions) {
      const status = missionStatus(mission, rec, visited);
      const statusClass = 'row-state' + (status === '已完成' ? ' done' : status === '进行中' ? ' active' : '');
      const row = node('div', 'all-row');
      const block = missionTitleBlock(mission);
      if (mission.aliases?.length) block.append(node('small', 'alias', '亦见「' + mission.aliases.join('」「') + '」'));
      row.append(block, node('span', statusClass, status));
      const refs = entrySources(mission.references);
      if (refs) row.append(refs);
      all.push(row);
      if (!mission.unlock?.length) continue;
      const feature = node('tr', 'unlock-row');
      feature.insertCell().append(missionTitleBlock(mission));
      feature.insertCell().append(node('span', 'feature', mission.unlock.join(' ')));
      feature.insertCell().append(node('span', statusClass, status));
      if (visited.has(mission.id)) {
        const rank = priority.indexOf(mission.id);
        known.push({rank: rank < 0 ? priority.length : rank, row: feature});
      } else {
        ahead.push(feature);
      }
    }
    $('mission-count').textContent = rec.done.length + ' / ' + chapter.missions.length + ' 已标记完成';
    const unlockTable = rows => referenceTable('unlock-table', '任务对应功能', ['任务', '开放功能', '进度'], rows);
    const ranked = known.sort((a, b) => a.rank - b.rank).map(item => item.row);
    setList('unlock-list', ranked.length ? [unlockTable(ranked.slice(0, 3))] : [], '记录当前任务后，可在这里查看已遇到的功能。');
    if (ranked.length > 3) $('unlock-list').append(disclosure('其余已遇到的功能（' + (ranked.length - 3) + '）', unlockTable(ranked.slice(3))));
    if (ahead.length) $('unlock-list').append(disclosure('预览本章后续功能（' + ahead.length + '）', unlockTable(ahead)));
    $('mission-list').replaceChildren(...all);
    $('chapter-note').textContent = chapter.note || '';
    $('chapter-note').hidden = !chapter.note;
    const last = chapter.missions.find(mission => mission.isFinal);
    const index = chapters.indexOf(chapter);
    $('next-chapter').hidden = !(index < chapters.length - 1 && last && rec.done.includes(last.id));
  }

  function encountered(person, visited) {
    return !person.appearsAfter || visited.has(person.appearsAfter) || person.knownBy?.some(id => visited.has(id));
  }

  function renderPortraitRail(people) {
    const portraitRail = $('portrait-rail');
    const portraits = people.filter(person => person.portrait).slice(0, 3);
    portraitRail.replaceChildren(...portraits.map(person => {
      const address = node('a', 'rail-person');
      const url = pageUrl('people');
      url.hash = 'person-' + person.id;
      address.href = url.href;
      const image = node('img');
      image.src = new URL(person.portrait, assetRoot).href;
      image.alt = '';
      address.append(image, node('span', 'rail-caption', localized(person, 'name')));
      return address;
    }));
    if (!portraits.length) {
      const scene = node('img', 'rail-scenery');
      scene.src = new URL('assets/keys-dusk-mobile.webp', assetRoot).href;
      scene.alt = '海湾公路与暮色中的棕榈';
      portraitRail.append(scene);
    }
  }

  function renderPeople(people) {
    $('people-count').textContent = people.length + ' 位已登场';
    setList('people-list', people.map(person => {
      const card = node('article', 'person');
      card.id = 'person-' + person.id;
      const photo = node('div', 'person-photo');
      if (person.portrait) {
        const img = node('img');
        img.src = new URL(person.portrait, assetRoot).href;
        img.alt = localized(person, 'name');
        img.loading = 'lazy';
        photo.append(img);
      } else {
        photo.append(node('span', '', person.original?.slice(0, 1) || localized(person, 'name').slice(0,1)));
        photo.setAttribute('aria-label', '姓名首字名牌');
      }
      const body = node('div', 'person-body');
      body.append(node('h3', '', localized(person, 'name')), node('p', 'en-name', person.original));
      if (person.role) body.append(node('p', 'person-role', person.role));
      const refs = entrySources((person.sources || []).map(id => sources.get(id)).filter(Boolean));
      if (refs) body.append(refs);
      card.append(photo, body);
      return card;
    }), '记录当前任务后，已登场的人物会出现在这里。');
  }

  function renderSources(chapter, visited) {
    const ids = new Set(chapter.sources || []);
    for (const entry of [...chapter.missions, ...chapter.weapons, ...(chapter.fieldNotes || [])]) {
      for (const id of entry.sources || []) ids.add(id);
    }
    for (const person of chapter.people) {
      if (encountered(person, visited)) {
        for (const id of person.sources || []) ids.add(id);
      }
    }
    const frag = document.createDocumentFragment();
    frag.append(node('p', 'context-note', '外部攻略可能涉及后续剧情。'));
    if (chapter.namesNote) frag.append(node('p', 'context-note', chapter.namesNote));
    for (const id of ids) {
      const source = sources.get(id);
      if (!source) continue;
      const link = node('a', '', source.title);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const p = node('p');
      p.append(link);
      frag.append(p);
    }
    const credits = node('p', 'context-note', '场景插画为原创，人物辨识缩略图附有独立图源。');
    const portraitCredits = node('a', '', '查看头像出处（含后续人物）');
    portraitCredits.href = new URL('assets/portraits/credits.json', assetRoot).href;
    portraitCredits.target = '_blank';
    portraitCredits.rel = 'noopener noreferrer';
    credits.append(' ', portraitCredits);
    frag.append(credits);
    $('sources').replaceChildren(frag);
  }

  function renderChapter(chapter, rec, visited, active, current) {
    const people = chapter.people.filter(person => encountered(person, visited));
    const unlocked = chapter.missions.filter(mission => visited.has(mission.id) && mission.unlock?.length);
    const windows = chapter.weapons.map(weapon => weaponWindow(weapon, rec, visited));
    const collected = chapter.weapons.filter(weapon => rec.owned.includes(weapon.id)).length;
    const available = windows.filter(status => status === 'active').length;
    const expired = windows.filter(status => status === 'expired').length;
    let itemStatus = chapter.weapons.length ? '本章有 ' + chapter.weapons.length + ' 件限时物品' : '本章有可补拿物品';
    if (available) itemStatus = available + ' 件正处领取窗口';
    if (collected) itemStatus = '已收录 ' + collected + ' 件限时物品';
    else if (expired) itemStatus = expired + ' 件已过领取窗口';
    $('weapon-count').textContent = itemStatus;
    $('mission-count').textContent = '已遇到 ' + unlocked.length + ' 项功能';
    $('people-count').textContent = people.length + ' 位已登场';
    renderPortraitRail(people);
    const focus = $('focus-note');
    const last = chapter.missions.find(mission => mission.isFinal);
    let note = active?.focusNote;
    if (note && last) note = note.replace('「' + last.title + '」', '章末');
    if (active?.id === 'tourist-trap') note = '已进入章末连续任务。唐尼左轮的领取窗口已结束，可以继续推进主线。';
    if (!note) note = active?.unlock?.join(' ') || (current ? '完成任务后，在进度清单中勾选，即可更新本章记录。' : '选择正在游玩的任务，查看领取窗口、已开放功能和已登场人物。');
    focus.replaceChildren(node('div', '', note));
    focus.hidden = false;
    $('final-note').hidden = true;
    $('final-note').textContent = chapter.finalNote || '';
    $('final-toggle').setAttribute('aria-expanded', 'false');
    $('final-toggle').querySelector('span').textContent = '查看章末任务';
  }

  function render() {
    const chapter = chapterOf(state);
    const rec = record(state);
    const visited = observedMissions(chapter, rec);
    $('chapter-index').textContent = chapter.label;
    $('chapter-name').textContent = localized(chapter);
    $('chapter-original').textContent = chapter.original || '';
    const active = chapter.missions.find(mission => mission.id === rec.active);
    const latest = chapter.missions.find(mission => mission.id === rec.done.at(-1));
    $('progress-label').textContent = active ? '正在进行' : latest ? '最近完成' : '任务进度';
    const current = active || latest;
    $('current-mission').textContent = current ? missionLabel(current) : '尚未记录';
    $('current-original').textContent = current?.original || '';
    switch (page) {
      case 'chapter':
        renderChapter(chapter, rec, visited, active, current);
        break;
      case 'weapons':
        renderWeapons(chapter, rec, visited);
        renderFieldNotes(chapter, rec, visited);
        break;
      case 'missions':
        $('all-missions').open = false;
        renderMissions(chapter, rec, visited);
        break;
      case 'people':
        renderPeople(chapter.people.filter(person => encountered(person, visited)));
        break;
      case 'references':
        renderSources(chapter, visited);
        break;
    }
  }

  function changeChapter(index) {
    if (index < 0 || index >= chapters.length) return;
    draft.reached = Math.max(draft.reached, index);
    draft.chapter = chapters[index].id;
    renderDialog();
  }

  function renderDialog() {
    const chapter = chapterOf(draft);
    const rec = record(draft);
    $('chapter-select').replaceChildren(...chapters.slice(0, draft.reached + 1).map(item => new Option(item.label + (item.title ? ' · ' + localized(item, 'title', draft.lang) : ''), item.id)));
    if (draft.reached < chapters.length - 1) $('chapter-select').add(new Option('我已进入下一章', 'advance'));
    $('chapter-select').value = chapter.id;
    $('active-select').replaceChildren(new Option('暂未选择', ''), ...chapter.missions.map(mission => new Option(missionLabel(mission, draft.lang) + (mission.original ? ' · ' + mission.original : ''), mission.id)));
    $('active-select').value = rec.active;
    $('lang-select').value = draft.lang;
    const checks = chapter.missions.map(mission => {
      const label = node('label', 'check-row');
      const input = node('input');
      input.type = 'checkbox';
      input.value = mission.id;
      input.checked = rec.done.includes(mission.id);
      const text = node('span', '', missionLabel(mission, draft.lang));
      if (mission.original) text.append(node('small', '', mission.original));
      label.append(input, text);
      return label;
    });
    $('checklist').replaceChildren(...checks);
  }

  function openDialog(advance = false) {
    draft = JSON.parse(JSON.stringify(state));
    if (advance) changeChapter(chapters.indexOf(chapterOf(draft)) + 1);
    else renderDialog();
    dialog.showModal();
    document.documentElement.classList.add('modal-open');
  }

  $('chapter-select').addEventListener('change', event => {
    const index = event.target.value === 'advance' ? draft.reached + 1 : chapters.findIndex(chapter => chapter.id === event.target.value);
    changeChapter(index);
  });
  $('active-select').addEventListener('change', event => {
    const rec = record(draft);
    rec.active = event.target.value;
    if (rec.done.includes(rec.active)) {
      rec.done = rec.done.filter(id => id !== rec.active);
      renderDialog();
    }
  });
  $('lang-select').addEventListener('change', event => {
    draft.lang = event.target.value;
    renderDialog();
  });
  $('checklist').addEventListener('change', event => {
    const input = event.target;
    if (input.type !== 'checkbox') return;
    const rec = record(draft);
    rec.done = input.checked ? [...new Set([...rec.done, input.value])] : rec.done.filter(id => id !== input.value);
    if (input.checked && input.value === rec.active) {
      rec.active = '';
      $('active-select').value = '';
    }
  });
  $('progress-form').addEventListener('submit', event => {
    event.preventDefault();
    state = draft;
    const saved = persist(state);
    dialog.close();
    render();
    notify(saved ? '已保存本机进度' : '记录仅在本次打开期间有效');
  });
  $('final-toggle')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const open = button.getAttribute('aria-expanded') === 'false';
    const last = chapterOf(state).missions.find(mission => mission.isFinal);
    button.setAttribute('aria-expanded', String(open));
    $('final-note').hidden = !(open && chapterOf(state).finalNote);
    button.querySelector('span').textContent = open ? (last ? missionLabel(last) + (last.original ? ' · ' + last.original : '') : '章末任务仍待核实') : '查看章末任务';
  });
  for (const button of document.querySelectorAll('[data-open]')) button.addEventListener('click', () => openDialog());
  for (const id of ['dismiss','cancel']) $(id).addEventListener('click', () => dialog.close());
  $('next-chapter')?.addEventListener('click', () => openDialog(true));
  dialog.addEventListener('close', () => document.documentElement.classList.remove('modal-open'));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  const menuToggle = $('menu-toggle');
  function setMenu(open) {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
  }
  window.addEventListener('hashchange', redirectOldBookmark);
  menuToggle.addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('click', event => {
    if (!menu.hidden && !menu.contains(event.target) && !menuToggle.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) {
      setMenu(false);
      menuToggle.focus();
    }
  });
  window.addEventListener('storage', event => {
    if ((event.key === key || event.key === null) && !dialog.open) {
      state = readSaved() || fresh();
      render();
    }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    setMenu(false);
    if (dialog.open) dialog.close();
    state = readSaved() || fresh();
    render();
  });
  render();
  if (page === 'people' && location.hash.startsWith('#person-')) {
    $(location.hash.slice(1))?.scrollIntoView({block: 'center'});
  }
})();
