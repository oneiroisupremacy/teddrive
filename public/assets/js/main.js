// TEDDRIVE Main Application JavaScript
// Complete and organized code for the main application

// === GLOBAL VARIABLES ===
let files = [];
let folders = [];
let currentFolder = null;
let currentFilter = 'all';
let selectedFile = null;
let cryptoKey = null;
let useDatabase = true;
let supabaseClient = null;

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', function() {
    console.log('TEDDRIVE initializing...');
    initSupabase().then(() => {
        console.log('[INIT] Supabase initialization complete, loading data...');
        loadData();
    });
});

// === SUPABASE INITIALIZATION ===
async function initSupabase() {
    if (typeof window !== 'undefined') {
        try {
            let supabaseUrl = window.SUPABASE_URL;
            let supabaseKey = window.SUPABASE_ANON_KEY;
            
            if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co') {
                try {
                    const configResponse = await fetch('/api/config');
                    if (configResponse.ok) {
                        const config = await configResponse.json();
                        supabaseUrl = config.supabaseUrl;
                        supabaseKey = config.supabaseAnonKey;
                    }
                } catch (configError) {
                    console.warn('Failed to fetch config from API:', configError);
                }
            }
            
            if (!supabaseUrl || supabaseUrl === 'https://your-project.supabase.co') {
                console.warn('[WARNING] Supabase config not found. Database features disabled.');
                useDatabase = false;
                return;
            }
            
            supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
            await createTablesIfNeeded();
            useDatabase = true;
            console.log('[SUPABASE] Database initialized successfully');
            
        } catch (error) {
            console.warn('Supabase initialization failed:', error);
            useDatabase = false;
        }
    } else {
        useDatabase = false;
    }
}

async function createTablesIfNeeded() {
    try {
        console.log('[DEBUG] Testing Supabase connection...');
        console.log('[DEBUG] Supabase URL:', supabaseClient.supabaseUrl);
        console.log('[DEBUG] Anon Key (first 20 chars):', supabaseClient.supabaseKey.substring(0, 20) + '...');
        
        const { data: testFiles, error: filesError } = await supabaseClient.from('files').select('id').limit(1);
        const { data: testFolders, error: foldersError } = await supabaseClient.from('folders').select('id').limit(1);
        
        if (filesError) {
            console.error('[DEBUG] Files table error:', filesError);
            console.error('[DEBUG] Error code:', filesError.code);
            console.error('[DEBUG] Error message:', filesError.message);
            console.error('[DEBUG] Error details:', filesError.details);
        }
        if (foldersError) {
            console.error('[DEBUG] Folders table error:', foldersError);
            console.error('[DEBUG] Error code:', foldersError.code);
            console.error('[DEBUG] Error message:', foldersError.message);
            console.error('[DEBUG] Error details:', foldersError.details);
        }
        
        if (filesError && filesError.code === '42P01') {
            // Table doesn't exist
            console.log('Creating Supabase tables...');
            alert(`Supabase tables need to be created. Please run this SQL in your Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS folders (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id VARCHAR(50),
    created VARCHAR(50) NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    share_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    size BIGINT NOT NULL,
    type VARCHAR(50) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    date VARCHAR(50) NOT NULL,
    folder_id VARCHAR(50),
    meta_key TEXT NOT NULL,
    meta_links TEXT NOT NULL,
    meta_provider VARCHAR(20) NOT NULL,
    is_public BOOLEAN DEFAULT TRUE,
    share_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- IMPORTANT: Disable RLS and grant permissions
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.files TO anon, authenticated;
GRANT ALL ON public.folders TO anon, authenticated;`);
            useDatabase = false;
            return;
        }
        
        if (filesError && filesError.code === 'PGRST116') {
            // Authentication error
            console.error('[ERROR] Supabase authentication failed. Check your SUPABASE_ANON_KEY');
            alert('Supabase authentication failed. Please check your SUPABASE_ANON_KEY in environment variables.');
            useDatabase = false;
            return;
        }
        
        console.log('Supabase tables already exist');
    } catch (error) {
        console.error('[ERROR] Supabase connection failed:', error);
        useDatabase = false;
    }
}

// === DATA LOADING ===
async function loadData() {
    const grid = document.getElementById('fileGrid');
    if (grid) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:40px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    }
    
    if (useDatabase && supabaseClient) {
        try {
            files = [];
            folders = [];
            // Wait for both database operations to complete
            await Promise.all([loadFilesFromDB(), loadFoldersFromDB()]);
            localStorage.setItem('ois_files', JSON.stringify(files));
            localStorage.setItem('ois_folders', JSON.stringify(folders));
        } catch (error) {
            console.warn('Database failed, falling back to localStorage:', error);
            useDatabase = false;
            loadFromLocalStorage();
        }
    } else {
        loadFromLocalStorage();
    }
    
    renderGrid();
    updateUsedSpace();
    // Update breadcrumb after all data is loaded
    updateBreadcrumb();
}

async function forceRefresh() {
    console.log('[REFRESH] Force refreshing from database...');
    localStorage.removeItem('ois_files');
    localStorage.removeItem('ois_folders');
    
    // Ensure supabase is initialized before loading data
    if (!supabaseClient && useDatabase) {
        await initSupabase();
    }
    
    await loadData();
    alert('Data refreshed from database!');
}

function loadFromLocalStorage() {
    files = JSON.parse(localStorage.getItem('ois_files')) || [];
    folders = JSON.parse(localStorage.getItem('ois_folders')) || [];
}

async function loadFilesFromDB() {
    if (!supabaseClient) {
        console.warn('[DB] Supabase client not available, using localStorage');
        throw new Error('Supabase not initialized');
    }
    
    console.log('[DB] Loading files from database...');
    
    let query = supabaseClient.from('files').select('*');
    
    if (currentFolder) {
        query = query.eq('folder_id', currentFolder);
    } else {
        if (currentFilter === 'dashboard' || currentFilter === 'recent' || 
            currentFilter === 'video' || currentFilter === 'image' || 
            currentFilter === 'audio' || currentFilter === 'other') {
            // Load ALL files for these views
        } else {
            query = query.is('folder_id', null);
        }
    }
    
    query = query.order('created_at', { ascending: false });
    
    if (currentFilter === 'dashboard') {
        query = query.limit(50);
    } else if (currentFilter === 'recent') {
        query = query.limit(20);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('[DB] Query error:', error);
        console.error('[DB] Error code:', error.code);
        console.error('[DB] Error message:', error.message);
        console.error('[DB] Error details:', error.details);
        throw error;
    }
    
    files = data.map(f => {
        try {
            return {
                id: f.id,
                name: f.name,
                size: f.size,
                type: f.type,
                mime: f.mime,
                date: f.date,
                folderId: f.folder_id,
                meta: {
                    key: f.meta_key,
                    links: JSON.parse(f.meta_links || '[]'),
                    provider: f.meta_provider
                },
                isPublic: f.is_public || false,
                shareId: f.share_id || null
            };
        } catch (parseError) {
            console.warn('Failed to parse file:', f.id, parseError);
            return null;
        }
    }).filter(f => f !== null);
    
    console.log('[DB] Loaded', files.length, 'files');
}

async function loadFoldersFromDB() {
    if (!supabaseClient) {
        console.warn('[DB] Supabase client not available, using localStorage');
        throw new Error('Supabase not initialized');
    }
    
    console.log('[DB] Loading folders from database...');
    
    // Load ALL folders for breadcrumb functionality
    let query = supabaseClient.from('folders').select('*').order('created_at', { ascending: false });
    
    const { data, error } = await query;
    
    if (error) {
        console.error('[DB] Folders query error:', error);
        console.error('[DB] Error code:', error.code);
        console.error('[DB] Error message:', error.message);
        console.error('[DB] Error details:', error.details);
        throw error;
    }
    
    // Store all folders globally
    const allFolders = data.map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        created: f.created,
        shareId: f.share_id || null,
        isPublic: f.is_public || false
    }));
    
    // Set global folders array to all folders
    folders = allFolders;
    
    console.log('[DB] Loaded', folders.length, 'total folders');
}

// === VIEW SWITCHING ===

// === RENDERING ===
function renderGrid() {
    const grid = document.getElementById('fileGrid');
    grid.innerHTML = '';
    if (currentFilter === 'dashboard' || currentFilter === 'recent') return;

    // For category views, show ALL files of that type from ALL folders
    if (currentFilter === 'video' || currentFilter === 'image' || currentFilter === 'audio' || currentFilter === 'other') {
        const filtered = files.filter(f => f.type === currentFilter);
        
        if (filtered.length === 0) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No files.</div>';
            return;
        }
        
        filtered.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-card';
            div.innerHTML = `
                <div class="preview">${getIconHTML(f.type)}</div>
                <div class="info">
                    <div class="name" title="${f.name}">${f.name}</div>
                    <div class="meta">
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                            <span>${formatSize(f.size)}</span>
                            <span>${f.date}</span>
                        </div>
                        <div class="meta-detail">
                            <span class="file-type">${f.mime}</span>
                            ${getProviderIcon(f.meta.provider)}
                        </div>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn-card btn-download" onclick="downloadFile('${f.id}')" title="Download"><i class="fa-solid fa-download"></i></button>
                    <button class="btn-card btn-share" onclick="shareFile('${f.id}')" title="Share"><i class="fa-solid fa-share"></i></button>
                    <button class="btn-card btn-delete" onclick="deleteFile('${f.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            grid.appendChild(div);
        });
        return;
    }

    // For "My Files" view, show files and folders based on current folder
    const currentFiles = files.filter(f => f.folderId === currentFolder);
    // Filter folders to show only children of current folder
    const currentFolders = folders.filter(f => f.parentId === currentFolder);
    
    const filtered = currentFilter === 'all' ? currentFiles : currentFiles.filter(f => f.type === currentFilter);
    
    // Show folders first (only in 'all' view)
    if (currentFilter === 'all') {
        currentFolders.forEach(folder => {
            const div = document.createElement('div');
            div.className = 'file-card folder-card';
            div.innerHTML = `
                <div class="preview"><i class="fa-solid fa-folder" style="color: #fbbf24; font-size: 3rem;"></i></div>
                <div class="info">
                    <div class="name" title="${folder.name}">${folder.name}</div>
                    <div class="meta">
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                            <span>Folder</span>
                            <span>${folder.created}</span>
                        </div>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn-card btn-open" onclick="openFolder('${folder.id}')" title="Open"><i class="fa-solid fa-folder-open"></i></button>
                    <button class="btn-card btn-delete" onclick="deleteFolder('${folder.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            div.ondblclick = () => openFolder(folder.id);
            grid.appendChild(div);
        });
    }

    // Show files
    if (filtered.length === 0 && (currentFilter !== 'all' || currentFolders.length === 0)) { 
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No files.</div>'; 
        return; 
    }

    filtered.forEach(f => {
        const div = document.createElement('div');
        div.className = 'file-card';
        div.innerHTML = `
            <div class="preview">${getIconHTML(f.type)}</div>
            <div class="info">
                <div class="name" title="${f.name}">${f.name}</div>
                <div class="meta">
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>${formatSize(f.size)}</span>
                        <span>${f.date}</span>
                    </div>
                    <div class="meta-detail">
                        <span class="file-type">${f.mime}</span>
                        ${getProviderIcon(f.meta.provider)}
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="btn-card btn-download" onclick="downloadFile('${f.id}')" title="Download"><i class="fa-solid fa-download"></i></button>
                <button class="btn-card btn-share" onclick="shareFile('${f.id}')" title="Share"><i class="fa-solid fa-share"></i></button>
                <button class="btn-card btn-delete" onclick="deleteFile('${f.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        grid.appendChild(div);
    });
}

function renderDashboard() {
    const grid = document.getElementById('fileGrid');
    
    const totalFiles = files.length;
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    const videoFiles = files.filter(f => f.type === 'video').length;
    const imageFiles = files.filter(f => f.type === 'image').length;
    
    grid.innerHTML = `
        <div class="dashboard-stats">
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-file"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${totalFiles}</div>
                    <div class="stat-label">Total Files</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-hdd"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${formatSize(totalSize)}</div>
                    <div class="stat-label">Total Size</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-video"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${videoFiles}</div>
                    <div class="stat-label">Videos</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon"><i class="fa-solid fa-image"></i></div>
                <div class="stat-info">
                    <div class="stat-number">${imageFiles}</div>
                    <div class="stat-label">Images</div>
                </div>
            </div>
        </div>
    `;
    
    if (files.length > 0) {
        const recentFiles = files.slice(0, 8);
        grid.innerHTML += '<div class="dashboard-section"><h3>Recent Files</h3></div>';
        
        recentFiles.forEach(f => {
            const div = document.createElement('div');
            div.className = 'file-card';
            div.innerHTML = `
                <div class="preview">${getIconHTML(f.type)}</div>
                <div class="info">
                    <div class="name" title="${f.name}">${f.name}</div>
                    <div class="meta">
                        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                            <span>${formatSize(f.size)}</span>
                            <span>${f.date}</span>
                        </div>
                        <div class="meta-detail">
                            <span class="file-type">${f.mime}</span>
                            ${getProviderIcon(f.meta.provider)}
                        </div>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn-card btn-download" onclick="downloadFile('${f.id}')" title="Download"><i class="fa-solid fa-download"></i></button>
                    <button class="btn-card btn-share" onclick="shareFile('${f.id}')" title="Share"><i class="fa-solid fa-share"></i></button>
                    <button class="btn-card btn-delete" onclick="deleteFile('${f.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>`;
            grid.appendChild(div);
        });
    }
}

function renderRecentFiles() {
    const grid = document.getElementById('fileGrid');
    const recentFiles = [...files].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    
    if (recentFiles.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted);">No recent files.</div>';
        return;
    }
    
    grid.innerHTML = '';
    recentFiles.forEach(f => {
        const div = document.createElement('div');
        div.className = 'file-card';
        div.innerHTML = `
            <div class="preview">${getIconHTML(f.type)}</div>
            <div class="info">
                <div class="name" title="${f.name}">${f.name}</div>
                <div class="meta">
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>${formatSize(f.size)}</span>
                        <span>${f.date}</span>
                    </div>
                    <div class="meta-detail">
                        <span class="file-type">${f.mime}</span>
                        ${getProviderIcon(f.meta.provider)}
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="btn-card btn-download" onclick="downloadFile('${f.id}')" title="Download"><i class="fa-solid fa-download"></i></button>
                <button class="btn-card btn-share" onclick="shareFile('${f.id}')" title="Share"><i class="fa-solid fa-share"></i></button>
                <button class="btn-card btn-delete" onclick="deleteFile('${f.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        grid.appendChild(div);
    });
}

// === FOLDER MANAGEMENT ===
async function createNewFolder() {
    const name = prompt("Enter folder name:");
    if (!name || name.trim() === '') return;
    
    const folder = {
        id: Date.now().toString(),
        name: name.trim(),
        parentId: currentFolder,
        created: new Date().toLocaleDateString()
    };
    
    if (useDatabase && supabaseClient) {
        try {
            await saveFolderToDB(folder);
        } catch (dbError) {
            console.error('[FOLDER] Database save failed:', dbError);
            folders.push(folder);
            localStorage.setItem('ois_folders', JSON.stringify(folders));
        }
    } else {
        folders.push(folder);
        localStorage.setItem('ois_folders', JSON.stringify(folders));
    }
    
    renderGrid();
    alert(`Folder "${name.trim()}" created!`);
}

async function saveFolderToDB(folderObj) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    
    const dbRecord = {
        id: folderObj.id,
        name: folderObj.name,
        parent_id: folderObj.parentId,
        created: folderObj.created
    };
    
    const { data, error } = await supabaseClient.from('folders').insert(dbRecord);
    
    if (error) {
        console.error('[DB] Folder save failed:', error);
        throw error;
    }
    
    folders.push(folderObj);
    return data;
}

function openFolder(folderId) {
    currentFolder = folderId;
    loadData(); // loadData() now handles breadcrumb update after data is loaded
    updatePageTitle();
}

function deleteFolder(folderId) {
    if (!confirm("Delete this folder and all its contents?")) return;
    
    const deleteRecursive = (id) => {
        files = files.filter(f => f.folderId !== id);
        const subfolders = folders.filter(f => f.parentId === id);
        subfolders.forEach(sf => deleteRecursive(sf.id));
        folders = folders.filter(f => f.id !== id);
    };
    
    deleteRecursive(folderId);
    
    localStorage.setItem('ois_folders', JSON.stringify(folders));
    localStorage.setItem('ois_files', JSON.stringify(files));
    renderGrid();
    updateUsedSpace();
}

function updatePageTitle() {
    if (currentFolder) {
        const folder = folders.find(f => f.id === currentFolder);
        document.getElementById('pageTitle').innerText = folder ? folder.name : 'My Files';
    } else {
        const titles = { 'all': 'My Files', 'video': 'Videos', 'image': 'Images', 'audio': 'Audio', 'other': 'Other', 'recent': 'Recent Files', 'dashboard': 'Dashboard' };
        document.getElementById('pageTitle').innerText = titles[currentFilter] || 'My Files';
    }
}

// === FILE MANAGEMENT ===
async function saveFileToDB(fileObj) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    
    const dbRecord = {
        id: fileObj.id.toString(),
        name: fileObj.name,
        size: fileObj.size,
        type: fileObj.type,
        mime: fileObj.mime,
        date: fileObj.date,
        folder_id: fileObj.folderId,
        meta_key: fileObj.meta.key,
        meta_links: JSON.stringify(fileObj.meta.links),
        meta_provider: fileObj.meta.provider,
        is_public: true,
        share_id: fileObj.shareId || null
    };
    
    const { data, error } = await supabaseClient.from('files').insert(dbRecord);
    
    if (error) {
        console.error('[DB] Save failed:', error);
        throw error;
    }
    
    files.unshift(fileObj);
    return data;
}

async function deleteFileFromDB(fileId) {
    if (!supabaseClient) throw new Error('Supabase not initialized');
    
    const { error } = await supabaseClient.from('files').delete().eq('id', fileId);
    if (error) throw error;
}

function deleteFile(id) {
    if(!confirm("Delete this file?")) return;
    
    if (useDatabase && supabaseClient) {
        deleteFileFromDB(id).then(() => {
            files = files.filter(f => f.id != id);
            renderGrid();
            updateUsedSpace();
        }).catch(error => {
            console.warn('Database delete failed, using localStorage:', error);
            files = files.filter(f => f.id != id);
            localStorage.setItem('ois_files', JSON.stringify(files));
            renderGrid();
            updateUsedSpace();
        });
    } else {
        files = files.filter(f => f.id != id);
        localStorage.setItem('ois_files', JSON.stringify(files));
        renderGrid();
        updateUsedSpace();
    }
}

// === UPLOAD ===
async function startRealUpload() {
    const provider = document.getElementById('provider').value;
    if(!selectedFile) return alert("Pilih file!");

    // Check file size limits
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB limit
    if (selectedFile.size > MAX_FILE_SIZE) {
        alert(`File terlalu besar! Maximum ${formatSize(MAX_FILE_SIZE)} per file.`);
        return;
    }

    closeModal('uploadModal');
    document.getElementById('progressModal').style.display = 'flex';
    document.getElementById('progressTitle').innerText = "Uploading...";
    
    cryptoKey = window.crypto.getRandomValues(new Uint8Array(32));
    const keyBase64 = btoa(String.fromCharCode.apply(null, cryptoKey));
    
    const CHUNK_SIZES = {
        'discord': 8 * 1024 * 1024,
        'telegram': 50 * 1024 * 1024
    };
    const CHUNK = CHUNK_SIZES[provider] || 5 * 1024 * 1024;
    const total = Math.ceil(selectedFile.size / CHUNK);
    const links = [];

    console.log(`[UPLOAD] Starting upload: ${selectedFile.name} (${formatSize(selectedFile.size)}) via ${provider}`);
    console.log(`[UPLOAD] Chunk size: ${formatSize(CHUNK)}, Total chunks: ${total}`);

    try {
        for (let i = 0; i < total; i++) {
            const start = i * CHUNK;
            const end = Math.min(start + CHUNK, selectedFile.size);
            const chunk = selectedFile.slice(start, end);
            
            const pct = Math.round((end / selectedFile.size) * 100);
            document.getElementById('progressBar').style.width = pct + "%";
            document.getElementById('progressText').innerText = `Uploading: ${pct}% (${i+1}/${total})`;

            console.log(`[UPLOAD] Chunk ${i+1}/${total}: ${formatSize(chunk.size)}`);

            const formData = new FormData();
            formData.append('chunkData', chunk);
            formData.append('chunkIndex', i);
            formData.append('keyBase64', keyBase64);
            formData.append('fileName', selectedFile.name);

            let endpoint = provider === 'telegram' ? '/api/telegram' : '/api/discord';
            let success = false;
            let lastError = null;

            // Try primary provider first
            try {
                const res = await fetch(endpoint, {
                    method: 'POST',
                    body: formData
                });
                
                if (res.ok) {
                    const data = await res.json();
                    links.push(data.link);
                    success = true;
                    console.log(`[UPLOAD] Chunk ${i+1} uploaded successfully via ${provider}`);
                } else {
                    const errText = await res.text();
                    lastError = errText;
                    console.error(`[UPLOAD] ${provider} failed:`, errText);
                }
            } catch (error) {
                lastError = error.message;
                console.error(`[UPLOAD] ${provider} request failed:`, error);
            }

            // If primary provider fails, try the other one
            if (!success) {
                const fallbackProvider = provider === 'discord' ? 'telegram' : 'discord';
                const fallbackEndpoint = fallbackProvider === 'telegram' ? '/api/telegram' : '/api/discord';
                
                console.log(`[UPLOAD] Trying fallback provider: ${fallbackProvider}`);
                
                try {
                    const res = await fetch(fallbackEndpoint, {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        links.push(data.link);
                        success = true;
                        console.log(`[UPLOAD] Chunk ${i+1} uploaded successfully via ${fallbackProvider} (fallback)`);
                    } else {
                        const errText = await res.text();
                        console.error(`[UPLOAD] Fallback ${fallbackProvider} also failed:`, errText);
                    }
                } catch (error) {
                    console.error(`[UPLOAD] Fallback ${fallbackProvider} request failed:`, error);
                }
            }

            if (!success) {
                throw new Error(`Chunk ${i+1} failed on both providers. Last error: ${lastError}`);
            }
            
            if (i < total - 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // Longer delay to avoid rate limits
            }
        }
        
        closeModal('progressModal');
        
        const fileObj = {
            id: Date.now(), 
            name: selectedFile.name, 
            size: selectedFile.size,
            type: getType(selectedFile.type), 
            mime: selectedFile.type || getMimeString(getType(selectedFile.type)),
            date: new Date().toLocaleDateString(),
            folderId: currentFolder,
            meta: { key: keyBase64, links: links, provider: provider }
        };
        
        if (useDatabase && supabaseClient) {
            try {
                await saveFileToDB(fileObj);
            } catch (dbError) {
                console.error('[UPLOAD] Database save failed:', dbError);
                files.unshift(fileObj);
                localStorage.setItem('ois_files', JSON.stringify(files));
            }
        } else {
            files.unshift(fileObj);
            localStorage.setItem('ois_files', JSON.stringify(files));
        }
        
        renderGrid(); 
        updateUsedSpace(); 
        alert("Upload berhasil!");
        
    } catch(e) { 
        closeModal('progressModal'); 
        
        // Show more helpful error messages
        let errorMsg = e.message;
        if (errorMsg.includes('bot token invalid')) {
            errorMsg = "Bot token expired. Please contact admin to update Discord/Telegram tokens.";
        } else if (errorMsg.includes('lacks permissions')) {
            errorMsg = "Bot lacks permissions. Please contact admin to check bot permissions.";
        } else if (errorMsg.includes('rate limit')) {
            errorMsg = "Rate limit exceeded. Please wait a few minutes and try again.";
        }
        
        alert("Upload gagal: " + errorMsg); 
        console.error('[UPLOAD] Error:', e);
    }
}

// === DOWNLOAD ===
async function downloadFile(id) {
    const fileObj = getFileById(id);
    if(!fileObj) return;

    const theKey = fileObj.meta.key;
    if(!theKey) {
        alert("File ini RUSAK (Key kosong). Hapus dan Upload ulang.");
        return;
    }

    const keyData = Uint8Array.from(atob(theKey), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);
    
    document.getElementById('progressModal').style.display = 'flex';
    document.getElementById('progressTitle').innerText = "Downloading...";
    const decryptedChunks = [];
    const totalChunks = fileObj.meta.links.length;
    
    try {
        for (let i = 0; i < totalChunks; i++) {
            const pct = Math.round(((i+1)/totalChunks)*100);
            document.getElementById('progressBar').style.width = pct + "%";
            document.getElementById('progressText').innerText = `Downloading: ${pct}%`;
            
            // First, check if file needs chunked download
            const checkRes = await fetch('/api/download', {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    url: fileObj.meta.links[i], 
                    provider: fileObj.meta.provider 
                })
            });
            
            if(!checkRes.ok) {
                const errText = await checkRes.text();
                throw new Error(`Chunk ${i+1} check failed: ${errText}`);
            }
            
            const contentType = checkRes.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                // Large file - needs chunked download
                const metadata = await checkRes.json();
                console.log(`[DOWNLOAD] Chunk ${i+1} needs chunked download:`, metadata);
                
                const subChunks = [];
                const totalSubChunks = metadata.totalChunks;
                
                for (let j = 0; j < totalSubChunks; j++) {
                    const subPct = Math.round(((i + (j+1)/totalSubChunks)/totalChunks)*100);
                    document.getElementById('progressBar').style.width = subPct + "%";
                    document.getElementById('progressText').innerText = `Downloading: ${subPct}% (chunk ${i+1}/${totalChunks}, part ${j+1}/${totalSubChunks})`;
                    
                    const startByte = j * metadata.maxChunkSize;
                    const endByte = Math.min(startByte + metadata.maxChunkSize - 1, metadata.fileSize - 1);
                    const rangeHeader = `bytes=${startByte}-${endByte}`;
                    
                    const subChunkRes = await fetch('/api/download', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            url: fileObj.meta.links[i],
                            provider: fileObj.meta.provider,
                            range: rangeHeader
                        })
                    });
                    
                    if (!subChunkRes.ok) {
                        const errText = await subChunkRes.text();
                        throw new Error(`Sub-chunk ${j+1} of chunk ${i+1} failed: ${errText}`);
                    }
                    
                    const subChunkData = await subChunkRes.arrayBuffer();
                    subChunks.push(new Uint8Array(subChunkData));
                }
                
                // Combine all sub-chunks
                const totalSize = subChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                const combinedChunk = new Uint8Array(totalSize);
                let offset = 0;
                for (const chunk of subChunks) {
                    combinedChunk.set(chunk, offset);
                    offset += chunk.length;
                }
                
                // Decrypt the combined chunk
                if (combinedChunk.length < 12) {
                    throw new Error(`Chunk ${i} is too small (${combinedChunk.length} bytes), expected at least 12 (nonce)`);
                }
                
                const nonce = combinedChunk.slice(0, 12);
                const ciphertext = combinedChunk.slice(12);
                
                const decryptedData = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: nonce },
                    key,
                    ciphertext
                );
                
                decryptedChunks.push(decryptedData);
                
            } else {
                // Small file - direct download
                console.log(`[DOWNLOAD] Chunk ${i+1} is small, direct download`);
                const encryptedData = await checkRes.arrayBuffer();
                const encryptedArray = new Uint8Array(encryptedData);
                
                if (encryptedArray.length < 12) {
                    throw new Error(`Chunk ${i} is too small (${encryptedArray.length} bytes), expected at least 12 (nonce)`);
                }
                
                const nonce = encryptedArray.slice(0, 12);
                const ciphertext = encryptedArray.slice(12);
                
                const decryptedData = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: nonce },
                    key,
                    ciphertext
                );
                
                decryptedChunks.push(decryptedData);
            }
        }
        
        const finalBlob = new Blob(decryptedChunks, { type: "application/octet-stream" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalBlob);
        a.download = fileObj.name;
        a.click();
        
        closeModal('progressModal');
        
    } catch(e) { 
        closeModal('progressModal'); 
        alert("Gagal dekripsi: " + e.message); 
        console.error('[DOWNLOAD] Error:', e);
    }
}

// === SHARE FUNCTIONS ===
async function shareFile(fileId) {
    const file = getFileById(fileId);
    if (!file) {
        alert('File not found!');
        return;
    }
    
    if (!file.shareId) {
        file.shareId = generateShareId();
        
        if (useDatabase && supabaseClient) {
            try {
                await supabaseClient
                    .from('files')
                    .update({ 
                        share_id: file.shareId,
                        is_public: true 
                    })
                    .eq('id', fileId);
            } catch (error) {
                console.error('[SHARE] Failed to update database:', error);
            }
        }
        
        const fileIndex = files.findIndex(f => f.id == fileId);
        if (fileIndex !== -1) {
            files[fileIndex].shareId = file.shareId;
            files[fileIndex].isPublic = true;
            localStorage.setItem('ois_files', JSON.stringify(files));
        }
    }
    
    const shareUrl = `${window.location.origin}/share.html?id=${file.shareId}`;
    showShareModal(file.name, shareUrl);
}

function showShareModal(fileName, shareUrl) {
    let modal = document.getElementById('shareModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shareModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <h3><i class="fa-solid fa-share"></i> Share File</h3>
                <p style="color: var(--text-muted); margin-bottom: 15px;">Share this file with others using the link below:</p>
                
                <div style="margin-bottom: 15px;">
                    <label style="font-size: 0.9rem; color: var(--text-muted); display: block; margin-bottom: 5px;">File Name:</label>
                    <div style="background: var(--bg-dark); padding: 10px; border-radius: 6px; border: 1px solid var(--border);">
                        <span id="shareFileName" style="color: var(--text-main);"></span>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-size: 0.9rem; color: var(--text-muted); display: block; margin-bottom: 5px;">Share Link:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="shareUrl" readonly style="flex: 1; padding: 10px; background: var(--bg-dark); border: 1px solid var(--border); color: var(--text-main); border-radius: 6px; font-size: 0.9rem;">
                        <button onclick="copyShareUrl()" style="padding: 10px 15px; background: var(--primary); color: white; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap;">
                            <i class="fa-solid fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
                
                <div style="background: rgba(139, 92, 246, 0.1); padding: 15px; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.3); margin-bottom: 20px;">
                    <p style="color: var(--primary); font-size: 0.85rem; margin: 0;">
                        <i class="fa-solid fa-info-circle"></i> 
                        This link allows anyone to download the file. The file is encrypted and stored securely.
                    </p>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button onclick="closeModal('shareModal')" style="padding: 10px 20px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('shareFileName').textContent = fileName;
    document.getElementById('shareUrl').value = shareUrl;
    modal.style.display = 'flex';
}

function copyShareUrl() {
    const shareUrlInput = document.getElementById('shareUrl');
    shareUrlInput.select();
    shareUrlInput.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        
        const button = event.target.closest('button');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        button.style.background = '#22c55e';
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.background = 'var(--primary)';
        }, 2000);
        
    } catch (err) {
        alert('Failed to copy link. Please copy manually.');
    }
}

// === HELPER FUNCTIONS ===
function getIconHTML(t) {
    if(t==='video') return '<i class="fa-solid fa-video"></i>';
    if(t==='audio') return '<i class="fa-solid fa-music"></i>';
    if(t==='image') return '<i class="fa-solid fa-image"></i>';
    return '<i class="fa-solid fa-file"></i>';
}

function getProviderIcon(p) {
    if(p==='discord') return '<i class="fa-brands fa-discord provider-icon discord"></i>';
    if(p==='telegram') return '<i class="fa-brands fa-telegram provider-icon telegram"></i>';
    return '';
}

function formatSize(bytes) { 
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i === 0) return bytes + ' B';
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
    return size + ' ' + sizes[i];
}

function getFileById(id) { 
    return files.find(f => f.id == id); 
}

function getMimeString(type) {
    if(type==='video') return 'video/mp4';
    if(type==='audio') return 'audio/mp3';
    if(type==='image') return 'image/png';
    return 'file/bin';
}

function getType(mime) {
    if(mime.startsWith('video')) return 'video';
    if(mime.startsWith('image')) return 'image';
    if(mime.startsWith('audio')) return 'audio';
    return 'other';
}

function updateUsedSpace() {
    const total = files.reduce((acc, f) => acc + f.size, 0);
    document.getElementById('usedSpaceText').innerText = formatSize(total);
    const limitGB = 10 * 1024 * 1024 * 1024;
    const percentage = Math.min((total / limitGB) * 100, 100);
    document.getElementById('usedSpaceBar').style.width = percentage + "%";
}

// === MODAL FUNCTIONS ===
function openUploadModal() { 
    document.getElementById('uploadModal').style.display = 'flex'; 
}

function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
}

function handleFileSelect() {
    if(document.getElementById('fileInput').files[0]) {
        selectedFile = document.getElementById('fileInput').files[0];
        document.getElementById('fileName').innerText = selectedFile.name;
    }
}

function generateShareId() {
    return 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
// === BREADCRUMB FUNCTIONS ===
function updateBreadcrumb() {
    const breadcrumbPath = document.getElementById('breadcrumbPath');
    
    // Debug log
    console.log('[BREADCRUMB] Current filter:', currentFilter, 'Current folder:', currentFolder);
    console.log('[BREADCRUMB] Folders array length:', folders.length);
    
    // Only show breadcrumb in My Files view
    if (currentFilter !== 'all') {
        breadcrumbPath.style.display = 'none';
        return;
    }
    
    // Always show breadcrumb in My Files, even at root
    breadcrumbPath.style.display = 'flex';
    
    // If at root, just show Home
    if (!currentFolder) {
        breadcrumbPath.innerHTML = '<span class="path-item current"><i class="fa-solid fa-home"></i> Home</span>';
        return;
    }
    
    // Build breadcrumb path
    const path = [];
    let currentId = currentFolder;
    
    // Get all parent folders
    while (currentId) {
        const folder = folders.find(f => f.id === currentId);
        if (folder) {
            path.unshift(folder);
            currentId = folder.parentId;
        } else {
            console.warn('[BREADCRUMB] Folder not found:', currentId);
            break;
        }
    }
    
    console.log('[BREADCRUMB] Path:', path.map(f => f.name));
    
    // Create breadcrumb HTML (home/folder/subfolder format)
    let breadcrumbHTML = '<span class="path-item" onclick="navigateToRoot()"><i class="fa-solid fa-home"></i> Home</span>';
    
    // Add each folder in the path
    path.forEach((folder, index) => {
        breadcrumbHTML += '<span class="path-separator">/</span>';
        if (index === path.length - 1) {
            // Current folder (not clickable)
            breadcrumbHTML += `<span class="path-item current">${folder.name}</span>`;
        } else {
            // Parent folders (clickable)
            breadcrumbHTML += `<span class="path-item" onclick="navigateToFolder('${folder.id}')">${folder.name}</span>`;
        }
    });
    
    breadcrumbPath.innerHTML = breadcrumbHTML;
    console.log('[BREADCRUMB] HTML updated successfully');
}

function navigateToRoot() {
    currentFolder = null;
    loadData(); // loadData() now handles breadcrumb update after data is loaded
    updatePageTitle();
}

function navigateToFolder(folderId) {
    currentFolder = folderId;
    loadData(); // loadData() now handles breadcrumb update after data is loaded
    updatePageTitle();
}
// === MOBILE MENU FUNCTIONS ===
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

// Close sidebar when clicking nav items on mobile
function switchView(filterType, element) {
    // Close mobile sidebar when switching views
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    currentFilter = filterType;
    
    if (filterType === 'dashboard' || filterType === 'recent' || filterType === 'video' || filterType === 'image' || filterType === 'audio' || filterType === 'other') {
        currentFolder = null;
    } else if (filterType !== currentFilter) {
        currentFolder = null;
    }
    
    if (filterType === 'dashboard') {
        document.getElementById('pageTitle').innerText = 'Dashboard';
        loadData().then(() => renderDashboard());
    } else if (filterType === 'recent') {
        document.getElementById('pageTitle').innerText = 'Recent Files';
        loadData().then(() => renderRecentFiles());
    } else {
        const titles = { 'all': 'My Files', 'video': 'Videos', 'image': 'Images', 'audio': 'Audio', 'other': 'Other' };
        document.getElementById('pageTitle').innerText = titles[filterType] || 'My Files';
        loadData().then(() => renderGrid());
    }
}

// Close sidebar on window resize
window.addEventListener('resize', function() {
    if (window.innerWidth > 768) {
        closeSidebar();
    }
});