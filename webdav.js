(function() {
  'use strict';

  const WebDAV = {
    config: {
      server: '',
      username: '',
      password: '',
      basePath: ''
    },

    getAuthHeader() {
      const credentials = btoa(this.config.username + ':' + this.config.password);
      return 'Basic ' + credentials;
    },

    setConfig(server, username, password) {
      server = server.replace(/\/$/, '');
      this.config.basePath = server;
      this.config.username = username;
      this.config.password = password;
      
      const urlParts = server.match(/https?:\/\/[^\/]+(\/.*)/);
      if (urlParts && urlParts[1]) {
        this.config.basePath = 'https://' + server.replace(/https?:\/\/[^\/]+/, '').replace(/^\//, '') || 'dav.jianguoyun.com/dav';
      }
      this.config.server = server;
    },

    getBaseUrl() {
      return this.config.server;
    },

    async createFolder(folderName) {
      const url = this.config.server.replace(/\/$/, '') + '/' + folderName;
      console.log('Creating folder:', url);
      try {
        const response = await fetch(url, {
          method: 'MKCOL',
          headers: {
            'Authorization': this.getAuthHeader()
          }
        });
        console.log('MKCOL response:', response.status);
        return response.ok || response.status === 201;
      } catch (e) {
        console.error('MKCOL error:', e);
        return false;
      }
    },

    async ensureFolderExists(folderName) {
      const baseUrl = this.config.server.replace(/\/$/, '');
      const encodedFolder = encodeURIComponent(folderName);
      const folderUrl = baseUrl + '/' + encodedFolder;
      console.log('Creating folder:', folderUrl);
      
      try {
        const response = await fetch(folderUrl, {
          method: 'MKCOL',
          headers: {
            'Authorization': this.getAuthHeader()
          }
        });
        console.log('MKCOL response:', response.status, response.ok);
        
        if (response.ok || response.status === 201) {
          this.config.server = folderUrl;
          console.log('Server URL updated to:', this.config.server);
          return true;
        } else {
          console.log('MKCOL failed, keeping original URL');
          return false;
        }
      } catch (e) {
        console.error('ensureFolderExists error:', e);
        return false;
      }
    },

    async testConnection() {
      console.log('testConnection - server:', this.config.server);
      try {
        const response = await fetch(this.config.server, {
          method: 'PROPFIND',
          headers: {
            'Authorization': this.getAuthHeader(),
            'Depth': '0'
          },
          body: '<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>'
        });
        console.log('testConnection response:', response.status);
        return response.ok || response.status === 207;
      } catch (e) {
        console.error('WebDAV connection test failed:', e);
        return false;
      }
    },

    async listFiles() {
      console.log('listFiles - config.server:', this.config.server);
      const response = await fetch(this.config.server, {
        method: 'PROPFIND',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Depth': '1'
        },
        body: '<?xml version="1.0" encoding="utf-8" ?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getlastmodified/><d:getcontentlength/></d:prop></d:propfind>'
      });
      
      console.log('listFiles response status:', response.status);
      
      if (!response.ok && response.status !== 207) {
        throw new Error('无法获取文件列表: ' + response.status);
      }

      const text = await response.text();
      console.log('listFiles raw response:', text.substring(0, 500));
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'application/xml');
      
      const files = [];
      const responses = doc.getElementsByTagName('d:response');
      console.log('Number of responses:', responses.length);
      
      for (let i = 0; i < responses.length; i++) {
        const href = responses[i].getElementsByTagName('d:href')[0]?.textContent;
        const displayname = responses[i].getElementsByTagName('d:displayname')[0]?.textContent;
        const lastmodified = responses[i].getElementsByTagName('d:getlastmodified')[0]?.textContent;
        
        console.log('Found item:', { href, displayname, lastmodified });
        
        if (href && displayname && displayname.endsWith('.json')) {
          files.push({
            name: displayname,
            path: href,
            modified: lastmodified ? new Date(lastmodified).toLocaleString() : ''
          });
        }
      }

      return files.sort((a, b) => b.modified.localeCompare(a.modified));
    },

    async uploadFile(fileName, content) {
      const url = this.config.server.replace(/\/$/, '') + '/' + fileName;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: content
      });
      
      if (!response.ok) {
        throw new Error('上传失败: ' + response.status);
      }
      
      return true;
    },

    async downloadFile(fileName) {
      const url = this.config.server.replace(/\/$/, '') + '/' + fileName;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': this.getAuthHeader()
        }
      });
      
      if (!response.ok) {
        throw new Error('下载失败: ' + response.status);
      }
      
      return await response.json();
    },

    async deleteFile(fileName) {
      const url = this.config.server.replace(/\/$/, '') + '/' + fileName;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader()
        }
      });
      
      if (!response.ok) {
        throw new Error('删除失败: ' + response.status);
      }
      
      return true;
    },

    getConfig() {
      return this.config;
    },

    getServer() {
      return this.config.server;
    }
  };

  window.WebDAV = WebDAV;
})();
