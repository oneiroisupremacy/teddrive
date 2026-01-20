package handler

import (
    "encoding/json"
    "fmt"
    "io"
    "net/http"
    "os"
    "time"
)

// Download request hanya butuh URL & Provider
// Key tidak perlu dikirim ke server untuk keamanan
type DownloadRequest struct {
    URL      string `json:"url"`
    Provider string `json:"provider"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // Handle CORS preflight
    if r.Method == "OPTIONS" {
        w.Header().Set("Access-Control-Allow-Origin", "*")
        w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
        w.WriteHeader(http.StatusOK)
        return
    }

    if r.Method != "POST" {
        http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
        return
    }

    var req DownloadRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    var targetURL string
    var err error

    // --- TELEGRAM: Cari Path dulu ---
    if req.Provider == "telegram" {
        token := os.Getenv("TELEGRAM_BOT_TOKEN")
        if token == "" {
            http.Error(w, "TELEGRAM_BOT_TOKEN missing in Env", http.StatusInternalServerError)
            return
        }
        
        apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", token, req.URL)
        resp, err := http.Get(apiURL)
        if err != nil {
            fmt.Println("[PROXY TG] GetFile Error:", err)
            http.Error(w, "Telegram GetFile Error", http.StatusInternalServerError)
            return
        }
        defer resp.Body.Close()

        var tgResp map[string]interface{}
        json.NewDecoder(resp.Body).Decode(&tgResp)

        if ok, exists := tgResp["ok"].(bool); !exists || !ok {
            fmt.Println("[PROXY TG] API Error:", tgResp["description"])
            http.Error(w, "Telegram API Error", http.StatusInternalServerError)
            return
        }

        result := tgResp["result"].(map[string]interface{})
        filePath := result["file_path"].(string)
        targetURL = fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", token, filePath)

    } else {
        // DISCORD: Langsung ambil URL
        targetURL = req.URL
    }

    // --- FETCH (Proxy) ---
    fmt.Printf("[PROXY] Fetching: %s\n", targetURL)
    client := &http.Client{Timeout: 60 * time.Second}
    httpReq, _ := http.NewRequest("GET", targetURL, nil)
    httpReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    httpReq.Header.Set("Accept", "*/*")
    httpReq.Header.Set("Accept-Encoding", "gzip, deflate")

    resp, err := client.Do(httpReq)
    if err != nil {
        fmt.Println("[PROXY] Connection Error:", err)
        http.Error(w, "Connection Failed", http.StatusInternalServerError)
        return
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        fmt.Printf("[PROXY] Remote Status: %d, Content-Length: %d\n", resp.StatusCode, resp.ContentLength)
        if resp.StatusCode == 415 {
            fmt.Println("[PROXY] 415 Error - Discord may have deleted or expired the file. Try using regular URL instead of proxy_url")
        }
        http.Error(w, fmt.Sprintf("Remote server error: %d", resp.StatusCode), http.StatusInternalServerError)
        return
    }

    // Stream encrypted bytes ke frontend untuk dekripsi client-side
    w.Header().Set("Content-Type", "application/octet-stream")
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
    
    bytesWritten, err := io.Copy(w, resp.Body)
    if err != nil {
        fmt.Println("[PROXY] Stream Error:", err)
    } else {
        fmt.Printf("[PROXY] Stream Success. Bytes written: %d\n", bytesWritten)
        if bytesWritten == 0 {
            fmt.Printf("[PROXY] WARNING: 0 bytes streamed from URL: %s\n", targetURL)
        }
    }
}
