package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

type DebugInfo struct {
	DiscordBotToken    string `json:"discord_bot_token"`
	DiscordChannelID   string `json:"discord_channel_id"`
	TelegramBotToken   string `json:"telegram_bot_token"`
	TelegramChatID     string `json:"telegram_chat_id"`
	SupabaseURL        string `json:"supabase_url"`
	SupabaseAnonKey    string `json:"supabase_anon_key"`
	AllEnvVars         map[string]string `json:"all_env_vars"`
}

func Handler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Only GET allowed", http.StatusMethodNotAllowed)
		return
	}

	token := strings.TrimSpace(os.Getenv("DISCORD_BOT_TOKEN"))
	channelID := strings.TrimSpace(os.Getenv("DISCORD_CHANNEL_ID"))
	tgToken := strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
	tgChatID := strings.TrimSpace(os.Getenv("TELEGRAM_CHAT_ID"))
	sbURL := strings.TrimSpace(os.Getenv("SUPABASE_URL"))
	sbKey := strings.TrimSpace(os.Getenv("SUPABASE_ANON_KEY"))

	// Mask sensitive values for security
	maskValue := func(val string) string {
		if val == "" {
			return "[EMPTY]"
		}
		if len(val) <= 4 {
			return "[TOO_SHORT]"
		}
		return val[:4] + "..." + val[len(val)-4:]
	}

	debug := DebugInfo{
		DiscordBotToken:  maskValue(token),
		DiscordChannelID: maskValue(channelID),
		TelegramBotToken: maskValue(tgToken),
		TelegramChatID:   maskValue(tgChatID),
		SupabaseURL:      maskValue(sbURL),
		SupabaseAnonKey:  maskValue(sbKey),
		AllEnvVars:       make(map[string]string),
	}

	// Log all env vars for debugging
	fmt.Println("[DEBUG] Environment Variables:")
	fmt.Printf("  DISCORD_BOT_TOKEN: len=%d, empty=%v\n", len(token), token == "")
	fmt.Printf("  DISCORD_CHANNEL_ID: len=%d, empty=%v\n", len(channelID), channelID == "")
	fmt.Printf("  TELEGRAM_BOT_TOKEN: len=%d, empty=%v\n", len(tgToken), tgToken == "")
	fmt.Printf("  TELEGRAM_CHAT_ID: len=%d, empty=%v\n", len(tgChatID), tgChatID == "")
	fmt.Printf("  SUPABASE_URL: len=%d, empty=%v\n", len(sbURL), sbURL == "")
	fmt.Printf("  SUPABASE_ANON_KEY: len=%d, empty=%v\n", len(sbKey), sbKey == "")

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(debug)
}