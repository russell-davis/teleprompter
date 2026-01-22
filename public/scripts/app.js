let script = null;
let currentIndex = 0;
let focusMode = false;
let editMode = false;
let editingIndex = null; // null = new block, number = editing existing
let selectedType = 'say';
let draggedIndex = null;

const scriptName = window.location.pathname.slice(1);

// ============ LOCAL STORAGE ============
const STORAGE_KEY = 'teleprompter-scripts';

const exampleScript = {
  title: 'Example Script',
  blocks: [
    { type: 'heading', content: 'Introduction' },
    { type: 'prepare', content: 'Have your demo application ready' },
    { type: 'say', content: 'Welcome! Today I\'ll show you how this project works.' },
    { type: 'heading', content: 'Demo' },
    { type: 'click', content: 'Open the application in your browser' },
    { type: 'say', content: 'Here\'s the main interface. Let me walk you through the key features.' },
    { type: 'type', content: 'npm run dev' },
    { type: 'next', content: 'Coming up: We\'ll look at the configuration options' },
    { type: 'heading', content: 'Wrap Up' },
    { type: 'say', content: 'That\'s all for today. Thanks for watching!' },
    { type: 'note', content: 'End recording' }
  ]
};

function getScripts() {
  const data = localStorage.getItem(STORAGE_KEY);
  const scripts = data ? JSON.parse(data) : {};

  // Always ensure example script exists
  if (!scripts['example']) {
    scripts['example'] = exampleScript;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  }

  return scripts;
}

function setScripts(scripts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

// ============ MARKDOWN PARSING ============
function parseMarkdown(text) {
  const blocks = [];
  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Heading: # text
    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'heading', content: trimmed.slice(2) });
    }
    // Click: [click] text
    else if (trimmed.match(/^\[click\]\s*/i)) {
      blocks.push({ type: 'click', content: trimmed.replace(/^\[click\]\s*/i, '') });
    }
    // Type: `code` or ```code```
    else if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
      blocks.push({ type: 'type', content: trimmed.replace(/^`+|`+$/g, '') });
    }
    // Prepare: > prepare: text
    else if (trimmed.match(/^>\s*prepare:/i)) {
      blocks.push({ type: 'prepare', content: trimmed.replace(/^>\s*prepare:\s*/i, '') });
    }
    // Next: >> text
    else if (trimmed.startsWith('>> ')) {
      blocks.push({ type: 'next', content: trimmed.slice(3) });
    }
    // Note: ~ text
    else if (trimmed.startsWith('~ ')) {
      blocks.push({ type: 'note', content: trimmed.slice(2) });
    }
    // Default: say
    else {
      blocks.push({ type: 'say', content: trimmed });
    }
  }

  return blocks;
}

function blocksToMarkdown(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case 'heading': return `# ${block.content}`;
      case 'click': return `[click] ${block.content}`;
      case 'type': return `\`${block.content}\``;
      case 'prepare': return `> prepare: ${block.content}`;
      case 'next': return `>> ${block.content}`;
      case 'note': return `~ ${block.content}`;
      case 'say':
      default: return block.content;
    }
  }).join('\n\n');
}

// ============ EDITOR ============
let editorWS = null;
let previewUpdateTimeout = null;

function loadEditor(name) {
  const scripts = getScripts();
  if (!scripts[name]) {
    window.location.href = '/';
    return;
  }

  // Hide presenter hints in editor view
  document.getElementById('keyboardHints').style.display = 'none';
  document.querySelector('.help-hint').style.display = 'none';

  script = scripts[name];
  document.getElementById('editorTitle').value = script.title || name;
  document.getElementById('scriptEditor').value = blocksToMarkdown(script.blocks);
  updatePreview();
  connectEditorWS(name);

  // Set up live preview on input
  const editor = document.getElementById('scriptEditor');
  editor.addEventListener('input', () => {
    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = setTimeout(() => {
      updatePreview();
      saveEditorContent();
    }, 150);
  });

  // Save title on change
  document.getElementById('editorTitle').addEventListener('input', () => {
    script.title = document.getElementById('editorTitle').value;
    saveEditorContent();
  });
}

function updatePreview() {
  const text = document.getElementById('scriptEditor').value;
  const blocks = parseMarkdown(text);
  const preview = document.getElementById('previewPane');

  preview.innerHTML = blocks.map(block => `
    <div class="block ${block.type}">
      <div class="block-label">${block.type}</div>
      <div class="block-content">${escapeHtml(block.content)}</div>
    </div>
  `).join('');

  // Broadcast to other connected clients
  if (editorWS && editorWS.readyState === WebSocket.OPEN) {
    editorWS.send(JSON.stringify({ type: 'preview', blocks }));
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

function saveEditorContent() {
  const text = document.getElementById('scriptEditor').value;
  script.blocks = parseMarkdown(text);
  script.title = document.getElementById('editorTitle').value;

  const scripts = getScripts();
  scripts[scriptName] = script;
  setScripts(scripts);
}

function connectEditorWS(name) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  editorWS = new WebSocket(`${protocol}//${window.location.host}/api/scripts/${name}/ws`);

  editorWS.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'preview') {
      // Another client updated the preview - could sync here if needed
    }
  };

  editorWS.onclose = () => {
    // Reconnect after a delay
    setTimeout(() => connectEditorWS(name), 2000);
  };
}

function startPresentation() {
  saveEditorContent();
  document.getElementById('editorView').classList.remove('active');
  document.getElementById('teleprompter').classList.add('active');
  document.getElementById('keyboardHints').style.display = '';
  document.querySelector('.help-hint').style.display = '';
  currentIndex = 0;
  loadScript(scriptName);
  // Blur any focused element so keyboard shortcuts work
  if (document.activeElement) document.activeElement.blur();
}

// ============ SCRIPT LIST ============
function loadScriptList() {
  const scripts = getScripts();
  const names = Object.keys(scripts);
  const ul = document.getElementById('scripts');

  if (names.length === 0) {
    ul.innerHTML = '<li class="empty" data-testid="empty-state">No scripts yet. Create one below.</li>';
    return;
  }

  ul.innerHTML = names.map(name =>
    `<li class="script-item">
      <a href="/${name}" data-testid="script-link-${name}">${name}</a>
      <button class="delete-btn" onclick="deleteScript('${name}')" title="Delete script" data-testid="delete-script-${name}">×</button>
    </li>`
  ).join('');
}

function createNewScript() {
  const name = document.getElementById('newScriptName').value.trim();
  if (!name) return;

  const scripts = getScripts();
  scripts[name] = {
    title: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    blocks: [
      { type: 'heading', content: 'Introduction' },
      { type: 'say', content: 'Start writing your script here...' }
    ]
  };
  setScripts(scripts);

  window.location.href = `/${name}`;
}

function deleteScript(name) {
  if (!confirm(`Delete script "${name}"?`)) return;
  const scripts = getScripts();
  delete scripts[name];
  setScripts(scripts);
  loadScriptList();
}

// ============ LOAD SCRIPT ============
function loadScript(name) {
  const scripts = getScripts();
  if (!scripts[name]) {
    window.location.href = '/';
    return;
  }
  script = scripts[name];
  document.getElementById('scriptTitle').textContent = script.title || name;
  renderBlocks();
  setupSSE(name);
}

// ============ RENDER ============
function renderBlocks() {
  const content = document.getElementById('content');
  content.innerHTML = script.blocks.map((block, i) => `
    <div class="block ${block.type} ${i === currentIndex ? 'current' : ''} ${i < currentIndex ? 'past' : ''}"
         data-index="${i}" data-testid="block-${i}" draggable="${editMode}">
      <div class="block-label" data-testid="block-label-${i}">${block.type}</div>
      <div class="block-content" data-testid="block-content-${i}">${escapeHtml(block.content)}</div>
      <div class="block-actions" data-testid="block-actions-${i}">
        <button onclick="editBlock(${i})" title="Edit" data-testid="edit-block-button-${i}">✎</button>
        <button onclick="moveBlock(${i}, -1)" title="Move up" data-testid="move-up-button-${i}">↑</button>
        <button onclick="moveBlock(${i}, 1)" title="Move down" data-testid="move-down-button-${i}">↓</button>
        <button class="delete-btn" onclick="deleteBlock(${i})" title="Delete" data-testid="delete-block-button-${i}">×</button>
      </div>
    </div>
  `).join('');

  if (editMode) {
    setupDragAndDrop();
  }

  updateProgress();
  if (!editMode) scrollToCurrent();
}

function updateProgress() {
  document.getElementById('progress').textContent = `${currentIndex + 1} / ${script.blocks.length}`;
}

function scrollToCurrent() {
  const current = document.querySelector('.block.current');
  if (current) {
    current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ============ NAVIGATION ============
function goTo(index) {
  if (!script) return;
  currentIndex = Math.max(0, Math.min(index, script.blocks.length - 1));
  // Only update blocks in the teleprompter content area, not editor preview
  document.querySelectorAll('#content .block').forEach((el, i) => {
    el.classList.toggle('current', i === currentIndex);
    el.classList.toggle('past', i < currentIndex);
  });
  updateProgress();
  if (!editMode) scrollToCurrent();
}

function next() { goTo(currentIndex + 1); }
function prev() { goTo(currentIndex - 1); }
function reset() { goTo(0); }

// ============ MODES ============
function toggleFocus() {
  if (editMode) return;
  focusMode = !focusMode;
  document.body.classList.toggle('focus-mode', focusMode);
  document.getElementById('focusBtn').classList.toggle('active', focusMode);
}

function toggleEdit() {
  if (focusMode) return;
  editMode = !editMode;
  document.body.classList.toggle('edit-mode', editMode);
  document.getElementById('editBtn').classList.toggle('active', editMode);
  renderBlocks();
}

// ============ EDIT BLOCKS ============
function openModal(title, type = 'say', content = '') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('blockContent').value = content;
  selectedType = type;

  document.querySelectorAll('.type-selector button').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });

  document.getElementById('modalOverlay').classList.add('active');
  document.getElementById('blockContent').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingIndex = null;
}

function editBlock(index) {
  editingIndex = index;
  const block = script.blocks[index];
  openModal('Edit Block', block.type, block.content);
}

function addNewBlock() {
  editingIndex = null;
  openModal('Add Block', 'say', '');
}

function saveBlock() {
  const content = document.getElementById('blockContent').value.trim();
  if (!content) return;

  if (editingIndex !== null) {
    script.blocks[editingIndex] = { type: selectedType, content };
  } else {
    script.blocks.push({ type: selectedType, content });
  }

  saveScript();
  closeModal();
  renderBlocks();
}

function deleteBlock(index) {
  if (!confirm('Delete this block?')) return;
  script.blocks.splice(index, 1);
  if (currentIndex >= script.blocks.length) currentIndex = Math.max(0, script.blocks.length - 1);
  saveScript();
  renderBlocks();
}

function moveBlock(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= script.blocks.length) return;

  const temp = script.blocks[index];
  script.blocks[index] = script.blocks[newIndex];
  script.blocks[newIndex] = temp;

  saveScript();
  renderBlocks();
}

function saveScript() {
  const scripts = getScripts();
  scripts[scriptName] = script;
  setScripts(scripts);
}

// ============ DRAG AND DROP ============
function setupDragAndDrop() {
  const blocks = document.querySelectorAll('.block');

  blocks.forEach(block => {
    block.addEventListener('dragstart', (e) => {
      draggedIndex = parseInt(block.dataset.index);
      block.classList.add('dragging');
    });

    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      document.querySelectorAll('.block').forEach(b => b.classList.remove('drag-over'));
      draggedIndex = null;
    });

    block.addEventListener('dragover', (e) => {
      e.preventDefault();
      const index = parseInt(block.dataset.index);
      if (index !== draggedIndex) {
        block.classList.add('drag-over');
      }
    });

    block.addEventListener('dragleave', () => {
      block.classList.remove('drag-over');
    });

    block.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIndex = parseInt(block.dataset.index);

      if (draggedIndex !== null && draggedIndex !== dropIndex) {
        const [removed] = script.blocks.splice(draggedIndex, 1);
        script.blocks.splice(dropIndex, 0, removed);
        saveScript();
        renderBlocks();
      }
    });
  });
}

// ============ TYPE SELECTOR ============
document.querySelectorAll('.type-selector button').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedType = btn.dataset.type;
    document.querySelectorAll('.type-selector button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// ============ SSE ============
function setupSSE(name) {
  const es = new EventSource(`/api/scripts/${name}/events`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'reload') loadScript(name);
    else if (data.type === 'goto') goTo(data.index);
    else if (data.type === 'next') next();
    else if (data.type === 'prev') prev();
    else if (data.type === 'reset') reset();
    else if (data.type === 'focus' && data.enabled !== focusMode) toggleFocus();
  };
}

// ============ KEYBOARD ============
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Enter' && e.metaKey) saveBlock();
    return;
  }

  switch (e.key) {
    case ' ':
    case 'ArrowDown':
    case 'ArrowRight':
      if (!editMode) { e.preventDefault(); next(); }
      break;
    case 'ArrowUp':
    case 'ArrowLeft':
      if (!editMode) { e.preventDefault(); prev(); }
      break;
    case 'e':
    case 'E':
      toggleEdit();
      break;
    case 'f':
    case 'F':
      toggleFocus();
      break;
    case 'r':
    case 'R':
      reset();
      break;
    case 'Escape':
      closeHelp();
      if (editMode) toggleEdit();
      if (focusMode) toggleFocus();
      break;
    case '?':
      showHelp();
      break;
    case 'Home':
      goTo(0);
      break;
    case 'End':
      goTo(script.blocks.length - 1);
      break;
  }
});

// ============ HELP ============
function showHelp() {
  document.getElementById('helpOverlay').classList.add('active');
}

function closeHelp() {
  document.getElementById('helpOverlay').classList.remove('active');
  localStorage.setItem('teleprompter-help-seen', 'true');
}

// Show help on first visit
if (!localStorage.getItem('teleprompter-help-seen') && scriptName) {
  setTimeout(showHelp, 500);
}

// ============ BUTTON EVENTS ============
document.getElementById('editBtn').addEventListener('click', toggleEdit);
document.getElementById('focusBtn').addEventListener('click', toggleFocus);
document.getElementById('resetBtn').addEventListener('click', reset);
document.getElementById('addBlockBtn').addEventListener('click', addNewBlock);
document.getElementById('helpBtn').addEventListener('click', showHelp);

document.getElementById('helpOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeHelp();
});

document.getElementById('content').addEventListener('click', (e) => {
  if (editMode) return;
  const block = e.target.closest('.block');
  if (block) goTo(parseInt(block.dataset.index));
});

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// Present button
document.getElementById('presentBtn').addEventListener('click', startPresentation);

// ============ INIT ============
if (scriptName && scriptName !== '') {
  document.getElementById('scriptList').style.display = 'none';
  document.getElementById('editorView').classList.add('active');
  loadEditor(scriptName);
} else {
  loadScriptList();
}
