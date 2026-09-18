// Nomad Dimension — the Library: material, fact-check review, duplicates, places, ideas.

async function ytAPI(path, params = {}) {
  const res = await _afetch(
    '/.netlify/functions/youtube-proxy',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, params }),
    },
    25000
  );
  const data = await res.json().catch(() => {
    throw new Error(`YouTube returned an unreadable response (HTTP ${res.status})`);
  });
  if (!res.ok || data.error)
    throw Object.assign(
      new Error(data.error?.message || data.error || `YouTube request failed (HTTP ${res.status})`),
      { status: res.status }
    );
  return data;
}

function sourceYouTubeID(value) {
  try {
    const url = new URL(value),
      host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host))
      return '';
    const id =
      host === 'youtu.be'
        ? url.pathname.split('/')[1]
        : url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch {
    return '';
  }
}

function sourceQueueNav(sel, pos) {
  return `<div class="source-queue-nav"><label>Source ${pos + 1} of ${sel.length}<select aria-label="Current source" onchange="focusPrepSource(this.value)">${sel.map(({ v }) => `<option value="${_esc(v.id)}" ${v.id === S.prepFocusId ? 'selected' : ''}>${_esc(v.title)} · ${v._breakdownUnsaved ? 'Save pending' : isBreakdownCurrent(v) ? 'Analysis saved' : v.transcript ? 'Ready to analyse' : 'Needs transcript'}</option>`).join('')}</select></label><div class="idea-actions"><button class="btn btn-sm" onclick="movePrepSource(-1)" ${pos <= 0 ? 'disabled' : ''}>Previous source</button><button class="btn btn-sm" onclick="movePrepSource(1)" ${pos >= sel.length - 1 ? 'disabled' : ''}>Next source</button></div></div>`;
}

function reviewSourceMaterial(i) {
  const v = S.epQueue[i];
  if (!v) return;
  S.prepFocusId = v.id;
  S.reviewSourceId = v.id;
  prepStep(3);
}

function reviewExtractionChat() {
  const ctx = S.extractionChat;
  if (!ctx || ctx.saving) return;
  delete ctx.review;
  document.getElementById('extract-chat-confirm').checked = false;
  try {
    const text = document.getElementById('extract-chat-result').value;
    if (text.length > 190000)
      throw new Error('Result is too large. Split the task before importing.');
    const { parsed, repairs } = parseExtractionImport(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Paste one JSON object.');
    if (parsed.source_id && parsed.source_id !== ctx.id)
      throw new Error(
        'This result names a different source. Open that source before importing it.'
      );
    const arrays = [
      'activities',
      'food',
      'transport',
      'research',
      'prices',
      'data',
      'glossary',
      'beats',
      'tips',
      'quotes',
      'route',
    ];
    for (const key of arrays)
      if (
        parsed[key] != null &&
        (!Array.isArray(parsed[key]) ||
          parsed[key].some((x) =>
            key === 'tips' || key === 'route'
              ? typeof x !== 'string' && typeof x !== 'object'
              : !x || typeof x !== 'object' || Array.isArray(x)
          ))
      )
        throw new Error(`Invalid ${key} list.`);
    if (parsed.summary != null && typeof parsed.summary !== 'string')
      throw new Error('Summary must be text.');
    if (!arrays.some((k) => parsed[k]?.length) && !parsed.summary)
      throw new Error('No recognizable extracted content.');
    ctx.review = { text, parsed };
    document.getElementById('extract-chat-review').textContent = JSON.stringify(parsed, null, 2);
    document.getElementById('extract-chat-notice').textContent =
      (repairs
        ? `Recovered ${repairs} quotation/control-character escapes. Review the recovered text below; the original paste is retained. `
        : 'JSON is readable. ') +
      (parsed.source_id
        ? 'Source ID matches.'
        : 'No source ID supplied. Confirm the video title before saving.');
  } catch (e) {
    document.getElementById('extract-chat-review').textContent = e.message;
  }
  updateExtractionUse();
}

function materialEvidenceBlock(it) {
  const json = JSON.stringify({
    nomadMaterial: 1,
    identity: materialIdentity(it),
    observation: Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith('_'))),
    original:
      it._original || Object.fromEntries(Object.entries(it).filter(([k]) => !k.startsWith('_'))),
  });
  if (new TextEncoder().encode(json).length > 65536)
    throw new Error(
      'This material exceeds the evidence limit. Shorten the candidate without removing its source reference.'
    );
  return { object: 'block', type: 'code', code: { language: 'json', rich_text: libRT(json) } };
}

function materialEvidence(blocks) {
  for (const b of blocks || [])
    if (b.type === 'code')
      try {
        const d = JSON.parse(richText(b.code));
        if (d.nomadMaterial === 1) return d;
      } catch {
        /* unrelated blocks */
      }
  return null;
}

function reviewAll(src, key, on) {
  const selected = (REVIEW.selected ||= new Set()),
    visible = visibleTableKeys(`review-${src}-${key}`);
  for (const it of poolFor(key, src))
    if (!visible || visible.has(it._key)) {
      if (on) selected.add(it._key);
      else selected.delete(it._key);
    }
  renderReviewInto(src === 'web' ? 'web-review' : 'extract-review', src);
}

function reviewReceiptKey(src) {
  return src === 'prep' && S.reviewSourceId ? `prep:${S.reviewSourceId}` : src;
}

function materialSavePending(job) {
  return job && ['queued', 'saving'].includes(job.state);
}

function materialCandidateSaving(key) {
  return Object.values(REVIEW.jobs).some((job) => materialSavePending(job) && job.keys.has(key));
}

function materialSaveStatus(src) {
  const scope = reviewReceiptKey(src);
  const pending = Object.values(REVIEW.jobs).some(materialSavePending);
  return (
    (pending
      ? '<p class="library-message">You can work on other sources while saves finish. Keep this browser tab open.</p>'
      : '') +
    Object.values(REVIEW.jobs)
      .filter((job) => materialSavePending(job) || job.scope === scope)
      .map(
        (job) =>
          `<div class="library-message" role="status"><strong>${_esc(job.title)}</strong> · ${job.state === 'queued' ? 'Queued — waiting for the current save' : job.state === 'saving' ? `Saving · ${job.saved} of ${job.total} confirmed` : job.state === 'done' ? `Saved ${job.saved} material records` : `${job.saved} saved · ${job.total - job.saved} remain accepted`}${job.error ? `<p class="library-error">${_esc(job.error)} Retry checks existing receipts before creating records.</p>` : ''}${materialSavePending(job) ? ` <button class="btn btn-sm" onclick="stopMaterialSave(${_esc(JSON.stringify(job.scope))})" ${job.stop ? 'disabled' : ''}>${job.stop ? 'Stopping after current record…' : job.state === 'queued' ? 'Cancel queued save' : 'Stop after current record'}</button>` : ''}</div>`
      )
      .join('')
  );
}

async function findDuplicates(btn) {
  const q = document.getElementById('vlib-q');
  if (q) q.value = '';
  await searchLibrary(btn);
  if ((S.vlib || []).length && !S._vlibTidy) tidyVlib();
}

function webMode(m) {
  document.getElementById('web-new-rows').hidden = m !== 'ask';
  document.getElementById('web-ask-panel').style.display = m === 'ask' ? '' : 'none';
  document.getElementById('web-verify-panel').style.display = m === 'verify' ? '' : 'none';
  document.getElementById('web-mode-ask').classList.toggle('active', m === 'ask');
  document.getElementById('web-mode-verify').classList.toggle('active', m === 'verify');
  if (m === 'verify') {
    renderVlibPicker();
    if (!S.vlib?.length) setVerifySource(S._vlibSource || 'saved');
  }
}

async function _verifyBatch(store, items) {
  const d = await _postJSON('/.netlify/functions/web-research', { mode: 'verify', store, items });
  return {
    verified: d.verified || [],
    sources: d.sources || [],
    model: d.model,
    usage: d.usage || null,
    costUsd: typeof d.costUsd === 'number' ? d.costUsd : null,
  };
}

async function searchLibrary(btn) {
  if (_libVerifying || (S.vlib || []).some((r) => r._saving)) {
    toast('Wait for the current checks or saves to finish.');
    return;
  }
  const stores = LIB_STORES.filter((k) => document.getElementById(`vlib-pick-${k}`)?.checked);
  if (!stores.length) {
    toast('Tick at least one table', 'error');
    return;
  }
  const el = document.getElementById('vlib-results');

  // "This session" source: rows from the current Prep pool, not yet saved to Notion.
  if (S._vlibSource === 'session') {
    const out = [];
    for (const store of stores) {
      if (store === 'places') continue;
      const cfg = RESEARCH_STORES[store];
      for (const it of poolFor(store, 'prep')) {
        out.push({
          store,
          name: cfg.name(it),
          fields: _verifyDetail(store, it),
          _key: it._key,
          status: it._verified ? 'checked' : '',
          note: it.verify_note || '',
        });
      }
    }
    S.vlib = out;
    S._vlibSkip = new Set();
    S._vlibTidy = false;
    S._vlibArch = new Set();
    for (const r of out) {
      await restoreFactDrafts(r);
      if (hasCheck(r)) S._vlibSkip.add(r.id || r._key);
    }
    renderVlibResults();
    toast(
      out.length
        ? `${out.length} unsaved row${out.length === 1 ? '' : 's'}`
        : 'Nothing found this session — analyse some videos first',
      out.length ? 'success' : 'error'
    );
    return;
  }

  const q = document.getElementById('vlib-q').value.trim().toLowerCase(); // blank = load all
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Searching…';
  }
  el.innerHTML =
    '<div class="loading-row"><div class="spinner"></div> Searching your Notion tables…</div>';
  try {
    S._vlibRaw = S._vlibRaw || {}; // per-store row cache for the session
    const out = [];
    for (const store of stores) {
      const cfg = RESEARCH_STORES[store];
      if (!S._vlibRaw[store]) {
        const rows = await notionQueryAll(cfg.db()); // fully paginated — don't truncate at 100
        S._vlibRaw[store] = rows
          .map((row) => {
            const props = row.properties || {};
            const name = _readProp(props[cfg.titleProp]);
            const fields = Object.entries(props)
              .filter(
                ([k]) =>
                  k !== cfg.titleProp &&
                  !k.startsWith('Verify') &&
                  !['Source Video', 'Date Added', 'Retrieved Date', 'Last Verified'].includes(k)
              )
              .map(([k, v]) => {
                const t = _readProp(v);
                return t ? `${k}: ${t}` : '';
              })
              .filter(Boolean)
              .join(' · ');
            return {
              store,
              id: row.id,
              lastEdited: row.last_edited_time,
              name,
              fields,
              status: _readProp(props['Verify Status']),
              note: richText(props['Verify Note']),
              data: richText(props['Verify Data']),
            };
          })
          .filter((r) => r.name);
      }
      for (const r of S._vlibRaw[store]) {
        if (!q || `${r.name} · ${r.fields}`.toLowerCase().includes(q)) out.push({ ...r });
      }
    }
    S.vlib = out;
    S._vlibSkip = new Set(out.map((r) => r.id || r._key));
    for (const r of out) {
      await restoreFactDrafts(r);
      if (!hasCheck(r)) S._vlibSkip.delete(r.id || r._key);
    }
    S._vlibTidy = false;
    S._vlibArch = new Set();
    renderVlibResults();
    toast(
      `${out.length} ${q ? 'match' : 'row'}${out.length === 1 ? '' : q ? 'es' : 's'} across ${stores.length} table${stores.length === 1 ? '' : 's'}`,
      out.length ? 'success' : 'error'
    );
  } catch (e) {
    el.innerHTML = `<div class="info-box error">Search failed: ${_esc(e.message)}</div>`;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Load / search →';
    }
  }
}

function checkRecord(r) {
  const raw = r._newData !== undefined ? r._newData : r.data;
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (
        data.version !== 1 ||
        [data.ai, data.review]
          .filter(Boolean)
          .some((v) => !['confirmed', 'corrected', 'unsupported'].includes(v.verdict))
      )
        throw new Error();
      return data;
    } catch {
      /* fall through to the note, and repair on the next save */
    }
  }
  const note = r._newNote || r.note || '';
  if (!note.includes(CHECK_MARKER))
    return {
      legacy:
        note || ['confirmed', 'corrected', 'unsupported'].includes(r._newStatus || r.status)
          ? { verdict: r._newStatus || r.status, note }
          : null,
    };
  try {
    const data = JSON.parse(note.split(CHECK_MARKER)[1]);
    if (
      data.version !== 1 ||
      [data.ai, data.review]
        .filter(Boolean)
        .some((v) => !['confirmed', 'corrected', 'unsupported'].includes(v.verdict))
    )
      throw new Error();
    return data;
  } catch {
    return { legacy: { verdict: r.status, note }, invalid: true };
  }
}

function checkBadge(v) {
  return `<span class="badge ${v === 'confirmed' ? 'badge-green' : v === 'corrected' ? 'badge-amber' : ''}">${checkLabel(v)}</span>`;
}

function checkEvidence(v) {
  if (!v) return '—';
  const url = safeURL(v.source_url);
  return `<p>${_esc(v.note || 'No explanation supplied.')}</p>${v.corrected_value ? `<p>Correction: ${_esc(v.corrected_value)}</p>` : ''}${url !== '#' ? `<a href="${_esc(url)}" target="_blank" rel="noopener noreferrer">Open evidence ↗</a>` : ''}<small style="display:block">${_esc([v.as_of_date && `As of ${v.as_of_date}`, v.checkedAt && `Checked ${v.checkedAt.slice(0, 10)}`, v.model].filter(Boolean).join(' · '))}</small>`;
}

function factNextStep() {
  const rows = S.vlib || [];
  if (!rows.length || S._vlibTidy) return null;
  if (_libVerifying)
    return {
      label: 'Checking…',
      hint: 'Findings save as they complete. Use “Stop after current request” to pause safely; a reload resumes from the last saved finding.',
    };
  const pending = rows.filter((r) => r._aiPending).length;
  if (pending)
    return {
      label: `Retry ${pending} interrupted save${pending > 1 ? 's' : ''} — no AI needed`,
      action: 'retryAllFactSaves(this)',
    };
  const failed = rows.filter((r) => r._retry && !r._aiPending).length;
  if (failed)
    return {
      label: `Retry ${failed} failed check${failed > 1 ? 's' : ''} · API`,
      action: `runLibVerify(this,'failed')`,
      hint: 'One claim per request, so a bad reply cannot fail the rest.',
    };
  const skip = S._vlibSkip || new Set();
  const selected = rows.filter((r) => !r._saving && !skip.has(r.id || r._key)).length;
  const tidyHint =
    !S._vlibTidied && rows.length > 50
      ? '"Find duplicates" in the Library groups near-identical claims before you pay for both.'
      : '';
  if (selected)
    return {
      label: `Check ${selected} ticked claim${selected > 1 ? 's' : ''} · API`,
      action: 'runLibVerify(this)',
      hint: [
        `About ${Math.ceil(selected / 4)} paid requests after one confirmation; stop any time.`,
        tidyHint,
      ]
        .filter(Boolean)
        .join(' '),
    };
  const unchecked = rows.filter((r) => !hasCheck(r)).length;
  if (unchecked)
    return {
      label: `Select ${unchecked} unchecked claim${unchecked > 1 ? 's' : ''}`,
      action: 'selectUncheckedFacts()',
      hint: tidyHint,
    };
  return {
    label: 'Everything here is checked.',
    hint: 'Filter the AI check column to “Contradicted” and review those first. Review is optional; unticking is never needed.',
  };
}

async function verifyLibrarySelection(explicitRows = null) {
  if (_libVerifying || (S.vlib || []).some((r) => r._saving)) {
    toast('Wait for the current checks or saves to finish.');
    return;
  }
  const selected = explicitRows || Object.values(LIB.selected);
  if (!selected.length) {
    document.getElementById('verify-save-status').textContent =
      'Select material in Saved material first.';
    return;
  }
  S._vlibSource = 'saved';
  S._vlibTidy = false;
  S._vlibSkip = new Set();
  S.vlib = selected.map((m) => ({
    id: m.id,
    store: m.category,
    name: m.name,
    lastEdited: m.lastEdited,
    fields: Object.entries(m.properties)
      .map(([k, v]) => `${k}: ${libProperty(v)}`)
      .join(' · '),
    status: libVerification(m),
    note: richText(m.properties['Verify Note']),
  }));
  for (const r of S.vlib) {
    await restoreFactDrafts(r);
    if (hasCheck(r)) S._vlibSkip.add(r.id);
  }
  renderVlibResults();
  document.getElementById('verify-save-status').textContent =
    `${selected.length} Library rows ticked to check. Checking uses API credits and findings save automatically. Human review is optional.`;
}

function vlibAll(on) {
  const visible = visibleTableKeys('fact-review-table');
  S._vlibSkip ||= new Set();
  for (const r of S.vlib || []) {
    const key = r.id || r._key;
    if (visible && !visible.has(key)) continue;
    if (on) S._vlibSkip.delete(key);
    else S._vlibSkip.add(key);
  }
  _preserveScroll(renderVlibResults);
}

async function tidyVlib() {
  S._vlibTidy = !S._vlibTidy;
  S._vlibMergePending = null;
  if (S._vlibTidy) {
    S._vlibTidied = true;
    S._vlibArch = new Set();
    S._vlibConfirm = false;
    // Dismissals are kept on this device: they are a judgement, not data.
    S._dupDismissed = new Set((await localArtifact('dup-dismissed')) || []);
  }
  renderVlibResults();
}

function _dupPairKeys(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]].sort().join('|'));
  return out;
}

async function mergeVlib(keepId, ids) {
  if (_vlibMerging) return;
  if (S._vlibMergePending && S._vlibMergePending.keepId === keepId) {
    await runMerge();
    return;
  }
  S._vlibMergePending = null;
  const losers = ids.filter((id) => id !== keepId);
  if (!losers.length) return;
  // A merge unions relations, so a group that only hangs together by a chain of
  // look-alikes would join unrelated links. Refuse it here as well as in the
  // view, because the button is only one of the ways this function is reached.
  const group = ids.map((id) => (S.vlib || []).find((r) => r.id === id)).filter(Boolean);
  if (group.length !== ids.length || !_clusterMergeSafe(group)) {
    toast(
      'Those rows are only loosely related — merging would join unrelated links. Dismiss the group, or archive the ones you are sure about.',
      'error'
    );
    return;
  }
  const pages = new Map();
  for (const id of [keepId, ...losers]) pages.set(id, await notionAPI(`pages/${id}`));
  const keep = pages.get(keepId),
    keepProps = keep.properties || {};
  // What each row held when this preview was built. Confirming re-reads them and
  // refuses if any of them moved on in Notion, so the preview stays a promise
  // about the rows it actually described.
  const plan = {
    keepId,
    losers,
    relations: {},
    differing: [],
    verify: null,
    base: Object.fromEntries([keepId, ...losers].map((id) => [id, pages.get(id).last_edited_time])),
  };
  for (const prop of Object.keys(keepProps)) {
    const kind = keepProps[prop]?.type;
    if (kind === 'relation') {
      const seen = new Set(),
        list = [];
      for (const id of [keepId, ...losers])
        for (const rel of pages.get(id).properties?.[prop]?.relation || [])
          if (!seen.has(rel.id)) {
            seen.add(rel.id);
            list.push({ id: rel.id });
          }
      if (list.length > (keepProps[prop].relation || []).length) plan.relations[prop] = list;
      continue;
    }
    // Non-relation fields: never overwrite, only disclose what differs.
    if (['title', 'rich_text', 'select', 'url', 'number', 'date'].includes(kind)) {
      const mine = _readProp(keepProps[prop]);
      for (const id of losers) {
        const theirs = _readProp(pages.get(id).properties?.[prop]);
        if (mine && theirs && mine !== theirs && plan.differing.length < 4)
          plan.differing.push({ prop, mine, theirs });
      }
    }
  }
  // A check on the survivor is never overwritten; an empty survivor can inherit one.
  if (!richText(keepProps['Verify Note']) && !keepProps['Verify Status']?.select?.name) {
    for (const id of losers) {
      const p = pages.get(id).properties || {};
      const note = richText(p['Verify Note']),
        status = p['Verify Status']?.select?.name;
      if (note || status) {
        plan.verify = { note, status };
        break;
      }
    }
  }
  S._vlibMergePending = plan;
  renderVlibResults();
}

function _verifyDetail(key, it) {
  const p = RESEARCH_STORES[key].props(it);
  return Object.entries(p)
    .filter(
      ([k]) =>
        !['Date Added', 'Retrieved Date', 'Source Video', RESEARCH_STORES[key].titleProp].includes(
          k
        )
    )
    .map(([k, v]) => {
      const t = _propText(v);
      return t ? `${k}: ${t}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

function materialDetail(it) {
  return `${it._cat}: ${it._name}\n${it.detail || ''}\nSource: ${it.url || 'not recorded'}\nVerification: ${it.verdict || 'not checked'}${it.verifyNote ? ` — ${it.verifyNote}` : ''}`;
}

async function extractPlaces(force) {
  if (_extractingPlaces || _savingPlaces) {
    toast('Wait for the current Places operation to finish', 'error');
    return;
  }
  if (
    force &&
    !confirm('Run the AI again on every selected transcript to find places? Uses AI credits.')
  )
    return;
  const errEl = document.getElementById('places-error');
  errEl.style.display = 'none';
  const vids = [...S.epSelected].map((i) => S.epQueue[i]).filter((v) => v && v.transcript);
  if (!vids.length) {
    errEl.textContent =
      'No transcripts. In the Prep tab, tick source videos and fetch their transcripts first.';
    errEl.style.display = '';
    return;
  }
  _extractingPlaces = true;
  document
    .querySelectorAll('#res-tab-places .btn-primary, #res-tab-places [onclick^="extractPlaces"]')
    .forEach((b) => (b.disabled = true));
  const loadEl = document.getElementById('places-loading');
  loadEl.innerHTML = `<div class="spinner"></div> Extracting places from ${vids.length} transcript${vids.length > 1 ? 's' : ''}…`;
  loadEl.style.display = 'flex';

  try {
    const existingRows = await notionQueryAll(DB_IDS.places);
    const existingByName = new Map();
    for (const r of existingRows) {
      const nm = (r.properties?.Name?.title?.[0]?.plain_text || '').trim().toLowerCase();
      if (nm)
        existingByName.set(nm, {
          id: r.id,
          lastEdited: r.last_edited_time,
          prefecture: r.properties?.Prefecture?.select?.name || '',
          vids: (r.properties?.['Source Video']?.relation || []).map((x) => x.id),
        });
    }

    // One places-only extraction per transcript; cache-first (0 tokens when the
    // transcript's _placesHash matches the stored breakdown), merge repeats by name.
    const guard =
      'Find EVERY location visited or named. prefecture_guess / area_guess may be inferred from the name.';
    let cachedN = 0,
      freshN = 0;
    const perVideo = await mapPool(vids, 1, async (v) => {
      const h = txHash(v);
      if (
        !force &&
        v.breakdown &&
        v.breakdown._placesHash === h &&
        Array.isArray(v.breakdown.places)
      ) {
        cachedN++;
        return { title: v.title, id: v.id, places: v.breakdown.places, _cached: true };
      }
      try {
        const r = await runExtractCall(v.transcript, PLACES_SHAPE, guard, {
          key: `${v.id}:places`,
          task: 'places',
          fresh: !!force,
        });
        const places = (r && r.places) || [];
        freshN++;
        // persist into the video's Content Outline so a re-collect is free
        v.breakdown = { ...(v.breakdown || {}), places, _placesHash: h };
        const cache = JSON.stringify(v.breakdown, null, 2);
        if (cache.length > 190000)
          throw new Error(
            'Place analysis exceeds the source field limit; result retained locally without truncation.'
          );
        await localArtifact(`breakdown-draft:${v.id}`, v.breakdown);
        await notionAPI(`pages/${v.id}`, 'PATCH', {
          properties: { 'Content Outline': { rich_text: codeBlockRichText(cache) } },
        });
        return { title: v.title, id: v.id, places };
      } catch (e) {
        v._placeError = e.message;
        return { title: v.title, id: v.id, places: [], error: e.message };
      }
    });

    const failedSources = perVideo.filter((x) => x.error);
    if (failedSources.length) {
      errEl.textContent = failedSources.map((x) => `${x.title}: ${x.error}`).join(' · ');
      errEl.style.display = '';
    }
    const byKey = new Map();
    for (const b of perVideo) {
      for (const p of b.places) {
        const name = (p.name || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        const hit0 = existingByName.get(key);
        if (byKey.has(key)) {
          const e = byKey.get(key);
          if (!e.what_happens_here && p.what_happens_here)
            e.what_happens_here = p.what_happens_here;
          if (!e.food_here && p.food_here) e.food_here = p.food_here;
          if (!e.price_if_spoken && p.price_if_spoken) e.price_if_spoken = p.price_if_spoken;
          if (!e.area && p.area_guess) e.area = p.area_guess;
          if (!e.from.includes(b.title)) e.from.push(b.title);
          if (b.id && !e.fromIds.includes(b.id)) e.fromIds.push(b.id);
          if (b.id && hit0 && (hit0.vids || []).includes(b.id)) e.same_video = true;
          continue;
        }
        const hit = hit0;
        const guessPref = PREFECTURES.includes(p.prefecture_guess) ? p.prefecture_guess : '';
        byKey.set(key, {
          name,
          name_local: p.name_local || '',
          type: normPlaceType(p.type),
          what_happens_here: p.what_happens_here || '',
          food_here: p.food_here || '',
          price_if_spoken: p.price_if_spoken || '',
          area: p.area_guess || '',
          prefecture: (hit && hit.prefecture) || guessPref || 'Unknown',
          prefFromGuess: !(hit && hit.prefecture) && !!guessPref,
          halal: 'Unknown',
          google_maps_url:
            'https://www.google.com/maps/search/' +
            encodeURIComponent(
              [name, p.area_guess, p.prefecture_guess, 'Japan'].filter(Boolean).join(' ')
            ),
          is_existing: !!hit,
          existing_id: hit ? hit.id : '',
          existingLastEdited: hit?.lastEdited || null,
          same_video: !!(hit && b.id && (hit.vids || []).includes(b.id)),
          from: [b.title],
          // seed with the videos already linked on the existing row so an
          // "Update in DB" unions provenance instead of replacing it
          fromIds: [...new Set([...(hit && hit.vids ? hit.vids : []), ...(b.id ? [b.id] : [])])],
        });
      }
    }
    S.extractedPlaces = [...byKey.values()].sort((a, z) => a.name.localeCompare(z.name));
    S.confirmedPlaces = [];
    S._placesSaved = null;
    // default: ones already in the DB start unticked
    S.placeSkip = new Set(S.extractedPlaces.map((p) => p.name.toLowerCase()));
    if (!S.extractedPlaces.length) throw new Error('no places found in the transcript(s)');

    const enriched = 0; // Map lookup is a separate, explicit action after review.

    renderPlacesReview();
    document.getElementById('places-review-area').style.display = '';
    toast(
      `${S.extractedPlaces.length} places · ${freshN} fresh AI pass${freshN === 1 ? '' : 'es'}` +
        (cachedN ? ` · ${cachedN} from cache (0 tokens)` : '') +
        (enriched ? ` · ${enriched} Maps candidates to check` : ''),
      'success'
    );
  } catch (err) {
    errEl.textContent = `Places failed: ${_esc(err.message)}`;
    errEl.style.display = '';
    console.error(err);
  } finally {
    _extractingPlaces = false;
    document
      .querySelectorAll('#res-tab-places .btn-primary, #res-tab-places [onclick^="extractPlaces"]')
      .forEach((b) => (b.disabled = false));
    loadEl.style.display = 'none';
  }
}

async function reviewPlaceMatches(btn) {
  if (_extractingPlaces || _savingPlaces) return;
  btn.disabled = true;
  const status = document.getElementById('places-review-status');
  status.textContent = 'Looking up selected places. Candidates need your review before saving.';
  try {
    const n = await enrichPlacesFromMaps(true);
    renderPlacesReview();
    status.textContent = `${n} map candidates found. Open Original details and map evidence to inspect each match.`;
  } catch (e) {
    renderPlacesReview();
    status.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

function placesPick(mode) {
  const visible = visibleTableKeys('places-review-table');
  S.placeSkip ||= new Set();
  S.extractedPlaces.forEach((p, i) => {
    if (p._saved || (visible && !visible.has(String(i)))) return;
    const key = p.name.toLowerCase();
    if (mode === 'none' || (mode === 'new' && p.is_existing)) S.placeSkip.add(key);
    else S.placeSkip.delete(key);
  });
  _preserveScroll(renderPlacesReview);
}

function libSafeURL(value) {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

function libMaterial(row, cat) {
  const props = row.properties || {};
  return {
    id: row.id,
    key: `${cat}:${row.id}`,
    category: cat,
    dataSourceId: MATERIAL_CATEGORIES[cat].source,
    name: richText(props[EP_MAT[cat].title]) || 'Untitled material',
    properties: props,
    url: `https://www.notion.so/${libNormalID(row.id)}`,
    lastEdited: row.last_edited_time || null,
    capturedAt: new Date().toISOString(),
  };
}

function libSourceKeys(row) {
  const refs = Object.entries(row.properties)
    .filter(([k, p]) => /source/i.test(k) && p.relation)
    .flatMap(([, p]) => p.relation.map((r) => r.id));
  const url = row.properties['Source URL']?.url;
  return refs.length ? refs : url ? [url] : ['unknown'];
}

function libSourceText(row) {
  return libSourceKeys(row)
    .map((id) =>
      id === 'unknown'
        ? 'Source not recorded'
        : LIB.sources[id] || (id.startsWith('http') ? id : 'Linked source')
    )
    .join(' · ');
}

function libVerification(row) {
  return row.properties['Verify Status']?.select?.name || 'unknown';
}

function libraryCategoryChanged() {
  LIB.filters.columns = {};
  LIB.filters.ranges = {};
  LIB.columnSort = null;
  LIB.filters.field = '';
  document.getElementById('library-field-text').value = '';
  document.getElementById('library-min').value = '';
  document.getElementById('library-max').value = '';
  updateLibraryFieldOptions();
  libraryFilterChanged();
}

function libraryFilterChanged() {
  const columnFilters = LIB.filters.columns || {},
    ranges = LIB.filters.ranges || {};
  LIB.filters = Object.fromEntries(
    LIB_FILTERS.map((k) => {
      const el = document.getElementById(`library-${k}`);
      return [k, k === 'selected-only' ? el.checked : el.value];
    })
  );
  LIB.filters.columns = columnFilters;
  LIB.filters.ranges = ranges;
  LIB.limit = 60;
  renderMaterialLibrary();
  persistLibrarySoon();
}

function libCellValue(row, field) {
  if (field === 'Material' || field === MATERIAL_CATEGORIES[row.category].columns[0])
    return row.name;
  if (field === 'Source') return libSourceText(row);
  if (field === 'Verification')
    return libVerification(row) === 'unknown' ? 'Not checked' : libVerification(row);
  if (field === 'Category' && (!LIB.filters.category || LIB.filters.category === 'all'))
    return MATERIAL_CATEGORIES[row.category].label;
  return libProperty(row.properties[field]) || 'Unknown';
}

function libColumnMatches(row, field, query) {
  const p = row.properties[field],
    q = query.toLowerCase();
  if (p?.multi_select) return p.multi_select.some((x) => x.name.toLowerCase() === q);
  const exact =
    field === 'Verification' ||
    (field === 'Category' && (!LIB.filters.category || LIB.filters.category === 'all')) ||
    ['select', 'checkbox'].includes(p?.type);
  return exact
    ? libCellValue(row, field).toLowerCase() === q
    : libCellValue(row, field).toLowerCase().includes(q);
}

function libCompareColumn(a, b, sort) {
  const av = a.properties[sort.field],
    bv = b.properties[sort.field];
  const comparison =
    av?.type === 'number' && bv?.type === 'number' && av.number != null && bv.number != null
      ? av.number - bv.number
      : libCellValue(a, sort.field).localeCompare(libCellValue(b, sort.field), undefined, {
          numeric: true,
        });
  return (sort.desc ? -comparison : comparison) || a.key.localeCompare(b.key);
}

function libraryColumnFilter(field) {
  if (field === 'Source') return '<span class="column-hint">Use source filter above</span>';
  const rows =
    !LIB.filters.category || LIB.filters.category === 'all'
      ? Object.values(LIB.rows).flat()
      : LIB.rows[LIB.filters.category] || [];
  const discrete =
    ['Verification'].includes(field) ||
    (field === 'Category' && (!LIB.filters.category || LIB.filters.category === 'all')) ||
    rows.some((r) => ['select', 'multi_select', 'checkbox'].includes(r.properties[field]?.type));
  if (rows.some((r) => r.properties[field]?.type === 'number')) {
    const range = LIB.filters.ranges?.[field] || {};
    return `<div class="column-range">${['min', 'max'].map((bound) => `<input type="number" id="library-column-${encodeURIComponent(field)}-${bound}" data-column="${_esc(field)}" aria-label="${bound === 'min' ? 'Minimum' : 'Maximum'} ${_esc(field)}" value="${_esc(range[bound] ?? '')}" placeholder="${bound === 'min' ? 'Min' : 'Max'}" oninput="librarySetRange(this.dataset.column,'${bound}',this.value)">`).join('')}</div><span class="column-hint">Unknown values stay visible</span>`;
  }
  const id = 'library-column-' + encodeURIComponent(field),
    value = LIB.filters.columns?.[field] || '';
  const attrs = `id="${id}" data-column="${_esc(field)}" aria-label="Filter ${_esc(field)}"`;
  return discrete
    ? `<select ${attrs} onchange="librarySetColumn(this.dataset.column,this.value)"><option value="">All</option>${[
        ...new Set(rows.map((r) => libCellValue(r, field))),
      ]
        .sort()
        .map((v) => `<option ${v === value ? 'selected' : ''}>${_esc(v)}</option>`)
        .join('')}</select>`
    : `<input type="search" ${attrs} value="${_esc(value)}" placeholder="Filter…" oninput="librarySetColumn(this.dataset.column,this.value)">`;
}

function librarySetRange(field, bound, value) {
  LIB.filters.field = '';
  LIB.filters.ranges ||= {};
  LIB.filters.ranges[field] ||= {};
  LIB.filters.ranges[field][bound] = value;
  LIB.limit = 60;
  renderMaterialLibrary();
  persistLibrarySoon();
}

function librarySetColumn(field, value) {
  LIB.filters.columns ||= {};
  if (value) LIB.filters.columns[field] = value;
  else delete LIB.filters.columns[field];
  LIB.limit = 60;
  renderMaterialLibrary();
  persistLibrarySoon();
}

function libraryShowAll() {
  LIB.limit = filteredLibraryRows().length;
  renderMaterialLibrary();
}

function libHighlight(value, query) {
  const text = String(value),
    q = String(query || '').trim();
  if (!q) return _esc(text);
  let at = 0,
    out = '',
    pos = text.toLowerCase().indexOf(q.toLowerCase());
  while (pos >= 0) {
    out += _esc(text.slice(at, pos)) + '<mark>' + _esc(text.slice(pos, pos + q.length)) + '</mark>';
    at = pos + q.length;
    pos = text.toLowerCase().indexOf(q.toLowerCase(), at);
  }
  return out + _esc(text.slice(at));
}

function libMatchExcerpt(row) {
  const q = (LIB.filters.search || '').trim().toLowerCase();
  if (!q) return '';
  const entries = [
    ['Title', row.name],
    ...Object.entries(row.properties).map(([k, p]) => [k, libProperty(p)]),
    ['Source', libSourceText(row)],
  ];
  const match = entries.find(([, text]) => String(text).toLowerCase().includes(q));
  if (!match) return '';
  const [field, text] = match,
    pos = text.toLowerCase().indexOf(q),
    start = Math.max(0, pos - 65),
    end = Math.min(text.length, pos + q.length + 100);
  return `<strong>${_esc(field)}</strong><br>${start ? '…' : ''}${libHighlight(text.slice(start, end), q)}${end < text.length ? '…' : ''}`;
}

function libCoordinates(value) {
  const match = String(value || '')
    .trim()
    .match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]),
    lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function libProject({ lat, lng }) {
  const sin = Math.sin((Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: Math.max(0, Math.min(1, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI))),
  };
}

function libraryMapPoints() {
  return filteredLibraryRows()
    .filter((r) => r.category === 'places')
    .flatMap((row) => {
      const coordinates = libCoordinates(libProperty(row.properties.Coordinates));
      return coordinates ? [{ row, ...libProject(coordinates) }] : [];
    });
}

function libraryMapZoom(delta) {
  if (!LIB.map) return;
  LIB.map.z = Math.max(1, Math.min(18, LIB.map.z + delta));
  renderLibraryMap();
}

function libraryMapZoomAt(delta, px, py) {
  if (!LIB.map) return;
  const canvas = document.getElementById('library-map-canvas'),
    old = 256 * 2 ** LIB.map.z,
    z = Math.max(1, Math.min(18, LIB.map.z + delta)),
    next = 256 * 2 ** z;
  LIB.map.x = (((LIB.map.x + (px - canvas.clientWidth / 2) * (1 / old - 1 / next)) % 1) + 1) % 1;
  LIB.map.y = Math.max(
    0,
    Math.min(1, LIB.map.y + (py - canvas.clientHeight / 2) * (1 / old - 1 / next))
  );
  LIB.map.z = z;
  renderLibraryMap();
}

function libraryMapPan(dx, dy) {
  if (!LIB.map) return;
  const world = 256 * 2 ** LIB.map.z;
  LIB.map.x = (((LIB.map.x + dx / world) % 1) + 1) % 1;
  LIB.map.y = Math.max(0, Math.min(1, LIB.map.y + dy / world));
  renderLibraryMap();
}

function libraryToggle(key, checked) {
  const row =
    Object.values(LIB.rows)
      .flat()
      .find((r) => r.key === key) || LIB.selected[key];
  if (checked && row) LIB.selected[key] = libClone(row);
  else delete LIB.selected[key];
  // Preserve checkbox focus while updating its row and the selection tray.
  const checkbox = [...document.querySelectorAll('[data-material-key]')].find(
    (el) => el.type === 'checkbox' && el.dataset.materialKey === key
  );
  checkbox?.closest('tr')?.classList.toggle('selected', checked);
  document.querySelectorAll('input[data-material-key]').forEach((el) => {
    if (el.dataset.materialKey === key) el.checked = checked;
  });
  document
    .querySelectorAll('.map-pin')
    .forEach((el) =>
      el.setAttribute('aria-pressed', String(!!LIB.selected[el.dataset.materialKey]))
    );
  if (LIB.filters['selected-only']) renderMaterialLibrary();
  else renderLibrarySelection();
  persistLibrarySoon();
}

function libraryShowMore() {
  LIB.limit += 60;
  renderMaterialLibrary();
}

function librarySelectVisible() {
  for (const row of LIB.visible || []) LIB.selected[row.key] ||= libClone(row);
  renderMaterialLibrary();
  persistLibrarySoon();
}

function libraryReviewSelection() {
  document.getElementById('library-selected-only').checked = true;
  libraryFilterChanged();
}

function libraryClearSelection() {
  LIB.selected = {};
  renderMaterialLibrary();
  persistLibrarySoon();
}

async function reviewCurrentEvidence() {
  const row = currentMaterial();
  if (!row) return;
  closeLibraryDetail();
  await verifyLibrarySelection([row]);
  await startManualVerdict(row.id);
}

function materialFieldValue(p) {
  return String(
    p.type === 'number'
      ? (p.number ?? '')
      : p.type === 'date'
        ? p.date?.start || ''
        : libProperty(p)
  );
}

async function libraryConfig() {
  if (LIB.config) return LIB.config;
  const res = await _afetch('/.netlify/functions/library-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Idea storage unavailable');
  // Explicit access check uses the app integration, not the separately connected MCP.
  await notionAPI(`databases/${data.collections}`);
  await notionAPI(`databases/${data.placements}`);
  LIB.config = data;
  return data;
}

function libReadIdea(page) {
  const p = page.properties;
  return {
    id: page.id,
    name: richText(p.Name),
    question: richText(p.Question),
    notes: richText(p.Notes),
    state: p.State?.select?.name || 'Exploring',
    channelId: richText(p['Channel ID']),
    revision: p.Revision?.number || 0,
    lastEdited: page.last_edited_time,
    operation: richText(p['Operation ID']),
    incomplete: richText(p['Operation ID']).startsWith('pending:'),
  };
}

async function ideaMaySwitch() {
  if (LIB.busy || LIB.destinationSaving || LIB.idea?.pending || LIB.confirmResolve) return false;
  return (
    !LIB.idea?.dirty ||
    confirmIdeaChange(
      'Leave this unsaved idea?',
      'Your edits are saved only in this browser. Download the draft to keep a copy before replacing it. Saved Notion records stay available.',
      'Discard local edits'
    )
  );
}

async function checkIdeaSource(index) {
  const item = LIB.idea.items[index],
    status = document.getElementById(`idea-source-${index}`);
  status.textContent = 'Checking original material…';
  try {
    const row = await notionAPI(`pages/${item.material.id}`);
    status.textContent =
      row.archived || row.in_trash
        ? 'Original is archived. The saved snapshot is retained.'
        : row.last_edited_time === item.material.lastEdited
          ? 'Original row has not changed since capture. This does not verify its claims.'
          : 'Original changed. Open it to compare with the saved evidence; no automatic replacement was made.';
  } catch (e) {
    status.textContent = `Original unavailable: ${e.message}. The snapshot is retained.`;
  }
}

function libSnapshot(item) {
  return { schemaVersion: 1, revision: item.snapshotRevision, material: item.material };
}

function libSnapshotBlock(item) {
  const json = JSON.stringify(libSnapshot(item));
  if (new TextEncoder().encode(json).length > 65536)
    throw new Error(
      `“${item.material.name}” exceeds the 64 KiB evidence limit. Remove it from this idea and keep its original Notion reference in your notes; no evidence was truncated.`
    );
  return { object: 'block', type: 'code', code: { language: 'json', rich_text: libRT(json) } };
}

function libReadSnapshot(blocks, revision) {
  const matches = [];
  for (const b of blocks)
    if (b.type === 'code') {
      try {
        const snapshot = JSON.parse(richText(b.code));
        if (snapshot.schemaVersion === 1 && snapshot.revision === revision) matches.push(snapshot);
      } catch {
        /* Human notes and unrelated code blocks are not snapshots. */
      }
    }
  if (matches.length !== 1)
    throw new Error(
      'Saved evidence snapshot is missing or duplicated. Keep the local draft and inspect the Notion row.'
    );
  const result = matches[0];
  if (!MATERIAL_CATEGORIES[result.material?.category] || !result.material?.properties)
    throw new Error('Unrecognized material snapshot.');
  return result;
}

async function libPlacementRows(id) {
  const cfg = await libraryConfig();
  return notionQueryAll(cfg.placements, {
    filter: { property: 'Collection', relation: { contains: id } },
  });
}

function libPlacementIdentity(page, owner) {
  const relation = page.properties.Collection?.relation || [];
  if (relation.length !== 1 || libNormalID(relation[0].id) !== libNormalID(owner))
    throw new Error('A saved material placement has an invalid owner. Review it in Notion.');
  return richText(page.properties['Placement ID']);
}

function libIdeaProperties(idea, revision, operation) {
  return {
    Name: { title: libRT(idea.name) },
    Question: { rich_text: libRT(idea.question) },
    Notes: { rich_text: libRT(idea.notes) },
    State: { select: { name: idea.state } },
    Revision: { number: revision },
    'Operation ID': { rich_text: libRT(operation) },
    'Channel ID': { rich_text: libRT(idea.channelId || '') },
  };
}

function libItemProperties(item, owner, position, operation) {
  const m = item.material;
  return {
    Name: { title: libRT(m.name) },
    'Placement ID': { rich_text: libRT(item.placementId) },
    Collection: { relation: [{ id: owner }] },
    Category: { select: { name: MATERIAL_CATEGORIES[m.category].label } },
    'Material Data Source ID': { rich_text: libRT(m.dataSourceId) },
    'Material Page ID': { rich_text: libRT(m.id) },
    'Material URL': { url: m.url },
    Purpose: { rich_text: libRT(item.purpose) },
    Position: { number: position },
    'Snapshot Revision': { rich_text: libRT(item.snapshotRevision) },
    'Operation ID': { rich_text: libRT(operation) },
    State: { select: { name: 'Active' } },
  };
}

async function libraryCreateOnce(key, find, body) {
  const pending = LIB.idea.pending,
    matches = await find();
  if (matches.length > 1)
    throw new Error('Multiple records match this save operation. Inspect them before continuing.');
  if (matches.length === 1) return matches[0];
  if (pending.sent[key])
    throw new Error(
      'Completion unknown: the previous create may still be processing. Check this save again before starting another operation.'
    );
  pending.sent[key] = true;
  await persistLibrary();
  try {
    return await notionAPI('pages', 'POST', body);
  } catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 408) {
      delete pending.sent[key];
      await persistLibrary();
    }
    throw e;
  }
}

function libSameFields(idea, read) {
  return ['name', 'question', 'notes', 'state', 'channelId'].every(
    (k) => (idea[k] || '') === (read[k] || '')
  );
}

function libSameItems(idea, read) {
  return (
    idea.items.length === read.items.length &&
    idea.items.every((item, i) => {
      const other = read.items[i];
      return (
        item.placementId === other.placementId &&
        item.purpose === other.purpose &&
        item.snapshotRevision === other.snapshotRevision &&
        JSON.stringify(libSnapshot(item)) === JSON.stringify(libSnapshot(other))
      );
    })
  );
}

function libProperty(p) {
  if (!p) return '';
  if (p.title || p.rich_text) return richText(p).split(CHECK_MARKER)[0];
  if (p.relation) return p.relation.map((r) => LIB.sources[r.id] || `Notion ${r.id}`).join(', ');
  if (p.type === 'checkbox') return p.checkbox ? 'Yes' : 'No';
  if (p.type === 'date') return [p.date?.start, p.date?.end].filter(Boolean).join(' – ');
  if (p.type === 'formula') return String(p.formula?.[p.formula?.type] ?? '');
  return _readProp(p);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    _dupPairKeys,
    _verifyBatch,
    _verifyDetail,
    checkBadge,
    checkEvidence,
    checkIdeaSource,
    checkRecord,
    extractPlaces,
    factNextStep,
    findDuplicates,
    ideaMaySwitch,
    libCellValue,
    libColumnMatches,
    libCompareColumn,
    libCoordinates,
    libHighlight,
    libIdeaProperties,
    libItemProperties,
    libMatchExcerpt,
    libMaterial,
    libPlacementIdentity,
    libPlacementRows,
    libProject,
    libProperty,
    libReadIdea,
    libReadSnapshot,
    libSafeURL,
    libSameFields,
    libSameItems,
    libSnapshot,
    libSnapshotBlock,
    libSourceKeys,
    libSourceText,
    libVerification,
    libraryCategoryChanged,
    libraryClearSelection,
    libraryColumnFilter,
    libraryConfig,
    libraryCreateOnce,
    libraryFilterChanged,
    libraryMapPan,
    libraryMapPoints,
    libraryMapZoom,
    libraryMapZoomAt,
    libraryReviewSelection,
    librarySelectVisible,
    librarySetColumn,
    librarySetRange,
    libraryShowAll,
    libraryShowMore,
    libraryToggle,
    materialCandidateSaving,
    materialDetail,
    materialEvidence,
    materialEvidenceBlock,
    materialFieldValue,
    materialSavePending,
    materialSaveStatus,
    mergeVlib,
    placesPick,
    reviewAll,
    reviewCurrentEvidence,
    reviewExtractionChat,
    reviewPlaceMatches,
    reviewReceiptKey,
    reviewSourceMaterial,
    searchLibrary,
    sourceQueueNav,
    sourceYouTubeID,
    tidyVlib,
    verifyLibrarySelection,
    vlibAll,
    webMode,
    ytAPI,
  };
}
