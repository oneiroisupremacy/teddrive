package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

type Config struct {
	SupabaseURL    string `json:"supabaseUrl"`
	SupabaseAnonKey string `json:"supabaseAnonKey"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	config := Config{
		SupabaseURL:    os.Getenv("SUPABASE_URL"),
		SupabaseAnonKey: os.Getenv("SUPABASE_ANON_KEY"),
	}

	// Don't use fallback values - return empty if not configured
	// Frontend will handle missing config gracefully
	if config.SupabaseURL == "" || config.SupabaseAnonKey == "" {
		fmt.Println("[WARNING] Supabase environment variables not configured")
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(config)
}