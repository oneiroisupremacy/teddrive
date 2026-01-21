package handler

import (
    "bytes"
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "os"
    "regexp"
    "strings"
    "time"
)

type UploadResponse struct {
    Link string `json:"link"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
    // Set CORS headers first
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
    
    if r.Method == "OPTIONS" {
        w.WriteHeader(http.StatusOK)
        return
    }

    if r.Method != "POST" {
        http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
        return
    }

    // Immediate logging
    fmt.Println("[TELEGRAM] Upload handler started")

    // Check Telegram environment variables
    token := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
    chatID := strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID"))
    
    fmt.Printf("[DEBUG] Token length: %d\n", len(token))
    fmt.Printf("[DEBUG] Chat ID: %s\n", chatID)
    
    if token == "" || chatID == "" {
        fmt.Println("[ERROR] Telegram credentials missing")
        fmt.Printf("[ERROR] TELEGRAM_BOT_TOKEN: '%s' (len=%d)\n", token, len(token))
        fmt.Printf("[ERROR] TELEGRAM_CHAT_ID: '%s' (len=%d)\n", chatID, len(chatID))
        http.Error(w, "Telegram not configured - missing environment variables", http.StatusServiceUnavailable)
        return
    }

    fmt.Println("[ENV] Telegram credentials OK")

    // Parse form - Telegram supports larger files (50MB)
    err := r.ParseMultipartForm(50 << 20) // 50MB limit for Telegram
    if err != nil {
        fmt.Printf("[ERROR] Parse form failed: %v\n", err)
        http.Error(w, "Parse form failed", http.StatusBadRequest)
        return
    }
    defer r.MultipartForm.RemoveAll()

    fmt.Println("[PARSE] Form parsed successfully")

    // Get form values
    keyBase64 := r.FormValue("keyBase64")
    fileName := r.FormValue("fileName")
    chunkIndexStr := r.FormValue("chunkIndex")

    if keyBase64 == "" || fileName == "" {
        http.Error(w, "Missing required fields", http.StatusBadRequest)
        return
    }

    fmt.Printf("[FORM] fileName=%s, chunkIndex=%s\n", fileName, chunkIndexStr)

    // Get file
    file, fileHeader, err := r.FormFile("chunkData")
    if err != nil {
        fmt.Printf("[ERROR] Get file failed: %v\n", err)
        http.Error(w, "No file provided", http.StatusBadRequest)
        return
    }
    defer file.Close()

    fmt.Printf("[FILE] Got file: %d bytes\n", fileHeader.Size)

    // Read file data
    fileData, err := io.ReadAll(file)
    if err != nil {
        fmt.Printf("[ERROR] Read file failed: %v\n", err)
        http.Error(w, "Read file failed", http.StatusInternalServerError)
        return
    }

    fmt.Printf("[READ] Read %d bytes\n", len(fileData))

    // Simple encryption
    key, err := base64.StdEncoding.DecodeString(keyBase64)
    if err != nil || len(key) != 32 {
        http.Error(w, "Invalid key", http.StatusBadRequest)
        return
    }

    fmt.Println("[CRYPTO] Key decoded")

    // Encrypt
    block, err := aes.NewCipher(key)
    if err != nil {
        http.Error(w, "Cipher error", http.StatusInternalServerError)
        return
    }

    gcm, err := cipher.NewGCM(block)
    if err != nil {
        http.Error(w, "GCM error", http.StatusInternalServerError)
        return
    }

    nonce := make([]byte, gcm.NonceSize())
    rand.Read(nonce)

    ciphertext := gcm.Seal(nil, nonce, fileData, nil)
    
    // Combine nonce + ciphertext
    encryptedData := append(nonce, ciphertext...)

    fmt.Printf("[ENCRYPT] Encrypted to %d bytes\n", len(encryptedData))

    // Upload to Telegram
    link, err := uploadToTelegram(fileName, encryptedData, token, chatID)
    if err != nil {
        fmt.Printf("[ERROR] Upload failed: %v\n", err)
        // Return more detailed error to frontend
        errorMsg := fmt.Sprintf("Telegram upload failed: %v", err)
        http.Error(w, errorMsg, http.StatusInternalServerError)
        return
    }

    fmt.Printf("[SUCCESS] Uploaded: %s\n", link)

    // Send response
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(UploadResponse{Link: link})
}

func uploadToTelegram(fileName string, data []byte, token, chatID string) (string, error) {
    fmt.Printf("[TELEGRAM] Starting upload: %d bytes\n", len(data))

    url := fmt.Sprintf("https://api.telegram.org/bot%s/sendDocument", token)
    
    // Create multipart
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)
    
    // Add chat_id field
    writer.WriteField("chat_id", chatID)
    
    // Clean filename
    cleanName := regexp.MustCompile(`[^\w\.\-]+`).ReplaceAllString(fileName, "_")
    
    part, err := writer.CreateFormFile("document", cleanName+".bin")
    if err != nil {
        return "", err
    }
    
    part.Write(data)
    writer.Close()

    // Create request
    req, err := http.NewRequest("POST", url, body)
    if err != nil {
        return "", err
    }
    
    req.Header.Set("Content-Type", writer.FormDataContentType())

    // Make request with longer timeout for Telegram (supports larger files)
    client := &http.Client{Timeout: 120 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return "", fmt.Errorf("HTTP request failed: %v", err)
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)
    fmt.Printf("[TELEGRAM] Response Status: %d\n", resp.StatusCode)
    fmt.Printf("[TELEGRAM] Response Body: %s\n", string(respBody))

    if resp.StatusCode == 401 {
        return "", fmt.Errorf("Telegram bot token invalid or expired. Please check TELEGRAM_BOT_TOKEN")
    }
    
    if resp.StatusCode == 403 {
        return "", fmt.Errorf("Telegram bot lacks permissions or chat not found. Check TELEGRAM_CHAT_ID")
    }
    
    if resp.StatusCode == 429 {
        return "", fmt.Errorf("Telegram rate limit exceeded. Please wait and try again")
    }

    if resp.StatusCode != 200 {
        return "", fmt.Errorf("Telegram API error %d: %s", resp.StatusCode, string(respBody))
    }

    // Parse response
    var result map[string]interface{}
    if err := json.Unmarshal(respBody, &result); err != nil {
        return "", fmt.Errorf("Failed to parse Telegram response: %v", err)
    }

    // Check if ok
    if ok, exists := result["ok"].(bool); !exists || !ok {
        errorMsg := "Unknown error"
        if desc, ok := result["description"].(string); ok {
            errorMsg = desc
        }
        return "", fmt.Errorf("Telegram API error: %s", errorMsg)
    }

    // Get file_id from result
    if resultData, ok := result["result"].(map[string]interface{}); ok {
        if document, ok := resultData["document"].(map[string]interface{}); ok {
            if fileID, ok := document["file_id"].(string); ok {
                return fileID, nil
            }
        }
    }

    return "", fmt.Errorf("No file_id in Telegram response")
}