// Share page JavaScript for TEDDRIVE
let sharedFile = null;
let supabaseClient = null;

// Initialize Supabase
async function initSupabase() {
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
            supabaseUrl = 'https://your-project.supabase.co';
            supabaseKey = 'your-anon-key';
        }

        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        return true;
    } catch (error) {
        console.error('Supabase initialization failed:', error);
        return false;
    }
}

// Get share ID from URL and initialize
const urlParams = new URLSearchParams(window.location.search);
const shareId = urlParams.get('id');

if (!shareId) {
    showError('Invalid share link. Share ID is missing.');
} else {
    initSupabase().then(success => {
        if (success) {
            loadSharedFile(shareId);
        } else {
            showError('Failed to initialize database connection.');
        }
    });
}

async function loadSharedFile(shareId) {
    try {
        const { data, error } = await supabaseClient
            .from('files')
            .select('*')
            .eq('share_id', shareId)
            .eq('is_public', true)
            .single();

        if (error || !data) {
            showError('File not found or share link has expired.');
            return;
        }

        sharedFile = {
            id: data.id,
            name: data.name,
            size: data.size,
            type: data.type,
            mime: data.mime,
            date: data.date,
            folderId: data.folder_id,
            meta: {
                key: data.meta_key,
                links: JSON.parse(data.meta_links),
                provider: data.meta_provider
            },
            isPublic: data.is_public,
            shareId: data.share_id
        };

        showFileInfo(sharedFile);
    } catch (error) {
        console.error('Error loading shared file:', error);
        showError('Network error. Please check your connection and try again.');
    }
}

function showFileInfo(file) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="file-preview">
            <div class="file-icon">${getIconHTML(file.type)}</div>
            <div class="file-name">${file.name}</div>
            <div class="file-meta">
                <div style="margin-bottom: 5px;">${formatSize(file.size)}</div>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                    <span>${file.mime}</span>
                    ${getProviderIcon(file.meta.provider)}
                </div>
            </div>
        </div>
        <button class="download-btn" onclick="downloadSharedFile()">
            <i class="fa-solid fa-download"></i>
            Download File
        </button>
        <div class="footer-info">
            <p>This file is shared via TEDDRIVE</p>
            <p>Encrypted and stored securely on Discord/Telegram</p>
        </div>
    `;
}

function showError(message) {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="error-message">
            <i class="fa-solid fa-exclamation-triangle" style="margin-right: 10px;"></i>
            ${message}
        </div>
        <div style="margin-top: 20px;">
            <a href="/" style="color: var(--primary); text-decoration: none;">
                <i class="fa-solid fa-home"></i> Go to TEDDRIVE
            </a>
        </div>
    `;
}

async function downloadSharedFile() {
    if (!sharedFile) return;

    const theKey = sharedFile.meta.key;
    if (!theKey) {
        alert("File is corrupted (missing encryption key).");
        return;
    }

    const keyData = Uint8Array.from(atob(theKey), c => c.charCodeAt(0));
    const key = await window.crypto.subtle.importKey("raw", keyData, { name: "AES-GCM" }, false, ["decrypt"]);

    document.getElementById('progressModal').style.display = 'flex';
    document.getElementById('progressTitle').innerText = "Downloading...";

    const decryptedChunks = [];
    const totalChunks = sharedFile.meta.links.length;

    try {
        for (let i = 0; i < totalChunks; i++) {
            const pct = Math.round(((i+1)/totalChunks)*100);
            document.getElementById('progressBar').style.width = pct + "%";
            document.getElementById('progressText').innerText = `Downloading: ${pct}%`;

            const proxyRes = await fetch('/api/download', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ url: sharedFile.meta.links[i], provider: sharedFile.meta.provider })
            });

            if (!proxyRes.ok) {
                const errText = await proxyRes.text();
                throw new Error(`Chunk ${i+1} failed: ${errText}`);
            }

            const encryptedData = await proxyRes.arrayBuffer();
            const encryptedArray = new Uint8Array(encryptedData);
            const nonce = encryptedArray.slice(0, 12);
            const ciphertext = encryptedArray.slice(12);

            const decryptedData = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: nonce },
                key,
                ciphertext
            );

            decryptedChunks.push(decryptedData);
        }

        const finalBlob = new Blob(decryptedChunks, { type: "application/octet-stream" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalBlob);
        a.download = sharedFile.name;
        a.click();

        document.getElementById('progressModal').style.display = 'none';
    } catch (e) {
        document.getElementById('progressModal').style.display = 'none';
        alert("Download failed: " + e.message);
    }
}

// Helper functions
function getIconHTML(t) {
    if(t==='video') return '<i class="fa-solid fa-video"></i>';
    if(t==='audio') return '<i class="fa-solid fa-music"></i>';
    if(t==='image') return '<i class="fa-solid fa-image"></i>';
    return '<i class="fa-solid fa-file"></i>';
}

function getProviderIcon(p) {
    if(p==='discord') return '<i class="fa-brands fa-discord" style="color: #5865F2;"></i>';
    if(p==='telegram') return '<i class="fa-brands fa-telegram" style="color: #0088cc;"></i>';
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