package handler

import (
    "fmt"
    "net/http"
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
    fmt.Println("[UPLOAD] Generic upload handler started")

    // This is a fallback/generic upload endpoint
    http.Error(w, "Use /api/discord or /api/telegram endpoints", http.StatusBadRequest)
}
