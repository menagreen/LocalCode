(function () {
  // DOM Elements
  const statusBadge = document.getElementById('connection-status');
  const statusText = statusBadge.querySelector('.status-text');
  const clientsBadge = document.getElementById('clients-count');
  const langSelect = document.getElementById('lang-select');
  const statsInfo = document.getElementById('stats-info');
  const btnClear = document.getElementById('btn-clear');
  const btnPaste = document.getElementById('btn-paste');
  const btnCopy = document.getElementById('btn-copy');
  const copyText = document.getElementById('copy-text');
  const toast = document.getElementById('toast');

  // Initialize CodeMirror
  const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
    lineNumbers: true,
    theme: 'dracula',
    mode: 'javascript',
    styleActiveLine: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentWithTabs: false,
    lineWrapping: true
  });

  // State
  let ws = null;
  let isRemoteUpdate = false;
  let debounceTimer = null;
  let reconnectAttempts = 0;
  let toastTimer = null;

  function showToast(message, type = 'info') {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    toastTimer = setTimeout(() => {
      toast.className = 'toast';
    }, 2500);
  }

  function updateStats() {
    const text = editor.getValue();
    const lines = editor.lineCount();
    const chars = text.length;
    statsInfo.textContent = `${lines} ${lines === 1 ? 'línea' : 'líneas'}, ${chars} caracteres`;
  }

  function setLanguage(mode, sendUpdate = true) {
    if (langSelect.value !== mode) {
      langSelect.value = mode;
    }
    const cmMode = mode === 'null' ? null : mode;
    editor.setOption('mode', cmMode);

    if (sendUpdate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'language',
        language: mode
      }));
    }
  }

  // WebSocket Connection
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    statusBadge.className = 'status-badge disconnected';
    statusText.textContent = 'Conectando...';

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      statusBadge.className = 'status-badge connected';
      statusText.textContent = 'En línea';
      reconnectAttempts = 0;
      showToast('Conectado al servidor en tiempo real', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'init') {
          isRemoteUpdate = true;
          editor.setValue(msg.content || '');
          if (msg.language) setLanguage(msg.language, false);
          isRemoteUpdate = false;
          updateStats();
          if (typeof msg.clientCount === 'number') {
            clientsBadge.textContent = `${msg.clientCount} online`;
          }
        } else if (msg.type === 'update') {
          if (msg.content !== editor.getValue()) {
            isRemoteUpdate = true;
            const cursor = editor.getCursor();
            const scrollInfo = editor.getScrollInfo();

            editor.setValue(msg.content);

            editor.scrollTo(scrollInfo.left, scrollInfo.top);
            try {
              editor.setCursor(cursor);
            } catch (e) {
              // Cursor might be out of range if content shortened
            }
            isRemoteUpdate = false;
            updateStats();
          }
          if (msg.language && msg.language !== langSelect.value) {
            setLanguage(msg.language, false);
          }
        } else if (msg.type === 'language') {
          if (msg.language && msg.language !== langSelect.value) {
            setLanguage(msg.language, false);
          }
        } else if (msg.type === 'clients') {
          if (typeof msg.count === 'number') {
            clientsBadge.textContent = `${msg.count} online`;
          }
        }
      } catch (err) {
        console.error('Error procesando mensaje WS:', err);
      }
    };

    ws.onclose = () => {
      statusBadge.className = 'status-badge disconnected';
      statusText.textContent = 'Desconectado';
      clientsBadge.textContent = '0 online';

      // Reconnection with backoff (max 5s)
      reconnectAttempts++;
      const delay = Math.min(1000 * reconnectAttempts, 5000);
      setTimeout(connectWebSocket, delay);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket error:', err);
      ws.close();
    };
  }

  // CodeMirror Change Event
  editor.on('change', (cm, changeObj) => {
    updateStats();

    if (isRemoteUpdate) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update',
          content: editor.getValue(),
          language: langSelect.value
        }));
      }
    }, 120);
  });

  // Language Change Listener
  langSelect.addEventListener('change', () => {
    setLanguage(langSelect.value, true);
  });

  // Action: Clear
  btnClear.addEventListener('click', () => {
    if (editor.getValue().length === 0) return;
    editor.setValue('');
    editor.focus();
    showToast('Portapapeles limpiado', 'info');
  });

  // Robust Copy function (supports HTTP on LAN without secure context restriction)
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        document.body.removeChild(textarea);
        reject(err);
      }
    });
  }

  // Action: Copy
  btnCopy.addEventListener('click', async () => {
    const text = editor.getValue();
    if (!text) {
      showToast('No hay nada para copiar', 'error');
      return;
    }

    try {
      await copyToClipboard(text);
      btnCopy.classList.add('copied');
      copyText.textContent = '¡Copiado!';
      showToast('¡Copiado al portapapeles del sistema!', 'success');

      setTimeout(() => {
        btnCopy.classList.remove('copied');
        copyText.textContent = 'Copiar';
      }, 1500);
    } catch (err) {
      console.error('Copy failed:', err);
      showToast('Error al copiar: ' + err.message, 'error');
    }
  });

  // Action: Paste
  btnPaste.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          editor.setValue(text);
          editor.focus();
          showToast('Contenido pegado desde el portapapeles', 'success');
          return;
        }
      }
      showToast('Usa Ctrl+V directamente en el editor', 'info');
      editor.focus();
    } catch (err) {
      showToast('Permiso de portapapeles bloqueado. Usa Ctrl+V', 'info');
      editor.focus();
    }
  });

  // Keyboard shortcut Ctrl+Shift+C / Cmd+Shift+C to copy
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      btnCopy.click();
    }
  });

  // Initialize
  connectWebSocket();
  updateStats();
  editor.focus();
})();
