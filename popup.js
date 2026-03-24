(function() {
  'use strict';

  let extensions = [];
  let isSelectAll = false;
  let isWebDAVConnected = false;

  const elements = {};

  function getElement(id) {
    return document.getElementById(id);
  }

  function init() {
    try {
      elements.btnGetExtensions = getElement('btn-get-extensions');
      elements.btnExport = getElement('btn-export');
      elements.btnImport = getElement('btn-import');
      elements.fileImport = getElement('file-import');
      elements.webdavSetup = getElement('webdav-setup');
      elements.webdavServer = getElement('webdav-server');
      elements.webdavUsername = getElement('webdav-username');
      elements.webdavPassword = getElement('webdav-password');
      elements.btnSaveWebdav = getElement('btn-save-webdav');
      elements.webdavConnected = getElement('webdav-connected');
      elements.webdavStatus = getElement('webdav-status');
      elements.btnWebdavEdit = getElement('btn-webdav-edit');
      elements.btnWebdavReset = getElement('btn-webdav-reset');
      elements.btnWebdavBackup = getElement('btn-webdav-backup');
      elements.btnWebdavRestore = getElement('btn-webdav-restore');
      elements.webdavBackupList = getElement('webdav-backup-list');
      elements.backupFiles = getElement('backup-files');
      elements.extensionList = getElement('extension-list');
      elements.extensionCount = getElement('extension-count');
      elements.btnSelectAll = getElement('btn-select-all');
      elements.btnInstallSelected = getElement('btn-install-selected');
      elements.selectedCount = getElement('selected-count');
      elements.message = getElement('message');

      for (const key in elements) {
        if (!elements[key]) {
          console.error('Missing element:', key);
          return;
        }
      }
      elements.btnGetExtensions.addEventListener('click', getInstalledExtensions);
      elements.btnExport.addEventListener('click', exportExtensions);
      elements.btnImport.addEventListener('click', () => elements.fileImport.click());
      elements.fileImport.addEventListener('change', importExtensions);
      elements.btnSaveWebdav.addEventListener('click', saveWebdavConfig);
      elements.btnWebdavEdit.addEventListener('click', editWebdavConfig);
      elements.btnWebdavReset.addEventListener('click', resetWebdavConfig);
      elements.btnWebdavBackup.addEventListener('click', webdavBackup);
      elements.btnWebdavRestore.addEventListener('click', webdavRestore);
      elements.btnSelectAll.addEventListener('click', toggleSelectAll);
      elements.btnInstallSelected.addEventListener('click', installSelectedExtensions);

      loadWebdavConfig();
    } catch (error) {
      console.error('Init error:', error);
    }
  }

  async function loadWebdavConfig() {
    try {
      if (!elements.webdavServer) return;
      
      const result = await chrome.storage.local.get('webdav_config');
      
      if (result.webdav_config) {
        let config;
        try {
          config = JSON.parse(result.webdav_config);
        } catch (e) {
          await chrome.storage.local.remove('webdav_config');
          return;
        }
        
        if (!config.server || !config.username || !config.password) {
          await chrome.storage.local.remove('webdav_config');
          return;
        }
        
        window.WebDAV.setConfig(config.server, config.username, config.password);
        elements.webdavServer.value = extractBaseServer(config.server);
        elements.webdavUsername.value = config.username;
        elements.webdavPassword.value = config.password;
        
        const isConnected = await testWebdavConnection();
        if (isConnected) {
          showWebdavConnected();
        }
      }
    } catch (error) {
      console.error('加载WebDAV配置失败:', error);
    }
  }

  function extractBaseServer(fullServer) {
    const match = fullServer.match(/(https?:\/\/[^\/]+\/dav\/?)/i);
    if (match) {
      let base = match[1];
      if (!base.endsWith('/')) {
        base += '/';
      }
      return base;
    }
    return fullServer;
  }

  async function saveWebdavConfig() {
    const server = elements.webdavServer.value.trim();
    const username = elements.webdavUsername.value.trim();
    const password = elements.webdavPassword.value;

    if (!server || !username || !password) {
      showMessage('请填写完整的WebDAV配置', 'error');
      return;
    }

    try {
      elements.btnSaveWebdav.disabled = true;
      showMessage('正在测试连接...', 'info');

      window.WebDAV.setConfig(server, username, password);
      const isConnected = await window.WebDAV.testConnection();
      console.log('WebDAV connection test:', isConnected);

      if (!isConnected) {
        showMessage('连接失败，请检查配置', 'error');
        elements.btnSaveWebdav.disabled = false;
        return;
      }

      showMessage('正在测试连接并创建文件夹...', 'info');
      await window.WebDAV.testConnection();
      
      const folderUrl = server.replace(/\/$/, '') + '/extbackup/';
      console.log('Using folder URL:', folderUrl);
      window.WebDAV.setConfig(folderUrl, username, password);

      const configToSave = { server: folderUrl, username, password };
      console.log('Config to save:', JSON.stringify(configToSave));
      
      await chrome.storage.local.set({ webdav_config: JSON.stringify(configToSave) });

      showWebdavConnected();
      showMessage('WebDAV配置成功!', 'success');
    } catch (error) {
      console.error('WebDAV配置失败:', error);
      showMessage('配置失败: ' + error.message, 'error');
    } finally {
      elements.btnSaveWebdav.disabled = false;
    }
  }

  async function testWebdavConnection() {
    try {
      return await window.WebDAV.testConnection();
    } catch (e) {
      console.error('testWebdavConnection error:', e);
      return false;
    }
  }

  function showWebdavConnected() {
    try {
      isWebDAVConnected = true;
      elements.webdavSetup.style.display = 'none';
      elements.webdavConnected.style.display = 'block';
      elements.webdavStatus.textContent = '✅ 已连接到WebDAV';
      elements.webdavStatus.className = 'webdav-status success';
      elements.btnWebdavBackup.disabled = extensions.length === 0;
      elements.btnWebdavRestore.disabled = false;
    } catch (error) {
      console.error('showWebdavConnected error:', error);
    }
  }

  function editWebdavConfig() {
    try {
      isWebDAVConnected = false;
      elements.webdavSetup.style.display = 'block';
      elements.webdavConnected.style.display = 'none';
      elements.webdavBackupList.style.display = 'none';
    } catch (error) {
      console.error('editWebdavConfig error:', error);
    }
  }

  async function resetWebdavConfig() {
    if (!confirm('确定要清除所有WebDAV配置吗？')) {
      return;
    }
    try {
      await chrome.storage.local.remove('webdav_config');
      isWebDAVConnected = false;
      elements.webdavSetup.style.display = 'block';
      elements.webdavConnected.style.display = 'none';
      elements.webdavBackupList.style.display = 'none';
      elements.webdavServer.value = '';
      elements.webdavUsername.value = '';
      elements.webdavPassword.value = '';
      showMessage('配置已清除', 'info');
    } catch (error) {
      console.error('resetWebdavConfig error:', error);
      showMessage('清除配置失败', 'error');
    }
  }

  function showMessage(text, type = 'info') {
    try {
      elements.message.textContent = text;
      elements.message.className = `message ${type} show`;
      setTimeout(() => {
        elements.message.classList.remove('show');
      }, 3000);
    } catch (error) {
      console.error('showMessage error:', error);
    }
  }

  async function getInstalledExtensions() {
    try {
      showMessage('正在获取已安装扩展...', 'info');
      const allApps = await chrome.management.getAll();
      
      extensions = allApps
        .filter(app => app.type === 'extension' && !app.isApp)
        .map(app => ({
          id: app.id,
          name: app.name,
          version: app.version,
          enabled: app.enabled,
          icons: app.icons && app.icons.length > 0 ? app.icons : [{ size: 32, url: '' }],
          webStoreUrl: `https://chrome.google.com/webstore/detail/${encodeURIComponent(app.name)}/${app.id}`
        }));

      renderExtensionList();
      enableActions();
      showMessage(`已获取 ${extensions.length} 个扩展`, 'success');
    } catch (error) {
      console.error('获取扩展失败:', error);
      showMessage('获取扩展失败: ' + error.message, 'error');
    }
  }

  function renderExtensionList() {
    if (extensions.length === 0) {
      elements.extensionList.innerHTML = `
        <div class="empty-state">
          <p>暂无扩展信息</p>
        </div>
      `;
      elements.extensionCount.textContent = '(0)';
      return;
    }

    elements.extensionList.innerHTML = extensions.map((ext, index) => `
      <div class="extension-item" data-index="${index}">
        <input type="checkbox" id="ext-${index}" checked>
        <img class="extension-icon" src="${ext.icons[0]?.url || ''}" alt="${ext.name}" data-default="true">
        <div class="extension-info">
          <div class="extension-name" title="${ext.name}">${ext.name}</div>
          <div class="extension-meta">v${ext.version}</div>
        </div>
      </div>
    `).join('');

    elements.extensionCount.textContent = `(${extensions.length})`;

    document.querySelectorAll('.extension-item input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', updateSelectedCount);
    });

    document.querySelectorAll('.extension-icon').forEach(img => {
      if (!img.src || img.src === '' || img.dataset.default === 'true') {
        img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect fill="#f1f3f4" width="32" height="32"/><text x="16" y="20" text-anchor="middle" fill="#5f6368" font-size="12">E</text></svg>');
      }
      img.onerror = function() {
        this.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect fill="#f1f3f4" width="32" height="32"/><text x="16" y="20" text-anchor="middle" fill="#5f6368" font-size="12">E</text></svg>');
      };
    });

    updateSelectedCount();
  }

  function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.extension-item input[type="checkbox"]:checked');
    const count = checkboxes.length;
    elements.selectedCount.textContent = count;
    elements.btnInstallSelected.disabled = count === 0;
    elements.btnSelectAll.textContent = count === extensions.length ? '取消全选' : '全选';
  }

  function toggleSelectAll() {
    isSelectAll = !isSelectAll;
    const checkboxes = document.querySelectorAll('.extension-item input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = isSelectAll);
    updateSelectedCount();
    elements.btnSelectAll.textContent = isSelectAll ? '取消全选' : '全选';
  }

  function getSelectedExtensions() {
    const checkboxes = document.querySelectorAll('.extension-item input[type="checkbox"]:checked');
    const selected = [];
    checkboxes.forEach((cb, index) => {
      if (cb.checked && extensions[index]) {
        selected.push(extensions[index]);
      }
    });
    return selected;
  }

  function enableActions() {
    elements.btnExport.disabled = extensions.length === 0;
    elements.btnWebdavBackup.disabled = extensions.length === 0 || !isWebDAVConnected;
    elements.btnSelectAll.disabled = extensions.length === 0;
  }

  function exportExtensions() {
    if (extensions.length === 0) {
      showMessage('没有可导出的扩展', 'error');
      return;
    }

    const exportData = {
      exportTime: new Date().toISOString(),
      version: '1.0',
      extensions: extensions.map(ext => ({
        id: ext.id,
        name: ext.name,
        version: ext.version,
        webStoreUrl: ext.webStoreUrl
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `extensions_backup_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('导出成功!', 'success');
  }

  function importExtensions(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        
        if (!data.extensions || !Array.isArray(data.extensions)) {
          throw new Error('无效的文件格式');
        }

        extensions = data.extensions.map(ext => ({
          id: ext.id || '',
          name: ext.name || 'Unknown',
          version: ext.version || '1.0',
          enabled: true,
          icons: [{ size: 32, url: '' }],
          webStoreUrl: ext.webStoreUrl || `https://chrome.google.com/webstore/detail/${encodeURIComponent(ext.name)}/${ext.id}`
        }));

        renderExtensionList();
        enableActions();
        showMessage(`成功导入 ${extensions.length} 个扩展`, 'success');
      } catch (error) {
        console.error('导入失败:', error);
        showMessage('导入失败: ' + error.message, 'error');
      }
    };
    reader.onerror = function() {
      showMessage('读取文件失败', 'error');
    };
    reader.readAsText(file);
    
    event.target.value = '';
  }

  async function installSelectedExtensions() {
    const selected = getSelectedExtensions();
    if (selected.length === 0) {
      showMessage('请选择要安装的扩展', 'error');
      return;
    }

    showMessage(`正在打开 ${selected.length} 个安装页面...`, 'info');

    for (let i = 0; i < selected.length; i++) {
      const ext = selected[i];
      try {
        await chrome.tabs.create({ url: ext.webStoreUrl, active: false });
      } catch (error) {
        console.error('打开标签页失败:', error);
      }
    }

    showMessage(`已打开 ${selected.length} 个安装页面，请在页面中点击"添加至Chrome"完成安装`, 'success');
  }

  async function webdavBackup() {
    if (extensions.length === 0) {
      showMessage('没有可备份的扩展', 'error');
      return;
    }

    try {
      elements.btnWebdavBackup.disabled = true;
      showMessage('正在备份到云端...', 'info');
      
      const backupData = {
        exportTime: new Date().toISOString(),
        version: '1.0',
        extensions: extensions.map(ext => ({
          id: ext.id,
          name: ext.name,
          version: ext.version,
          webStoreUrl: ext.webStoreUrl
        }))
      };
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `backup_${timestamp}.json`;
      console.log('Uploading to:', window.WebDAV.getConfig().server, 'filename:', fileName);
      
      await window.WebDAV.uploadFile(fileName, JSON.stringify(backupData, null, 2));
      
      showMessage('备份成功!', 'success');
    } catch (error) {
      console.error('备份失败:', error);
      showMessage('备份失败: ' + error.message, 'error');
    } finally {
      elements.btnWebdavBackup.disabled = false;
    }
  }

  async function webdavRestore() {
    try {
      elements.btnWebdavRestore.disabled = true;
      showMessage('正在获取最新备份...', 'info');
      
      const files = await window.WebDAV.listFiles();
      console.log('Retrieved files:', files);
      
      if (!files || files.length === 0) {
        showMessage('云端没有找到备份文件', 'info');
        elements.btnWebdavRestore.disabled = false;
        return;
      }

      const latestFile = files[0];
      console.log('Restoring from:', latestFile);
      
      await restoreFromWebdav(latestFile.path);
      showMessage('恢复成功!', 'success');
    } catch (error) {
      console.error('获取备份失败:', error);
      showMessage('恢复失败: ' + error.message, 'error');
      elements.btnWebdavRestore.disabled = false;
    }
  }

  function renderBackupList(files) {
    console.log('renderBackupList not used anymore');
    return;
  }

  async function restoreFromWebdav(filePath) {
    try {
      showMessage('正在从云端恢复...', 'info');
      
      const fileName = filePath.split('/').pop();
      const data = await window.WebDAV.downloadFile(fileName);
      
      if (!data.extensions || !Array.isArray(data.extensions)) {
        throw new Error('备份文件格式无效');
      }

      extensions = data.extensions.map(ext => ({
        id: ext.id || '',
        name: ext.name || 'Unknown',
        version: ext.version || '1.0',
        enabled: true,
        icons: [{ size: 32, url: '' }],
        webStoreUrl: ext.webStoreUrl || `https://chrome.google.com/webstore/detail/${encodeURIComponent(ext.name)}/${ext.id}`
      }));

      renderExtensionList();
      enableActions();
      showMessage(`从云端成功恢复 ${extensions.length} 个扩展`, 'success');
    } catch (error) {
      console.error('恢复失败:', error);
      showMessage('恢复失败: ' + error.message, 'error');
    }
  }

  async function deleteFromWebdav(filePath) {
    if (!confirm('确定要删除这个备份文件吗？')) {
      return;
    }

    try {
      const fileName = filePath.split('/').pop();
      await window.WebDAV.deleteFile(fileName);
      showMessage('备份文件已删除', 'success');
      await webdavRestore();
    } catch (error) {
      console.error('删除失败:', error);
      showMessage('删除失败: ' + error.message, 'error');
    }
  }

  async function loadBackupList() {
    if (!isWebDAVConnected) return;
    
    try {
      const files = await window.WebDAV.listFiles();
      if (files.length > 0) {
        renderBackupList(files);
      }
    } catch (error) {
      console.error('加载备份列表失败:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      init();
    } catch (error) {
      console.error('DOMContentLoaded error:', error);
    }
  });
})();
