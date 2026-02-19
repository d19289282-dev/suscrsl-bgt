(function(){
  function ready(fn){
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function(){
    if (typeof io === 'undefined') {
      console.warn('Socket.IO cliente no cargado.');
      return;
    }

    const socket = io();
    const totalEl = document.getElementById('total-count');
    const entriesEl = document.getElementById('total-entries');
    const lastEl = document.getElementById('last-updated');
    const clientsList = document.getElementById('clients');
    const refreshBtn = document.getElementById('refresh');
    const clearBtn = document.getElementById('clear-log');
    const exportBtn = document.getElementById('export-csv');
    const recentEl = document.getElementById('recent-visits');

    // Chart setup
    const ctx = document.getElementById('onlineChart').getContext('2d');
    let chart = null;
    const chartData = { labels: [], datasets: [{ label: 'Conectados', data: [], borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', tension: 0.25 }] };
    try {
      chart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { beginAtZero: true } } }
      });
    } catch (e) {
      console.warn('Chart.js no disponible:', e);
    }

    let lastStats = null;

    function formatTime(ts){
      const d = new Date(ts);
      return d.toLocaleString();
    }

    function pushChartPoint(value){
      const label = new Date().toLocaleTimeString();
      chartData.labels.push(label);
      chartData.datasets[0].data.push(value);
      if (chartData.labels.length > 30) { chartData.labels.shift(); chartData.datasets[0].data.shift(); }
      if (chart) chart.update();
    }

    function renderStats(s){
      lastStats = s;
      totalEl.textContent = s.online || 0;
      entriesEl.textContent = s.totalVisits || 0;
      lastEl.textContent = new Date().toLocaleString();

      // clients
      clientsList.innerHTML = '';
      (s.clients || []).forEach(c => {
        const li = document.createElement('li');
        li.className = 'py-2';
        li.innerHTML = `<div class="font-medium text-xs">${c.id}</div><div class="text-xs text-gray-400">Conectado: ${formatTime(c.connectedAt)}</div>`;
        clientsList.appendChild(li);
      });

      // recent visits
      if (recentEl) {
        recentEl.innerHTML = '';
        (s.recentVisits || []).forEach(v => {
          const li = document.createElement('li');
          li.className = 'py-2';
          li.innerHTML = `<div class="text-sm">${v.id}</div><div class="text-xs text-gray-500">Entrada: ${formatTime(v.at)}</div>`;
          recentEl.appendChild(li);
        });
      }

      pushChartPoint(s.online || 0);
    }

    socket.on('stats', (s) => { if (s) renderStats(s); });
    socket.on('count', (n) => { if (n !== undefined) { totalEl.textContent = n; pushChartPoint(n); lastEl.textContent = new Date().toLocaleString(); } });

    refreshBtn.addEventListener('click', function(){ socket.emit('request-details'); });
    clearBtn.addEventListener('click', function(){ if (recentEl) recentEl.innerHTML = ''; if (clientsList) clientsList.innerHTML = ''; });

    exportBtn.addEventListener('click', function(){
      if (!lastStats) return alert('No hay datos para exportar aún');
      const rows = [['id','timestamp']];
      (lastStats.recentVisits || []).forEach(r => rows.push([r.id, new Date(r.at).toISOString()]));
      const csv = rows.map(r => r.map(c => '"'+(String(c).replace(/"/g,'""'))+'"').join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `recent-visits-${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    // Theme toggle (dark mode)
    document.getElementById('toggle-theme').addEventListener('click', function(){
      document.documentElement.classList.toggle('dark');
      if (document.documentElement.classList.contains('dark')) {
        document.body.classList.remove('bg-gray-50'); document.body.classList.add('bg-gray-900','text-gray-100');
      } else {
        document.body.classList.add('bg-gray-50'); document.body.classList.remove('bg-gray-900','text-gray-100');
      }
    });
  });
})();
