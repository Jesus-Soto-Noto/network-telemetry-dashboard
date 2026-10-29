// Shannon Network Dashboard - Frontend Logic
let allDevices = [];
let allRouters = [];
let currentFilter = 'all';
let searchQuery = '';

const emojiMap = {
  phone: '📱',
  pc: '💻',
  tv: '📺',
  router: '📡',
  other: '🔌'
};

// Fetch initial data
async function fetchStatus(showSpin = false) {
  const refreshBtn = document.getElementById('refresh-btn');
  const spinIcon = refreshBtn.querySelector('.spin-icon');
  if (showSpin) spinIcon.classList.add('spinning');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    allDevices = data.devices || [];
    allRouters = data.routers || [];

    renderMetrics(data);
    renderRouters(allRouters);
    renderDevicesTable();
  } catch (err) {
    console.error('Error fetching network status:', err);
    showToast('⚠️ Error al contactar el servidor local', 'error');
  } finally {
    if (showSpin) {
      setTimeout(() => spinIcon.classList.remove('spinning'), 600);
    }
  }
}

// Helper to check if a device is unnamed / generic
function isUnnamed(d) {
  if (!d.name) return true;
  const n = d.name.toLowerCase();
  return n.startsWith('unknowndevice') || n.startsWith('dispositivo ') || n === (d.rawName || '').toLowerCase();
}

// Render Top Metrics Row
function renderMetrics(data) {
  document.getElementById('wan-latency').textContent = `${data.internet.latencyMs} ms`;
  document.getElementById('online-count').innerHTML = `${data.onlineDevices} <span class="metric-unit">activos</span>`;
  document.getElementById('total-count').textContent = data.totalDevices;
  document.getElementById('sidebar-device-count').textContent = data.onlineDevices;

  const pct = data.totalDevices > 0 ? Math.round((data.onlineDevices / data.totalDevices) * 100) : 100;
  document.getElementById('active-percentage').textContent = `${pct}% Online`;

  document.getElementById('tab-all-count').textContent = data.totalDevices;
  document.getElementById('tab-online-count').textContent = data.onlineDevices;

  const unnamedCount = (data.devices || []).filter(isUnnamed).length;
  const unnamedTab = document.getElementById('tab-unnamed-count');
  if (unnamedTab) unnamedTab.textContent = unnamedCount;
}

// Render Routers Cards
function renderRouters(routers) {
  const container = document.getElementById('routers-cards-container');
  if (!container) return;

  container.innerHTML = routers.map(r => `
    <div class="router-card">
      <div class="router-top">
        <div class="router-title-box">
          <h3>${r.name}</h3>
          <span class="router-role">${r.role}</span>
        </div>
        <span class="router-status-badge ${r.status}">
          <span class="pulse-dot mini green"></span>
          ${r.status === 'online' ? 'En Línea' : 'Offline'}
        </span>
      </div>

      <div class="router-details-list">
        <div class="router-detail-row">
          <span class="detail-label">IP de Gestión:</span>
          <span class="detail-val green">${r.ip}</span>
        </div>
        <div class="router-detail-row">
          <span class="detail-label">Latencia Local:</span>
          <span class="detail-val">${r.pingMs !== null ? `${r.pingMs} ms` : '<1 ms'}</span>
        </div>
        <div class="router-detail-row">
          <span class="detail-label">Wi-Fi 2.4 GHz:</span>
          <span class="detail-val">${r.wifi24}</span>
        </div>
        ${r.wifi5 !== 'N/A' ? `
        <div class="router-detail-row">
          <span class="detail-label">Wi-Fi 5 GHz:</span>
          <span class="detail-val">${r.wifi5}</span>
        </div>
        ` : ''}
        <div class="router-detail-row">
          <span class="detail-label">Rol DHCP:</span>
          <span class="detail-val">${r.dhcp}</span>
        </div>
      </div>

      <div class="router-card-actions">
        <a href="${r.url}" target="_blank" class="btn-open-panel">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          Abrir Configuración
        </a>
      </div>
    </div>
  `).join('');
}

// Render Devices Table with Smart Real-Time Search
function renderDevicesTable() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  const q = searchQuery.toLowerCase().trim();
  const qClean = q.replace(/[:-]/g, ''); // Normalize MAC (e.g. "a6cc")

  const filtered = allDevices.filter(d => {
    // Smart Real-time Search: Matches MAC (with or without colons), IP, Name, RawName, Vendor
    if (q) {
      const macClean = (d.mac || '').toLowerCase().replace(/[:-]/g, '');
      const match =
        (qClean && macClean.includes(qClean)) ||
        (d.mac && d.mac.toLowerCase().includes(q)) ||
        (d.ip && d.ip.toLowerCase().includes(q)) ||
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.rawName && d.rawName.toLowerCase().includes(q)) ||
        (d.vendor && d.vendor.toLowerCase().includes(q));

      if (!match) return false;
    }

    // Tabs filter
    if (currentFilter === 'online') return d.isOnline;
    if (currentFilter === 'unnamed') return isUnnamed(d);
    if (currentFilter === 'wifi5') return d.connection.includes('5 GHz');
    if (currentFilter === 'wifi24') return d.connection.includes('2.4 GHz');
    if (currentFilter === 'cable') return d.connection.includes('Cable') || d.connection.includes('Punto de Acceso') || d.connection.includes('Extensión');

    return true;
  });

  // Update match count indicator
  const matchCountEl = document.getElementById('search-match-count');
  if (matchCountEl) {
    if (q) {
      matchCountEl.textContent = `${filtered.length} coincidencia${filtered.length === 1 ? '' : 's'}`;
    } else {
      matchCountEl.textContent = '';
    }
  }

  // Update clear button
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) {
    clearBtn.style.display = q ? 'inline-block' : 'none';
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-state">
          <span>No se encontraron dispositivos que coincidan con "<strong>${escapeHtml(searchQuery)}</strong>".</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const icon = emojiMap[d.type] || '📱';
    let connClass = 'lan';
    if (d.connection.includes('5 GHz')) connClass = 'wifi5';
    else if (d.connection.includes('2.4 GHz')) connClass = 'wifi24';

    const vendorSubtitle = d.vendor && d.vendor !== 'Desconocido' ? ` • ${escapeHtml(d.vendor)}` : '';

    return `
      <tr class="draggable-row" draggable="true" data-mac="${d.mac}">
        <td>
          <div class="device-cell">
            <span class="drag-grip-handle" title="Arrastra hacia arriba o abajo para ordenar a tu gusto" draggable="false">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/>
                <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
                <circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>
              </svg>
            </span>
            <div class="device-avatar ${d.type}">${icon}</div>
            <div class="device-info">
              <span class="device-name">
                ${escapeHtml(d.name)}
                ${d.notes ? `<span title="${escapeHtml(d.notes)}" style="font-size:0.75rem;cursor:help;">ℹ️</span>` : ''}
              </span>
              <span class="device-raw">${escapeHtml(d.rawName || d.mac)}${vendorSubtitle}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="ip-badge">${d.ip || '---'}</span>
        </td>
        <td>
          <span class="mac-badge">${d.mac}</span>
        </td>
        <td>
          <span class="conn-pill ${connClass}">
            ${d.connection}
          </span>
        </td>
        <td>
          <span class="status-tag ${d.isOnline ? 'online' : 'offline'}">
            <span class="pulse-dot mini ${d.isOnline ? 'green' : ''}"></span>
            ${d.isOnline ? 'Conectado' : 'Desconectado'}
          </span>
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px;">
            <button class="btn-rename" onclick="openRenameModal('${d.mac}', '${escapeAttr(d.name)}', '${d.type}', '${escapeAttr(d.notes || '')}')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Renombrar
            </button>
            ${d.type !== 'router' ? `
            <button class="btn-forget" title="Olvidar / Eliminar este registro" onclick="forgetDevice('${d.mac}', '${escapeAttr(d.name)}')">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal Handlers
const modal = document.getElementById('rename-modal');
const renameForm = document.getElementById('rename-form');
const editMacInput = document.getElementById('edit-mac');
const editNameInput = document.getElementById('edit-name');
const editNotesInput = document.getElementById('edit-notes');

function openRenameModal(mac, name, type, notes) {
  editMacInput.value = mac;
  editNameInput.value = name;
  editNotesInput.value = notes;

  const radio = document.querySelector(`input[name="edit-type"][value="${type}"]`);
  if (radio) radio.checked = true;

  modal.classList.add('active');
  editNameInput.focus();
}

function closeModal() {
  modal.classList.remove('active');
}

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('cancel-modal').addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

renameForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const mac = editMacInput.value;
  const name = editNameInput.value.trim();
  const notes = editNotesInput.value.trim();
  const type = document.querySelector('input[name="edit-type"]:checked')?.value || 'phone';

  if (!name) return;

  try {
    const res = await fetch('/api/devices/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac, name, type, notes })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`✅ Dispositivo "${name}" guardado y sincronizado`, 'success');
      closeModal();
      await fetchStatus();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Error al guardar el nombre', 'error');
  }
});

// Forget a device
async function forgetDevice(mac, name) {
  if (!confirm(`¿Deseas eliminar y olvidar "${name || mac}" del historial?`)) return;
  try {
    const res = await fetch('/api/devices/forget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🗑️ Dispositivo "${name || mac}" eliminado del historial`, 'success');
      await fetchStatus();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Error al olvidar dispositivo', 'error');
  }
}
window.forgetDevice = forgetDevice;

// Purge all offline / phantom devices
async function clearOfflineDevices() {
  if (!confirm('¿Deseas purgar del historial todos los dispositivos que están actualmente desconectados?')) return;
  try {
    const res = await fetch('/api/devices/clear-offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      showToast(`🧹 Se limpiaron ${data.clearedCount} registros desconectados`, 'success');
      await fetchStatus();
    } else {
      showToast(`Error: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Error al purgar dispositivos desconectados', 'error');
  }
}
window.clearOfflineDevices = clearOfflineDevices;

// Toast notification
function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// Event Listeners
document.getElementById('refresh-btn').addEventListener('click', () => fetchStatus(true));

const topSearchInput = document.getElementById('device-search');
const tableSearchInput = document.getElementById('table-search');
const clearSearchBtn = document.getElementById('clear-search-btn');

function handleSearchUpdate(val) {
  searchQuery = val;
  if (topSearchInput && topSearchInput.value !== val) topSearchInput.value = val;
  if (tableSearchInput && tableSearchInput.value !== val) tableSearchInput.value = val;
  renderDevicesTable();
}

if (topSearchInput) {
  topSearchInput.addEventListener('input', (e) => handleSearchUpdate(e.target.value));
}

if (tableSearchInput) {
  tableSearchInput.addEventListener('input', (e) => handleSearchUpdate(e.target.value));
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    handleSearchUpdate('');
    if (tableSearchInput) tableSearchInput.focus();
  });
}

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderDevicesTable();
  });
});

const clearOfflineBtn = document.getElementById('clear-offline-btn');
if (clearOfflineBtn) {
  clearOfflineBtn.addEventListener('click', clearOfflineDevices);
}

// Drag and Drop Row Reordering Logic
let draggedMac = null;
let draggedRow = null;

function setupTableDragAndDrop() {
  const tbody = document.getElementById('devices-table-body');
  if (!tbody) return;

  tbody.addEventListener('dragstart', (e) => {
    // Prevent drag if interacting with buttons, inputs or links
    if (e.target.closest('button, input, a, .btn-rename, .btn-forget')) {
      e.preventDefault();
      return;
    }
    const row = e.target.closest('tr.draggable-row');
    if (!row) return;

    draggedRow = row;
    draggedMac = row.getAttribute('data-mac');
    if (!draggedMac) return;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedMac);

    setTimeout(() => {
      if (draggedRow) draggedRow.classList.add('is-dragging');
    }, 0);
  });

  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetRow = e.target.closest('tr.draggable-row');
    if (!targetRow || targetRow === draggedRow) return;

    const rect = targetRow.getBoundingClientRect();
    const isTop = (e.clientY - rect.top) < (rect.height / 2);

    tbody.querySelectorAll('tr.draggable-row').forEach(r => {
      if (r !== targetRow) {
        r.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    if (isTop) {
      targetRow.classList.add('drag-over-top');
      targetRow.classList.remove('drag-over-bottom');
    } else {
      targetRow.classList.add('drag-over-bottom');
      targetRow.classList.remove('drag-over-top');
    }
  });

  tbody.addEventListener('dragleave', (e) => {
    const targetRow = e.target.closest('tr.draggable-row');
    if (targetRow && !targetRow.contains(e.relatedTarget)) {
      targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  });

  tbody.addEventListener('drop', (e) => {
    e.preventDefault();
    const targetRow = e.target.closest('tr.draggable-row');

    tbody.querySelectorAll('tr.draggable-row').forEach(r => {
      r.classList.remove('drag-over-top', 'drag-over-bottom', 'is-dragging');
    });

    if (!draggedMac || !targetRow) return;
    const targetMac = targetRow.getAttribute('data-mac');
    if (!targetMac || draggedMac === targetMac) return;

    const rect = targetRow.getBoundingClientRect();
    const isTop = (e.clientY - rect.top) < (rect.height / 2);

    reorderDevices(draggedMac, targetMac, isTop ? 'before' : 'after');
  });

  tbody.addEventListener('dragend', () => {
    if (draggedRow) draggedRow.classList.remove('is-dragging');
    tbody.querySelectorAll('tr.draggable-row').forEach(r => {
      r.classList.remove('drag-over-top', 'drag-over-bottom', 'is-dragging');
    });
    draggedMac = null;
    draggedRow = null;
  });
}

async function reorderDevices(fromMac, toMac, position) {
  const fromIdx = allDevices.findIndex(d => d.mac === fromMac);
  if (fromIdx === -1) return;
  const [movedItem] = allDevices.splice(fromIdx, 1);

  const toIdx = allDevices.findIndex(d => d.mac === toMac);
  if (toIdx === -1) {
    allDevices.push(movedItem);
  } else if (position === 'before') {
    allDevices.splice(toIdx, 0, movedItem);
  } else {
    allDevices.splice(toIdx + 1, 0, movedItem);
  }

  // Instant UI feedback
  renderDevicesTable();

  // Save order to server backend
  const newOrder = allDevices.map(d => d.mac);
  try {
    const res = await fetch('/api/devices/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: newOrder })
    });
    const result = await res.json();
    if (result.success) {
      showToast('✨ Orden personalizado guardado', 'success');
    }
  } catch (err) {
    console.error('Error saving device order:', err);
    showToast('⚠️ No se pudo guardar el orden en el servidor', 'error');
  }
}

// Initialize drag and drop
setupTableDragAndDrop();

// Start and poll every 12 seconds
fetchStatus(true);
setInterval(() => fetchStatus(false), 12000);
