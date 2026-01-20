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
    fmt.Println("[DISCORD] Upload handler started")

    // Check Discord environment variables
    token := strings.TrimSpace(os.Getenv("DISCORD_BOT_TOKEN"))
    channelID := strings.TrimSpace(os.Getenv("DISCORD_CHANNEL_ID"))
    
    if token == "" || channelID == "" {
        fmt.Println("[ERROR] Discord credentials missing")
        http.Error(w, "Discord not configured", http.StatusServiceUnavailable)
        return
    }

    fmt.Println("[ENV] Discord credentials OK")

    // Parse form - Discord supports up to 25MB
    err := r.ParseMultipartForm(25 << 20) // 25MB limit for Discord
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

    // Upload to Discord
    link, err := uploadToDiscord(fileName, encryptedData, token, channelID)
    if err != nil {
        fmt.Printf("[ERROR] Upload failed: %v\n", err)
        http.Error(w, fmt.Sprintf("Upload failed: %v", err), http.StatusInternalServerError)
        return
    }

    fmt.Printf("[SUCCESS] Uploaded: %s\n", link)

    // Send response
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(UploadResponse{Link: link})
}

func uploadToDiscord(fileName string, data []byte, token, channelID string) (string, error) {
    fmt.Printf("[DISCORD] Starting upload: %d bytes\n", len(data))

    url := fmt.Sprintf("https://discord.com/api/v10/channels/%s/messages", channelID)
    
    // Create multipart
    body := &bytes.Buffer{}
    writer := multipart.NewWriter(body)
    
    // Clean filename
    cleanName := regexp.MustCompile(`[^\w\.\-]+`).ReplaceAllString(fileName, "_")
    
    part, err := writer.CreateFormFile("files[0]", cleanName+".bin")
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
    
    req.Header.Set("Authorization", "Bot "+token)
    req.Header.Set("Content-Type", writer.FormDataContentType())

    // Make request with short timeout
    client := &http.Client{Timeout: 20 * time.Second}
    resp, err := client.Do(req)
    if err != nil {
        return "", err
    }
    defer resp.Body.Close()

    if resp.StatusCode != 200 {
        respBody, _ := io.ReadAll(resp.Body)
        return "", fmt.Errorf("Discord API error %d: %s", resp.StatusCode, string(respBody))
    }

    // Parse response
    var result map[string]interface{}
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return "", err
    }

    // Get attachment URL
    if attachments, ok := result["attachments"].([]interface{}); ok && len(attachments) > 0 {
        if att, ok := attachments[0].(map[string]interface{}); ok {
            if url, ok := att["url"].(string); ok {
                return url, nil
            }
        }
    }

    return "", fmt.Errorf("No attachment URL in response")
}