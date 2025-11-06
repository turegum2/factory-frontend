(function(){
    // Проверка поддержки базового ES6 и fetch
    var es6ok = (function(){ try{ new Function("const a=1; let b=2; (function(x){return x})(a);"); return true; }catch(e){ return false; } })();
    var fetchOk = !!window.fetch;
    if (!es6ok || !fetchOk) {
    document.body.innerHTML =
        '<div style="font-family:system-ui,Segoe UI,Roboto;max-width:720px;margin:48px auto;padding:24px;border:1px solid #ddd;border-radius:12px;background:#fff">'+
        '<h2>Требуется обновить браузер</h2>'+
        '<p>Ваш браузер не поддерживает современные функции JavaScript. Пожалуйста, обновите Chrome/Yandex до актуальной версии.</p>'+
        '</div>';
    return;
    }
    // Глобальный ловец ошибок — покажем понятное сообщение вместо «мертвых кнопок»
    window.addEventListener('error', function(e){
    console.error('JS error:', e && e.message, e);
    var el = document.getElementById('runtime-error');
    if (!el) {
        el = document.createElement('div');
        el.id = 'runtime-error';
        el.style = 'position:fixed;left:12px;right:12px;bottom:12px;background:#fee2e2;color:#7f1d1d;border:1px solid #fecaca;padding:12px 16px;border-radius:10px;z-index:9999;font:14px system-ui';
        el.innerHTML = 'Ошибка инициализации интерфейса. Обновите страницу (Ctrl+F5) или браузер.';
        document.body.appendChild(el);
    }
    });
})();
// ---------- Data Model ----------
const LS_KEY = 'fjssp-spa';
const project = load() || {
units: 'minutes',
policy: { priority_objective: 'lexicographic' }, // по умолчанию строгие приоритеты
orders: {},       // id -> {id, priority, deliveryIds:[], stoneIds:[]}
deliveries: {},   // id -> {id, duration, lines:[{orderId, qty}], stoneIds:[]}
stones: {},       // id -> {id, orderId, deliveryId, sawPrograms:[]}
sawPrograms: {},  // id -> {id, stoneId, load, process, unload, details:[]}
details: {},      // id -> {id, stoneId, sourceProgId, note, edgeNeeded, edge_load, edge_process, edge_unload, millingStages:[{id,machine,load,process,unload}]}
};

function persist(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(project)); }catch(e){} }
function load(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){ return null; } }

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

function nextOrderId(){
const ids = Object.keys(project.orders).map(x=>parseInt(x)).filter(x=>!isNaN(x));
return ids.length? Math.max(...ids)+1 : 1;
}
function nextDeliveryId(){
const ids = Object.keys(project.deliveries)
    .filter(x => x.startsWith('DEL-'))
    .map(x => parseInt(x.replace('DEL-', '')))
    .filter(x => !isNaN(x));
return `DEL-${ids.length? Math.max(...ids)+1 : 1}`;
}
function nextStoneId(orderId){
const stones = Object.values(project.stones).filter(s=>s.orderId===orderId);
return `${orderId}-S${stones.length+1}`;
}
function nextProgId(stoneId){
const progs = Object.values(project.sawPrograms).filter(p=>p.stoneId===stoneId);
return `${stoneId}-P${progs.length+1}`;
}
function nextDetailId(progId){
const details = Object.values(project.details).filter(d=>d.sourceProgId===progId);
return `${progId}-D${details.length+1}`;
}
function nextMillingStageId(detailId){
const d = project.details[detailId];
const stages = (d && d.millingStages) ? d.millingStages : [];
return `${detailId}-MS${stages.length+1}`;
}

function downloadJSON(filename, data){
const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = filename;
document.body.appendChild(a);
a.click();
a.remove();
URL.revokeObjectURL(a.href);
}

// ---------- Tab Management ----------
$$('.tab').forEach(tab=>{
tab.addEventListener('click', ()=>{
    const target = tab.dataset.tab;
    $$('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    $$('.section').forEach(s=>s.classList.remove('active'));
    $(`#tab-${target}`).classList.add('active');
});
});

// ---------- Orders ----------
function renderOrders(){
const list = $('#orders-list');
list.innerHTML = '';
const orders = Object.values(project.orders).sort((a,b)=>b.priority-a.priority || a.id.localeCompare(b.id));

orders.forEach(o=>{
    const deliveryCount = (o.deliveryIds||[]).length;
    const stoneCount = (o.stoneIds||[]).length;
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
    <div class="item-header">
        <div class="item-title">
        📦 Заказ #${o.id}
        ${o.priority > 0 ? `<span class="badge yellow">⭐ Приоритетный</span>` : ''}
        </div>
        <button class="btn small danger" data-act="del-order" data-id="${o.id}">Удалить</button>
    </div>
    <div class="grid g3">
        <div>
        <label>Номер заказа</label>
        <input type="text" value="${o.id}" data-act="edit-order-id" data-id="${o.id}">
        </div>
        <div>
        <label>Приоритет</label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <input type="checkbox" ${o.priority > 0 ? 'checked' : ''} data-act="toggle-order-pri" data-id="${o.id}">
            Приоритетный заказ
        </label>
        </div>
        <div>
        <label>Статистика</label>
        <div class="row" style="gap:8px; margin-top:8px">
            <span class="pill">🚚 Доставки: ${deliveryCount}</span>
            <span class="pill">💎 Камни: ${stoneCount}</span>
        </div>
        </div>
    </div>
    `;
    list.appendChild(el);
});
}

$('#btn-add-order').addEventListener('click', ()=>{
const id = $('#new-order-id').value.trim();
if (!id) {
    alert('Введите номер заказа');
    $('#new-order-id').focus();
    return;
}
const priority = $('#new-order-prio-flag').checked ? 1 : 0;
if (project.orders[id]) {
    alert('Заказ с таким номером уже существует');
    return;
}
project.orders[id] = { id, priority, deliveryIds:[], stoneIds:[] };
$('#new-order-id').value = '';
$('#new-order-prio-flag').checked = false;
persist();
renderAll();
});

$('#orders-list').addEventListener('input', e=>{
const t = e.target;
if(t.dataset.act==='edit-order-id'){
    const oldId = t.dataset.id;
    const newId = t.value.trim();
    if(newId && newId !== oldId && !project.orders[newId]){
    const o = project.orders[oldId];
    delete project.orders[oldId];
    o.id = newId;
    project.orders[newId] = o;
    // Update references
    Object.values(project.stones).forEach(s=>{
        if(s.orderId===oldId) s.orderId = newId;
    });
    Object.values(project.deliveries).forEach(d=>{
        (d.lines||[]).forEach(line=>{
        if (line.orderId === oldId) line.orderId = newId;
        });
    });
    persist();
    renderAll();
    }
}
});

$('#orders-list').addEventListener('change', e=>{
const t = e.target;
if (t.dataset.act === 'toggle-order-pri') {
    const id = t.dataset.id;
    if (project.orders[id]) {
    project.orders[id].priority = t.checked ? 1 : 0;
    persist();
    renderAll(); // чтобы сразу пересортировать список по приоритету
    }
}
});

$('#orders-list').addEventListener('click', e=>{
const t = e.target.closest('[data-act]');
if(!t) return;

if(t.dataset.act==='del-order'){
    const id = t.dataset.id;
    if(!confirm(`Удалить заказ ${id} и все связанные данные?`)) return;

    const o = project.orders[id]; if(!o) return;
    const orderStoneIds = new Set(o.stoneIds||[]);

    // 1) чистим детали/программы/камни заказа
    (o.stoneIds||[]).forEach(sid=>{
    const s = project.stones[sid]; if(!s) return;
    (s.sawPrograms||[]).forEach(pid=>{
        const sp = project.sawPrograms[pid]; if(!sp) return;
        (sp.details||[]).forEach(did=> delete project.details[did]);
        delete project.sawPrograms[pid];
    });
    delete project.stones[sid];
    });

    // 2) чистим доставки
    Object.values(project.deliveries).forEach(d=>{
    d.lines    = (d.lines||[]).filter(l=> l.orderId !== id);
    d.stoneIds = (d.stoneIds||[]).filter(sid=> !orderStoneIds.has(sid));
    });

    // 3) удаляем пустые доставки
    Object.values({...project.deliveries}).forEach(d=>{
    var _ll = d.lines ? d.lines.length : 0;
    var _ss = d.stoneIds ? d.stoneIds.length : 0;
    if (_ll===0 && _ss===0) {
        delete project.deliveries[d.id];
    }
    });

    delete project.orders[id];
    persist(); renderAll();
}
});

// ---------- Deliveries ----------
function renderDelComposer(){
const cont = $('#del-lines');
cont.innerHTML = '';
const lines = window.deliveryLines || [];
lines.forEach((line,idx)=>{
    const div = document.createElement('div');
    div.className = 'grid g3';
    div.style.marginBottom = '8px';
    div.innerHTML = `
    <div>
        <label>Заказ</label>
        <select data-idx="${idx}" data-field="orderId">
        <option value="">-- Выбрать --</option>
        ${Object.values(project.orders).map(o=>`<option value="${o.id}" ${line.orderId===o.id?'selected':''}>${o.id}</option>`).join('')}
        </select>
    </div>
    <div>
        <label>Количество камней</label>
        <input type="number" value="${line.qty||1}" min="1" data-idx="${idx}" data-field="qty">
    </div>
    <div class="row row-end">
        <button class="btn small danger" data-act="del-del-line" data-idx="${idx}">Удалить</button>
    </div>
    `;
    cont.appendChild(div);
});
}

$('#btn-add-del-line').addEventListener('click', ()=>{
window.deliveryLines = window.deliveryLines || [];
window.deliveryLines.push({ orderId:'', qty:1 });
renderDelComposer();
});

$('#del-lines').addEventListener('input', e=>{
const t = e.target;
const idx = parseInt(t.dataset.idx);
const field = t.dataset.field;
if(!window.deliveryLines || !window.deliveryLines[idx]) return;
if(field==='orderId') window.deliveryLines[idx].orderId = t.value;
if(field==='qty') window.deliveryLines[idx].qty = parseInt(t.value) || 1;
});

$('#del-lines').addEventListener('click', e=>{
const t = e.target.closest('[data-act]');
if(!t) return;
if(t.dataset.act==='del-del-line'){
    const idx = parseInt(t.dataset.idx);
    window.deliveryLines.splice(idx, 1);
    renderDelComposer();
}
});

$('#btn-create-delivery').addEventListener('click', ()=>{
const lines = window.deliveryLines || [];
if(lines.length===0 || lines.every(l=>!l.orderId)){
    alert('Добавьте хотя бы одну строку доставки с выбранным заказом');
    return;
}
const delId = nextDeliveryId();
const duration = parseInt($('#del-duration').value) || 0;
const delivery = { id: delId, duration, lines: lines.filter(l=>l.orderId), stoneIds:[] };

// Create stones based on delivery lines
delivery.lines.forEach(line=>{
    for(let i=0; i<line.qty; i++){
    const stoneId = nextStoneId(line.orderId);
    project.stones[stoneId] = { id: stoneId, orderId: line.orderId, deliveryId: delId, sawPrograms:[] };
    delivery.stoneIds.push(stoneId);
    const o = project.orders[line.orderId];
    if(o){
        o.stoneIds = o.stoneIds || [];
        o.stoneIds.push(stoneId);
    }
    }
});

project.deliveries[delId] = delivery;
// Add to orders
delivery.lines.forEach(line=>{
    const o = project.orders[line.orderId];
    if(o){
    o.deliveryIds = o.deliveryIds || [];
    o.deliveryIds.push(delId);
    }
});

window.deliveryLines = [];
$('#del-duration').value = '0';
persist();
renderAll();
});

// ---------- Render Deliveries ----------
function renderDeliveries(){
const list = $('#deliveries-list');
if (!list) return; // Если элемент не существует, выходим

list.innerHTML = '';
const deliveries = Object.values(project.deliveries || {});

if (deliveries.length === 0) {
    list.innerHTML = '<div class="help" style="text-align: center; padding: 20px; color: var(--text-muted);">Доставки пока не добавлены</div>';
    return;
}

deliveries.forEach(delivery => {
    const el = document.createElement('div');
    el.className = 'list-item';
    
    // Подготовка строк доставки
    const deliveryLinesHTML = (delivery.lines || []).map((line, idx) => {
    const stones = delivery.stoneIds.filter(sid => {
        const stone = project.stones[sid];
        return stone && stone.orderId === line.orderId;
    });
    const stonesList = stones.slice(0, line.qty).join(', ') || 'Нет камней';
    
    return `
        <div class="grid g3" style="margin: 8px 0; padding: 12px; background: #f8fafc; border-radius: 8px;">
        <div>
            <label style="font-size: 12px; color: var(--text-muted);">Заказ</label>
            <div style="padding: 10px 14px; background: white; border: 1px solid var(--border); border-radius: 8px; 
                        min-height: 42px; font-size: 14px; color: var(--text);">
            ${line.orderId || 'Не указан'}
            </div>
        </div>
        <div>
            <label style="font-size: 12px; color: var(--text-muted);">Количество камней</label>
            <div style="padding: 10px 14px; background: white; border: 1px solid var(--border); border-radius: 8px; 
                        min-height: 42px; font-size: 14px; color: var(--text);">
            ${line.qty || 0}
            </div>
        </div>
        <div>
            <label style="font-size: 12px; color: var(--text-muted);">Список камней</label>
            <div style="padding: 10px 14px; background: white; border: 1px solid var(--border); border-radius: 8px; 
                        min-height: 42px; font-size: 13px; color: var(--text-muted); overflow: auto;">
            ${stonesList}
            </div>
        </div>
        </div>
    `;
    }).join('');
    
    el.innerHTML = `
    <div class="item-header">
        <div class="item-title">
        🚚 Доставка ${delivery.id}
        <span class="badge gray">Камней: ${delivery.stoneIds.length}</span>
        </div>
        <button class="btn small danger" data-act="del-delivery" data-id="${delivery.id}">Удалить</button>
    </div>
    
    <div style="margin-top: 12px;">
        ${deliveryLinesHTML || '<div class="help">Нет строк доставки</div>'}
    </div>
    
    <div style="margin-top: 12px;">
        <label>Время доставки (минуты)</label>
        <div style="padding: 10px 14px; background: white; border: 1px solid var(--border); border-radius: 8px; 
                    max-width: 200px; font-size: 14px; color: var(--text);">
        ${delivery.duration || 0}
        </div>
    </div>
    `;
    
    list.appendChild(el);
});
}

// Обработчик для удаления доставок
$('#deliveries-list').addEventListener('click', e => {
const t = e.target.closest('[data-act]');
if (!t) return;

if (t.dataset.act === 'del-delivery') {
    const delId = t.dataset.id;
    if (!confirm(`Удалить доставку ${delId}? Все связанные камни также будут удалены.`)) return;
    
    const delivery = project.deliveries[delId];
    if (delivery) {
    // Удаляем все камни доставки
    (delivery.stoneIds || []).forEach(sid => {
        const stone = project.stones[sid];
        if (stone) {
        // Удаляем программы и детали
        (stone.sawPrograms || []).forEach(pid => {
            const sp = project.sawPrograms[pid];
            if (sp) {
            (sp.details || []).forEach(did => {
                delete project.details[did];
            });
            delete project.sawPrograms[pid];
            }
        });
        
        // Удаляем из заказа
        const order = project.orders[stone.orderId];
        if (order) {
            order.stoneIds = (order.stoneIds || []).filter(x => x !== sid);
        }
        
        delete project.stones[sid];
        }
    });
    
    // Удаляем ссылки из заказов
    (delivery.lines || []).forEach(line => {
        const order = project.orders[line.orderId];
        if (order) {
        order.deliveryIds = (order.deliveryIds || []).filter(x => x !== delId);
        }
    });
    
    // Удаляем саму доставку
    delete project.deliveries[delId];
    
    persist();
    renderAll();
    }
}
});

// ---------- Stones ----------
function renderStones(){
const list = $('#stones-list');
list.innerHTML = '';
const stones = Object.values(project.stones).sort((a,b)=>{
    const oa = project.orders[a.orderId]; const ob = project.orders[b.orderId];
    const pa = (oa && typeof oa.priority==='number') ? oa.priority : 0;
    const pb = (ob && typeof ob.priority==='number') ? ob.priority : 0;
    if(pa!==pb) return pb-pa;
    return a.id.localeCompare(b.id);
});

stones.forEach(s=>{
    const o = project.orders[s.orderId];
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
    <div class="item-header">
        <div class="item-title">
        💎 Камень ${s.id}
        <span class="badge blue">Заказ: ${s.orderId}</span>
        ${s.deliveryId ? `<span class="badge green">🚚 ${s.deliveryId}</span>` : ''}
        </div>
        <button class="btn small danger" data-act="del-stone" data-id="${s.id}">Удалить</button>
    </div>
    `;
    
    // Saw programs
    const progDiv = document.createElement('div');
    progDiv.style.marginTop = '12px';
    (s.sawPrograms||[]).forEach(pid=>{
    const sp = project.sawPrograms[pid];
    if(!sp) return;
    const pd = document.createElement('div');
    pd.className = 'prog-card';
    pd.innerHTML = `
        <div class="item-header">
        <div style="font-weight:600; font-size:14px">🔧 Программа пилы: ${pid}</div>
        <button class="btn small danger" data-act="del-prog" data-pid="${pid}">Удалить</button>
        </div>
        <div class="grid g3" style="margin-top:8px">
        <div>
            <label>Загрузка (мин)</label>
            <input type="number" value="${sp.load}" data-act="edit-prog" data-pid="${pid}" data-field="load">
        </div>
        <div>
            <label>Распил (мин)</label>
            <input type="number" value="${sp.process}" data-act="edit-prog" data-pid="${pid}" data-field="process">
        </div>
        <div>
            <label>Выгрузка (мин)</label>
            <input type="number" value="${sp.unload}" data-act="edit-prog" data-pid="${pid}" data-field="unload">
        </div>
        </div>
        <div class="row" style="margin-top:8px">
        <button class="btn small secondary" data-act="add-detail" data-pid="${pid}">
            <span>➕</span> Добавить деталь
        </button>
        <span class="help">Детали: ${(sp.details||[]).length}</span>
        </div>
    `;
    progDiv.appendChild(pd);
    });
    el.appendChild(progDiv);
    
    const addBtn = document.createElement('div');
    addBtn.className = 'row';
    addBtn.style.marginTop = '12px';
    addBtn.innerHTML = `
    <button class="btn small secondary" data-act="add-prog" data-sid="${s.id}">
        <span>➕</span> Добавить программу пилы
    </button>
    `;
    el.appendChild(addBtn);
    
    list.appendChild(el);
});
}

$('#stones-list').addEventListener('click', e=>{
const t = e.target.closest('[data-act]');
if(!t) return;
if(t.dataset.act==='del-stone'){
    const sid = t.dataset.id;
    const s = project.stones[sid];
    if(!confirm(`Удалить камень ${sid}?`)) return;
    // Delete programs and details
    (s.sawPrograms||[]).forEach(pid=>{
    const sp = project.sawPrograms[pid];
    if(sp){
        (sp.details||[]).forEach(did=>{ delete project.details[did]; });
        delete project.sawPrograms[pid];
    }
    });
    // Remove from order
    const o = project.orders[s.orderId];
    if(o){ o.stoneIds = (o.stoneIds||[]).filter(x=>x!==sid); }
    // Remove from delivery
    if(s.deliveryId){
    const d = project.deliveries[s.deliveryId];
    if(d){ d.stoneIds = (d.stoneIds||[]).filter(x=>x!==sid); }
    }
    delete project.stones[sid];
    persist();
    renderAll();
}
if(t.dataset.act==='add-prog'){
    const sid = t.dataset.sid;
    const pid = nextProgId(sid);
    project.sawPrograms[pid] = { id: pid, stoneId: sid, load:10, process:30, unload:10, details:[] };
    const s = project.stones[sid];
    s.sawPrograms = s.sawPrograms || [];
    s.sawPrograms.push(pid);
    persist();
    renderAll();
}
if(t.dataset.act==='del-prog'){
    const pid = t.dataset.pid;
    const sp = project.sawPrograms[pid];
    if(!sp) return;
    // Delete details
    (sp.details||[]).forEach(did=>{ delete project.details[did]; });
    // Remove from stone
    const s = project.stones[sp.stoneId];
    if(s){ s.sawPrograms = (s.sawPrograms||[]).filter(x=>x!==pid); }
    delete project.sawPrograms[pid];
    persist();
    renderAll();
}
if(t.dataset.act==='add-detail'){
    const pid = t.dataset.pid;
    const sp = project.sawPrograms[pid];
    if(!sp) return;
    const did = nextDetailId(pid);
    project.details[did] = {
    id: did,
    stoneId: sp.stoneId,
    sourceProgId: pid,
    note: '',
    edgeNeeded: false,
    edge_load: 5,
    edge_process: 10,
    edge_unload: 5,
    millingStages: []
    };
    sp.details = sp.details || [];
    sp.details.push(did);
    persist();
    renderAll();
}
});

$('#stones-list').addEventListener('input', e=>{
const t = e.target;
if(t.dataset.act==='edit-prog'){
    const pid = t.dataset.pid;
    const field = t.dataset.field;
    project.sawPrograms[pid][field] = parseInt(t.value) || 0;
    persist();
}
});

// ---------- Details ----------
function renderDetails(){
const list = $('#details-list');
list.innerHTML = '';
const details = Object.values(project.details);

details.forEach(d=>{
    const s = project.stones[d.stoneId];
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
    <div class="item-header">
        <div class="item-title">
        ⚙️ Деталь ${d.id}
        <span class="badge blue">Камень: ${d.stoneId}</span>
        </div>
        <button class="btn small danger" data-act="del-detail" data-did="${d.id}">Удалить</button>
    </div>
    <div style="margin-top:12px">
        <label>
        <input type="checkbox" ${d.edgeNeeded?'checked':''} data-act="toggle-edge" data-did="${d.id}">
        Требуется кромка
        </label>
    </div>
    ${d.edgeNeeded ? `
        <div class="grid g3" style="margin-top:8px; background:#f8fafc; padding:8px; border-radius:8px">
        <div>
            <label>Кромка: загрузка (мин)</label>
            <input type="number" value="${d.edge_load}" data-act="edit-edge" data-did="${d.id}" data-field="edge_load">
        </div>
        <div>
            <label>Кромка: обработка (мин)</label>
            <input type="number" value="${d.edge_process}" data-act="edit-edge" data-did="${d.id}" data-field="edge_process">
        </div>
        <div>
            <label>Кромка: выгрузка (мин)</label>
            <input type="number" value="${d.edge_unload}" data-act="edit-edge" data-did="${d.id}" data-field="edge_unload">
        </div>
        </div>
    ` : ''}
    <div style="margin-top:12px">
        <div style="font-weight:600; margin-bottom:8px">Фрезеровка:</div>
        ${(d.millingStages||[]).map(ms=>`
        <div style="background:#f8fafc; padding:8px; border-radius:8px; margin:8px 0">
            <div class="grid g4">
            <div>
                <label>Станок</label>
                <select data-act="edit-ms" data-did="${d.id}" data-msid="${ms.id}" data-field="machine">
                <option value="Фрезер 1" ${ms.machine==='Фрезер 1'?'selected':''}>Фрезер 1</option>
                <option value="Фрезер 2" ${ms.machine==='Фрезер 2'?'selected':''}>Фрезер 2</option>
                </select>
            </div>
            <div>
                <label>Загрузка (мин)</label>
                <input type="number" value="${ms.load}" data-act="edit-ms" data-did="${d.id}" data-msid="${ms.id}" data-field="load">
            </div>
            <div>
                <label>Обработка (мин)</label>
                <input type="number" value="${ms.process}" data-act="edit-ms" data-did="${d.id}" data-msid="${ms.id}" data-field="process">
            </div>
            <div>
                <label>Выгрузка (мин)</label>
                <input type="number" value="${ms.unload}" data-act="edit-ms" data-did="${d.id}" data-msid="${ms.id}" data-field="unload">
                <button class="btn small danger" style="margin-top:4px" data-act="del-ms" data-did="${d.id}" data-msid="${ms.id}">Удалить</button>
            </div>
            </div>
        </div>
        `).join('')}
        <button class="btn small secondary" data-act="add-ms" data-did="${d.id}">
        <span>➕</span> Добавить фрезеровку
        </button>
    </div>
    `;
    list.appendChild(el);
});
}

$('#details-list').addEventListener('change', e=>{
const t = e.target;
if(t.dataset.act==='toggle-edge'){
    const did = t.dataset.did;
    project.details[did].edgeNeeded = t.checked;
    persist();
    renderAll();
}
});

$('#details-list').addEventListener('input', e=>{
const t = e.target;
if(t.dataset.act==='edit-edge'){
    const did = t.dataset.did;
    const field = t.dataset.field;
    project.details[did][field] = parseInt(t.value) || 0;
    persist();
}
if(t.dataset.act==='edit-ms'){
    const d = project.details[t.dataset.did];
    const ms = d.millingStages.find(x=>x.id===t.dataset.msid);
    if(!ms) return;
    const field = t.dataset.field;
    if(field==='machine') ms[field] = t.value;
    else ms[field] = parseInt(t.value) || 0;
    persist();
}
});

$('#details-list').addEventListener('click', e=>{
const t = e.target.closest('[data-act]'); if(!t) return;
if(t.dataset.act==='add-ms'){
    const did = t.dataset.did; const d = project.details[did];
    const msId = nextMillingStageId(did);
    d.millingStages.push({ id: msId, machine:'Фрезер 1', load:0, process:0, unload:0 });
    persist(); renderAll();
}
if(t.dataset.act==='del-ms'){
    const d = project.details[t.dataset.did]; if(!d) return;
    d.millingStages = d.millingStages.filter(x=>x.id!==t.dataset.msid);
    persist(); renderAll();
}
if(t.dataset.act==='del-detail'){
    const did = t.dataset.did; const d = project.details[did]; if(!d) return;
    const sp = project.sawPrograms[d.sourceProgId]; if(sp){ sp.details = sp.details.filter(x=>x!==did); }
    delete project.details[did]; persist(); renderAll();
}
});

// ---------- Export ----------
function renderExport(){
const summary = $('#summary');
summary.innerHTML = '';
const cells = [
    ['📦', 'Заказы', Object.keys(project.orders).length],
    ['🚚', 'Доставки', Object.keys(project.deliveries).length],
    ['💎', 'Камни', Object.keys(project.stones).length],
    ['🔧', 'Программы', Object.keys(project.sawPrograms).length],
    ['⚙️', 'Детали', Object.keys(project.details).length],
];
cells.forEach(([icon, label, value])=>{
    const c = document.createElement('div');
    c.className='stat-card';
    c.innerHTML = `
    <div style="font-size:24px; margin-bottom:4px">${icon}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
    `;
    summary.appendChild(c);
});
}

$('#btn-export-json').addEventListener('click', ()=>{
// Prepare arrays for export
const orders = Object.values(project.orders).map(o=>({ order_id:o.id, priority:o.priority }));
const deliveries = Object.values(project.deliveries).map(d=>({
    delivery_id: d.id,
    duration_min: d.duration,
    lines: (d.lines||[]).map(l=>({ order_id: l.orderId, qty: l.qty })),
    unlocks_stones: d.stoneIds.join(',')
}));
const stones = Object.values(project.stones).map(s=>({ stone_id:s.id, order_id:s.orderId, delivery_id:s.deliveryId }));
const sawPrograms = Object.values(project.sawPrograms).map(sp=>({ prog_id:sp.id, stone_id:sp.stoneId, load_C_min:sp.load, process_D_min:sp.process, unload_E_min:sp.unload }));
const details = Object.values(project.details).map(d=>({
    detail_id:d.id,
    order_id: (project.stones[d.stoneId] && project.stones[d.stoneId].orderId)
            ? project.stones[d.stoneId].orderId : '',
    stone_id:d.stoneId,
    source_prog_id:d.sourceProgId,
    need_edge: d.edgeNeeded? 'Y':'N',
    edge_load_F_min: d.edgeNeeded? d.edge_load:0,
    edge_process_G_min: d.edgeNeeded? d.edge_process:0,
    edge_unload_H_min: d.edgeNeeded? d.edge_unload:0,
    note: d.note||'' ,
    millingStages: (d.millingStages||[]).map(ms=>({ id: ms.id, machine: ms.machine, mill_load_min: ms.load, mill_process_min: ms.process, mill_unload_min: ms.unload }))
}));

const exportObj = {
    units: project.units,
    policy: project.policy,
    orders, deliveries, stones, sawPrograms, details
};
downloadJSON('input_data.json', exportObj);
});

// --- Import JSON ---
$('#btn-import-json').addEventListener('click', ()=>{
$('#file-json').click();
});

$('#file-json').addEventListener('change', async e=>{
const file = e.target.files[0];
if(!file) return;
try{
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Clear current project
    project.orders = {};
    project.deliveries = {};
    project.stones = {};
    project.sawPrograms = {};
    project.details = {};
    
    // Import data
    (data.orders||[]).forEach(o=>{
    const p = Math.min(1, Number(o.priority) || 0); // 0 или 1
    project.orders[o.order_id] = {
        id: o.order_id,
        priority: p,
        deliveryIds: [],
        stoneIds: []
    };
    });
    
    (data.stones||[]).forEach(s=>{
    project.stones[s.stone_id] = {
        id: s.stone_id,
        orderId: s.order_id,
        deliveryId: s.delivery_id || null,
        sawPrograms: []
    };
    const order = project.orders[s.order_id];
    if(order){
        order.stoneIds = order.stoneIds || [];
        order.stoneIds.push(s.stone_id);
    }
    });
    
    (data.sawPrograms||[]).forEach(sp=>{
    project.sawPrograms[sp.prog_id] = {
        id: sp.prog_id,
        stoneId: sp.stone_id,
        load: sp.load_C_min || 0,
        process: sp.process_D_min || 0,
        unload: sp.unload_E_min || 0,
        details: []
    };
    const stone = project.stones[sp.stone_id];
    if(stone){
        stone.sawPrograms = stone.sawPrograms || [];
        stone.sawPrograms.push(sp.prog_id);
    }
    });
    
    (data.details||[]).forEach(d=>{
    project.details[d.detail_id] = {
        id: d.detail_id,
        stoneId: d.stone_id,
        sourceProgId: d.source_prog_id,
        note: d.note || '',
        edgeNeeded: d.need_edge === 'Y' || d.need_edge === true,
        edge_load: d.edge_load_F_min || 0,
        edge_process: d.edge_process_G_min || 0,
        edge_unload: d.edge_unload_H_min || 0,
        millingStages: (d.millingStages||[]).map(ms=>({
        id: ms.id,
        machine: ms.machine,
        load: ms.mill_load_min || 0,
        process: ms.mill_process_min || 0,
        unload: ms.mill_unload_min || 0
        }))
    };
    const prog = project.sawPrograms[d.source_prog_id];
    if(prog){
        prog.details = prog.details || [];
        prog.details.push(d.detail_id);
    }
    });
    
    (data.deliveries||[]).forEach(d=>{
    const stoneIds = d.unlocks_stones ? d.unlocks_stones.split(',').filter(x=>x) : [];
    project.deliveries[d.delivery_id] = {
        id: d.delivery_id,
        duration: d.duration_min || 0,
        lines: (d.lines||[]).map(l=>({ orderId: l.order_id, qty: l.qty || 1 })),
        stoneIds
    };
    // Update stones with delivery info
    stoneIds.forEach(sid=>{
        if(project.stones[sid]){
        project.stones[sid].deliveryId = d.delivery_id;
        }
    });
    // Update orders with delivery info
    (d.lines||[]).forEach(line=>{
        const order = project.orders[line.order_id];
        if(order){
        order.deliveryIds = order.deliveryIds || [];
        order.deliveryIds.push(d.delivery_id);
        }
    });
    });
    
    // Режим всегда «lexicographic» — переписываем старые JSON
    project.policy = { priority_objective: 'lexicographic' };
    project.units = data.units || 'minutes';
    
    persist();
    renderAll();
    alert('Данные успешно загружены!');
}catch(err){
    alert('Ошибка загрузки файла: ' + err.message);
}
e.target.value = '';
});

document.getElementById('btn-help').addEventListener('click', ()=>{
// Открываем синхронно — браузер не заблокирует
window.open("help.html", "_blank", "noopener");
});

// --- Run optimization via local service and download results (Excel + HTML) ---
document.getElementById('btn-optimize').addEventListener('click', async ()=>{
const btn = document.getElementById('btn-optimize');
if (btn.disabled) return;                 // защита от повторных кликов
// --- заблокировать кнопку и сменить текст ---
btn.disabled = true;
btn.dataset.prev = btn.innerHTML;
btn.innerHTML = '⏳ Идёт расчёт…';

const BASE = (window.ENV && window.ENV.API_BASE) || "https://d5dbceei9enp79259un2.z7jmlavt.apigw.yandexcloud.net";

// 1) Открываем вкладку синхронно — браузер не заблокирует
const preview = window.open('', '_blank');
if (preview) {
    preview.document.write(`
    <!doctype html><meta charset="utf-8">
    <title>Формирование диаграммы...</title>
    <style>
        body{font-family:Inter,system-ui;margin:40px;color:#111; background:#f8fafc}
        .container{max-width:600px; margin:100px auto; text-align:center}
        .spinner{width:48px;height:48px;border:4px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 20px}
        @keyframes spin{to{transform:rotate(360deg)}}
        h1{font-size:24px; margin:20px 0 10px}
        p{color:#64748b; font-size:14px}
    </style>
    <div class="container">
        <div class="spinner"></div>
        <h1>Формируем план производства...</h1>
        <p>Расчёт оптимального расписания<br>Окно обновится автоматически</p>
    </div>
    `);
    preview.document.close();
}

try {
    // --- сбор данных как раньше ---
    const orders     = Object.values(project.orders).map(o=>({ order_id:o.id, priority:o.priority }));
    const deliveries = Object.values(project.deliveries).map(d=>({
    delivery_id: d.id,
    duration_min: d.duration,
    lines: (d.lines||[]).map(l=>({ order_id: l.orderId, qty: l.qty })),
    unlocks_stones: (d.stoneIds||[]).join(',')
    }));
    const stones     = Object.values(project.stones).map(s=>({ stone_id:s.id, order_id:s.orderId, delivery_id:s.deliveryId }));
    const sawPrograms= Object.values(project.sawPrograms).map(sp=>({ prog_id:sp.id, stone_id:sp.stoneId, load_C_min:sp.load, process_D_min:sp.process, unload_E_min:sp.unload }));
    const details    = Object.values(project.details).map(d=>({
    detail_id:d.id,
    order_id: (project.stones[d.stoneId] && project.stones[d.stoneId].orderId) ? 
                project.stones[d.stoneId].orderId : '',
    stone_id:d.stoneId, source_prog_id:d.sourceProgId,
    need_edge: d.edgeNeeded? 'Y':'N',
    edge_load_F_min: d.edge_load||0,
    edge_process_G_min: d.edge_process||0,
    edge_unload_H_min: d.edge_unload||0,
    note: d.note||'',
    millingStages: (d.millingStages||[]).map(ms=>({ id: ms.id, machine: ms.machine, mill_load_min: ms.load, mill_process_min: ms.process, mill_unload_min: ms.unload }))
    }));
    const exportObj = { units: project.units, policy: project.policy, orders, deliveries, stones, sawPrograms, details };

    // --- HTML + Excel ---
    const resp = await fetch(`${BASE}/optimize/html-file`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(exportObj)
    });
    if (!resp.ok) throw new Error('Сервис вернул ошибку (html-file)');

    const data = await resp.json();

    // Обновляем окно: если бэк дал готовый HTML — рисуем его inline,
    // иначе открываем ссылку на файл в витрине /ui/...
    if (data.html && preview) {
      preview.document.open();
      preview.document.write(data.html);
      preview.document.close();
    } else {
        const url = /^https?:\/\//i.test(data.url) ? data.url : `${BASE}${data.url}`;
        if (preview) preview.location.replace(url);
        else window.open(url, '_blank', 'noopener');
    }

    // Сразу качаем Excel ИМЕННО того же расчёта
    if (data.excel_url) {
    const a = document.createElement('a');
    a.href = `${BASE}${data.excel_url}`;
    a.download = 'schedule.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    }

} catch (e) {
    alert('Ошибка расчёта: ' + e.message + '\nПроверьте доступность: ' + BASE + '/ping');
    if (preview && !preview.closed) preview.close();
} finally {
    // --- вернуть кнопку в норму ---
    btn.disabled = false;
    btn.innerHTML = btn.dataset.prev || 'Расчёт плана';
}
});

$('#btn-reset').addEventListener('click', ()=>{
if(!confirm('Удалить все данные? Это действие нельзя отменить.')) return;
localStorage.removeItem(LS_KEY);
window.location.reload();
});

function renderAll(){ renderOrders(); renderDelComposer(); renderDeliveries(); renderStones(); renderDetails(); renderExport(); }
window.deliveryLines = [];
renderAll();