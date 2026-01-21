# TEDDRIVE

A secure cloud storage solution that uses Discord and Telegram as storage backends with Supabase for metadata management.

## Features

- **Multi-Provider Storage**: Upload files to Discord or Telegram channels
- **End-to-End Encryption**: All files are encrypted before upload using AES-GCM
- **File Management**: Create folders, organize files, and manage your storage
- **File Sharing**: Generate secure share links for your files
- **Large File Support**: Automatic chunking for files up to 2GB
- **Real-time Database**: Supabase integration for fast metadata operations
- **Responsive UI**: Works on desktop and mobile devices

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Go (Vercel Functions)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Discord API, Telegram Bot API
- **Encryption**: Web Crypto API (AES-GCM)

## Setup

### Prerequisites

1. Discord Bot Token and Channel ID
2. Telegram Bot Token and Chat ID
3. Supabase Project with database

### Environment Variables

Create a `.env` file with the following variables:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_discord_channel_id
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

Run the following SQL in your Supabase SQL Editor:

```sql
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

-- Disable RLS and grant permissions
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.files TO anon, authenticated;
GRANT ALL ON public.folders TO anon, authenticated;
```

### Discord Bot Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Create a bot and copy the token
3. Invite the bot to your server with "Send Messages" and "Attach Files" permissions
4. Get the channel ID where files will be stored

### Telegram Bot Setup

1. Create a bot using @BotFather on Telegram
2. Copy the bot token
3. Add the bot to a channel or group
4. Get the chat ID (use @userinfobot or check bot logs)

## Usage

### File Upload

1. Click the "Upload" button
2. Select your file (max 2GB)
3. Choose storage provider (Discord or Telegram)
4. Wait for upload completion

### File Management

- **Create Folders**: Organize your files in folders
- **Navigate**: Click folders to browse contents
- **Download**: Click download button on any file
- **Share**: Generate public share links
- **Delete**: Remove files and folders

### Storage Limits

- **Per File**: 2GB maximum
- **Total Storage**: 10GB limit
- **Discord Chunks**: 8MB per chunk
- **Telegram Chunks**: 50MB per chunk (recommended for large files)

## How It Works

1. **Upload Process**:
   - File is encrypted using AES-GCM with a random key
   - Large files are split into chunks based on provider limits
   - Each chunk is uploaded to Discord/Telegram
   - Metadata and encryption key stored in Supabase

2. **Download Process**:
   - Retrieve file metadata from Supabase
   - Download all chunks from Discord/Telegram
   - Decrypt and reassemble the original file

3. **Security**:
   - Files are encrypted before leaving your browser
   - Encryption keys are stored separately from file data
   - Discord/Telegram only store encrypted chunks

## API Endpoints

- `GET /api/config` - Get Supabase configuration
- `POST /api/discord` - Upload chunk to Discord
- `POST /api/telegram` - Upload chunk to Telegram
- `POST /api/download` - Download file chunk
- `POST /api/upload` - Legacy upload endpoint
- `GET /api/debug` - Debug information

## File Structure

```
├── api/                    # Vercel serverless functions
│   ├── config/            # Configuration endpoint
│   ├── discord/           # Discord upload handler
│   ├── telegram/          # Telegram upload handler
│   ├── download/          # File download handler
│   └── upload/            # Legacy upload handler
├── public/                # Static files
│   ├── assets/
│   │   ├── css/          # Stylesheets
│   │   └── js/           # JavaScript files
│   ├── index.html        # Main application
│   └── share.html        # File sharing page
├── go.mod                # Go module definition
├── vercel.json           # Vercel configuration
└── README.md            # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Security Notice

This application stores encrypted files on third-party services (Discord/Telegram). While files are encrypted, ensure you comply with the terms of service of these platforms and applicable laws in your jurisdiction.