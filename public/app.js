const state = { data: null, activeView: 'overview', busy: false, chatBusy: false };
const $ = (id) => document.getElementById(id);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(`${s}T12:00:00Z`); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', timeZone: 'UTC' }); };
const titleStatus = (status) => ({ in_transit:'In transit', at_hub:'At hub', delayed:'Delayed', delivered:'Delivered', ordered:'Ordered' }[status] || status);
const badge = (status, type='status') => `<span class="${type} ${type}-${safe(status)}">${safe(type === 'status' ? titleStatus(status) : status.charAt(0).toUpperCase() + status.slice(1))}</span>`;
const sessionKey = 'infraflow_demo_session';
let session = localStorage.getItem(sessionKey);
if (!session || !/^[a-zA-Z0-9-]{16,64}$/.test(session)) { session = crypto.randomUUID(); localStorage.setItem(sessionKey, session); }
let toastTimer;
function toast(message, error = false) { const el = $('toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200); }
async function api(path, options={}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers } });
  let body;
  try { body = await response.json(); } catch { throw new Error(`Unexpected server response (${response.status})`); }
  if (!response.ok) { const error = new Error(body.error || `HTTP ${response.status}`); error.status = response.status; throw error; }
  return body;
}
async function loadData() {
  state.data = await api('/api/dashboard');
  renderAll();
}
const rowHtml = (s, full = false) => `<tr data-shipment="${safe(s.id)}">
  <td><span class="td-primary">${safe(s.id)}</span><span class="td-secondary">${safe(s.item)}${full ? ` · ${s.units} units` : ''}</span></td>
  <td>${full ? `<span class="td-primary">${safe(s.origin)} →</span><span class="td-secondary">${safe(s.destination)}</span>` : `<span class="td-primary">${safe(s.destination)}</span>`}</td>
  <td>${fmtDate(s.eta)}</td><td>${badge(s.status)}</td><td>${badge(s.risk.severity,'severity')}</td><td class="row-arrow">›</td>
</tr>`;
function renderAll() {
  const { kpis, shipments, inventory, alerts, followups, scans } = state.data;
  $('stat-total').textContent = kpis.total;
  $('stat-active').textContent = kpis.active;
  $('stat-risk').textContent = kpis.atRisk;
  $('stat-delivered').textContent = kpis.delivered;
  $('nav-shipment-count').textContent = kpis.total;
  $('nav-task-count').textContent = kpis.openFollowups;
  $('overview-rows').innerHTML = shipments.slice(0,6).map(s => rowHtml(s)).join('');
  const atRisk = shipments.filter(s => s.risk.severity === 'critical' || s.risk.severity === 'high').slice(0,3);
  $('attention-list').innerHTML = atRisk.length ? atRisk.map(s => `<div class="attention-item" data-shipment="${safe(s.id)}"><span class="attention-marker ${safe(s.risk.severity)}">⚑</span><div><strong>${safe(s.item)} — ${safe(s.destination)}</strong><p>${safe(s.id)} · ${safe(s.risk.summary)}</p></div><span class="attention-arrow">›</span></div>`).join('') : `<div class="empty-state">No high-priority shipments currently detected.</div>`;
  const statuses = [ ['in_transit','In transit','#4c83af'], ['at_hub','At hub','#5a9c94'], ['delayed','Delayed','#e7ad7e'], ['delivered','Delivered','#8bcfb3'], ['ordered','Ordered','#7b729e'] ];
  const maxCount = Math.max(1,...statuses.map(([status]) => shipments.filter(s => s.status === status).length));
  $('pipeline-graphic').innerHTML = statuses.map(([status]) => { const count = shipments.filter(s => s.status === status).length; return `<div class="pipeline-bar-col"><span class="bar-value">${count}</span><div class="pipeline-bar" style="height:${Math.max(6,count/maxCount*75)}%"></div></div>`; }).join('');
  $('pipeline-legend').innerHTML = statuses.map(([,name,color])=>`<span class="legend-item"><span class="legend-dot" style="background:${color}"></span>${name}</span>`).join('');
  renderShipments(); renderAlerts(alerts); renderInventory(inventory); renderTasks(followups); renderScanHistory(scans);
  bindShipmentRows();
}
function renderShipments() {
  const q = $('shipment-search').value.trim().toLowerCase(); const filterStatus = $('status-filter').value; const filterRisk = $('risk-filter').value;
  const visible = state.data.shipments.filter(s => {
    const searchable = [s.id,s.item,s.sku,s.origin,s.destination,s.carrier].join(' ').toLowerCase();
    return (!q || searchable.includes(q)) && (filterStatus === 'all' || s.status === filterStatus) && (filterRisk === 'all' || s.risk.severity === filterRisk);
  });
  $('all-shipment-rows').innerHTML = visible.length ? visible.map(s => rowHtml(s,true)).join('') : `<tr><td colspan="6"><div class="empty-state">No shipments match these filters.</div></td></tr>`;
  $('shipment-results-count').textContent = `Showing ${visible.length} of ${state.data.shipments.length} shipments`;
  bindShipmentRows();
}
function renderAlerts(alerts) {
  $('alerts-count').textContent = `${alerts.filter(a=>a.state==='open').length} open · ${alerts.length} total`;
  $('alerts-list').innerHTML = alerts.length ? alerts.map(a => `<div class="stack-row"><span class="stack-mark">${a.state==='resolved'?'✓':'⚑'}</span><div class="stack-content"><div class="stack-title">${safe(a.title)} ${badge(a.severity,'severity')}</div><div class="stack-desc">${safe(a.description)}</div><div class="stack-meta">${safe(a.shipment_id)} · ${a.state==='resolved'?'Resolved':'Open'} · ${safe(a.updated_at)}</div></div><button class="mini-action secondary" data-shipment="${safe(a.shipment_id)}">Details</button></div>`).join('') : `<div class="empty-state">No scans recorded yet. Click <strong>Run risk scan</strong> to detect and store operational exceptions.</div>`;
}
function renderInventory(inventory) {
  $('inventory-grid').innerHTML = inventory.map(i => { const low = i.available < i.reorder_point; const percentage = Math.min(100, Math.max(3,(i.available/(i.reorder_point*1.7))*100)); return `<div class="inventory-card"><div class="inventory-top"><span class="inventory-site">${safe(i.site)}</span><span class="inventory-sku">${safe(i.sku)}</span></div><div class="inventory-item">${safe(i.item)}</div><div class="inventory-level ${low?'low':''}"><span>${i.available} available</span><span>${low?'⚑ Below minimum':'✓ Healthy'}</span></div><div class="meter ${low?'low':''}"><div style="width:${percentage}%"></div></div></div>`; }).join('');
}
function renderTasks(tasks) {
  $('task-count').textContent = `${state.data.kpis.openFollowups} open · ${tasks.length} shown`;
  $('tasks-list').innerHTML = tasks.length ? tasks.map(t=>`<div class="stack-row"><span class="stack-mark">${t.status==='done'?'✓':'↗'}</span><div class="stack-content"><div class="stack-title">${safe(t.title)}</div><div class="stack-desc">${safe(t.shipment_id)} · ${safe(t.created_at)} · ${t.status === 'done' ? 'Completed' : 'Awaiting follow-up'}</div></div>${t.status==='open'?`<button class="mini-action" data-complete="${t.id}">Mark done</button>`:''}</div>`).join('') : `<div class="empty-state">Your action queue is clear. Open an at-risk shipment and select <strong>Create follow-up</strong> to add a trackable task.</div>`;
  $$('[data-complete]').forEach(btn=>btn.addEventListener('click', ()=>completeTask(btn.dataset.complete)));
}
function renderScanHistory(scans) {
  $('scan-history').innerHTML = scans.length ? scans.map(r=>`<div class="stack-row"><span class="stack-mark">⌁</span><div class="stack-content"><div class="stack-title">Risk scan #${r.id}</div><div class="stack-desc">${r.scanned} shipments evaluated · ${r.flagged} exceptions flagged</div><div class="stack-meta">${safe(r.completed_at)} UTC</div></div></div>`).join('') : `<div class="empty-state">No risk scans yet. Run one to create a recorded audit entry.</div>`;
}
function bindShipmentRows() { $$('[data-shipment]').forEach(el=>{el.onclick = () => openShipment(el.dataset.shipment);}); }
function setView(view) {
  if (!['overview','shipments','intelligence','tasks'].includes(view)) return;
  state.activeView = view;
  $$('.view').forEach(el => el.hidden = el.dataset.view !== view);
  $$('[data-nav]').forEach(el => { const active=el.dataset.nav===view; el.classList.toggle('active',active); el.setAttribute('aria-current', active?'page':'false'); });
  $('crumb-current').textContent = ({overview:'Overview',shipments:'Shipments',intelligence:'Risk intelligence',tasks:'Follow-up tasks'})[view];
  scrollTo({top:0,behavior:'smooth'});
}
async function runScan() {
  if (state.busy) return;
  state.busy = true;
  for (const btn of [$('scan-button'),$('scan-button-alt')]) { btn.disabled=true; btn.textContent='Scanning shipments…'; }
  try { const result = await api('/api/scan',{method:'POST'}); await loadData(); toast(`Scan completed: ${result.scanned} evaluated · ${result.flagged} flagged`); }
  catch (e) { toast(e.message,true); }
  finally { state.busy=false; $('scan-button').disabled=false; $('scan-button').innerHTML='<span class="button-icon">⌁</span> Run risk scan'; $('scan-button-alt').disabled=false; $('scan-button-alt').textContent='⌁ Run risk scan'; }
}
function openShipment(id) {
  const s = state.data?.shipments.find(x => x.id === id); if (!s) return;
  $('modal-title').textContent = `${s.id} · ${s.item}`;
  $('modal-content').innerHTML = `<div class="modal-body"><div class="detail-grid">
    <div><div class="detail-label">Origin</div><div class="detail-value">${safe(s.origin)}</div></div>
    <div><div class="detail-label">Destination</div><div class="detail-value">${safe(s.destination)}</div></div>
    <div><div class="detail-label">Carrier</div><div class="detail-value">${safe(s.carrier)}</div></div>
    <div><div class="detail-label">Estimated arrival</div><div class="detail-value">${fmtDate(s.eta)}</div></div>
    <div><div class="detail-label">Component SKU</div><div class="detail-value">${safe(s.sku)}</div></div>
    <div><div class="detail-label">Quantity</div><div class="detail-value">${s.units} units</div></div>
    <div><div class="detail-label">Severity</div><div class="detail-value">${badge(s.risk.severity,'severity')}</div></div>
    <div><div class="detail-label">Priority</div><div class="detail-value">${safe(s.priority)}</div></div>
  </div><div class="detail-risk"><strong>Risk analysis · ${s.risk.score}/100</strong><br>${safe(s.risk.summary)}<br><small>Scored by deterministic rules, not the LLM.</small></div></div>
  <div class="modal-actions"><select id="detail-status" aria-label="Change simulated shipment status">${['in_transit','at_hub','delayed','delivered','ordered'].map(st=>`<option value="${st}" ${s.status === st?'selected':''}>${titleStatus(st)}</option>`).join('')}</select><button class="outline-button" id="detail-save">Save status</button><button class="primary-button" id="detail-followup">+ Follow-up</button></div>`;
  $('modal-backdrop').hidden=false;
  $('detail-save').onclick = async () => { const status=$('detail-status').value; $('detail-save').disabled=true; try { await api(`/api/shipments/${encodeURIComponent(s.id)}/status`,{method:'POST',body:JSON.stringify({status})}); await loadData(); $('modal-backdrop').hidden=true; toast(`Updated ${s.id} to ${titleStatus(status)}.`); } catch(e){toast(e.message,true);} finally { $('detail-save').disabled=false; } };
  $('detail-followup').onclick=async()=>{ $('detail-followup').disabled=true; try{await api('/api/followups',{method:'POST',body:JSON.stringify({shipmentId:id})});await loadData();$('modal-backdrop').hidden=true;toast(`Follow-up created for ${id}.`);}catch(e){toast(e.message,true);$('detail-followup').disabled=false;} };
  $('close-modal').focus();
}
async function completeTask(id) { try { await api(`/api/followups/${id}/complete`,{method:'POST'}); await loadData(); toast('Follow-up marked complete.'); } catch(e){toast(e.message,true);} }
function addBubble(role, text, special=false) {
  const div=document.createElement('div'); div.className=`chat-bubble ${role} ${special?'error':''}`; div.textContent=text; $('chat-history').append(div); $('chat-history').scrollTop=$('chat-history').scrollHeight; return div;
}
async function loadChat() {
  try { const response=await api(`/api/chat/history?session=${encodeURIComponent(session)}`); $('chat-history').replaceChildren(); for(const m of response.messages) addBubble(m.role,m.content); if(response.messages.length) $('chat-suggestions').hidden=true; }
  catch(e){console.warn('Could not restore chat:', e.message);}
}
async function sendChat(message) {
  if (state.chatBusy || !message || message.length>800) return;
  state.chatBusy=true; $('chat-send').disabled=true; $('chat-input').value=''; $('chat-suggestions').hidden=true;
  addBubble('user',message); const pending=addBubble('assistant','Thinking with Llama 3.3…'); pending.classList.add('typing');
  try {
    const accessCode=sessionStorage.getItem('infraflow_demo_code');
    const response=await api('/api/chat', { method:'POST', headers: accessCode ? {'X-Demo-Access-Code':accessCode} : {}, body:JSON.stringify({session,message}) });
    pending.classList.remove('typing'); pending.textContent=response.answer;
  } catch(e) {
    pending.classList.remove('typing'); pending.classList.add('error'); pending.textContent=e.message;
    if(e.status===401) toast('Set the demo access code with the ⚙ button.',true);
  } finally { state.chatBusy=false; $('chat-send').disabled=false; $('chat-input').focus(); $('chat-history').scrollTop=$('chat-history').scrollHeight; }
}
function bindEvents() {
  $$('[data-nav]').forEach(btn=>btn.onclick=()=>setView(btn.dataset.nav));
  $$('[data-go]').forEach(btn=>btn.onclick=()=>setView(btn.dataset.go));
  $('scan-button').onclick=runScan; $('scan-button-alt').onclick=runScan;
  $('refresh-shipments').onclick=async()=>{try{await loadData();toast('Shipments refreshed.');}catch(e){toast(e.message,true);}};
  for(const id of ['shipment-search','status-filter','risk-filter']) $(id).addEventListener(id==='shipment-search'?'input':'change',()=>state.data&&renderShipments());
  $('close-modal').onclick=()=>{$('modal-backdrop').hidden=true;};
  $('modal-backdrop').addEventListener('click',(e)=>{if(e.target.id==='modal-backdrop') $('modal-backdrop').hidden=true;});
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape') $('modal-backdrop').hidden=true;});
  $('chat-form').addEventListener('submit',(e)=>{e.preventDefault();sendChat($('chat-input').value.trim());});
  $('chat-input').addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chat-form').requestSubmit();}});
  $$('[data-prompt]').forEach(btn=>btn.onclick=()=>sendChat(btn.dataset.prompt));
  $('chat-jump').onclick=()=>{$('copilot-panel').scrollIntoView({behavior:'smooth',block:'start'});$('chat-input').focus();};
  $('set-access-code').onclick=()=>{ const key=prompt('Optional Cloudflare demo access code (leave empty to clear):',sessionStorage.getItem('infraflow_demo_code')||''); if(key!==null){if(key)sessionStorage.setItem('infraflow_demo_code',key);else sessionStorage.removeItem('infraflow_demo_code');toast('Demo access code updated for this browser tab.');} };
}
(async function init(){
  $('date-today').textContent=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  bindEvents();
  try {await loadData();}catch(e){toast(e.message,true);$('attention-list').innerHTML=`<div class="empty-state">Could not load database. Run <code>npm run db:local</code> before starting the development server.</div>`;}
  await loadChat();
})();
