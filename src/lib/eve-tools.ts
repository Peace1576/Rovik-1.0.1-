import { FunctionDeclaration, Type } from "@google/genai";

export type ClientAction =
  | { type: "open_url"; url: string; description: string }
  | { type: "play_youtube"; videoId: string; url: string; title: string; channel?: string }
  | { type: "set_reminder"; message: string; delay_minutes: number }
  | { type: "write_clipboard"; text: string }
  | { type: "download_file"; filename: string; content: string; mimeType: string }
  | { type: "draft_email"; to: string; subject: string; body: string }
  | { type: "show_image"; url: string; prompt: string };

export const EVE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  // ── Existing ──────────────────────────────────────────────────────────────
  {
    name: "open_url",
    description:
      "Opens a URL in the user's browser. Construct URLs from your knowledge. Amazon: https://www.amazon.com/s?k=QUERY. Google: https://www.google.com/search?q=QUERY.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "Full URL including https://" },
        description: { type: Type.STRING, description: "Short human-readable label" },
      },
      required: ["url", "description"],
    },
  },
  {
    name: "set_reminder",
    description: "Schedules a browser notification reminder after a delay.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "Reminder text to show the user." },
        delay_minutes: { type: Type.NUMBER, description: "Minutes from now." },
      },
      required: ["message", "delay_minutes"],
    },
  },

  // ── Web & Research ─────────────────────────────────────────────────────────
  {
    name: "web_search",
    description: "Search the live web for any topic. Returns top results with titles, URLs, and descriptions. Use for current events, facts, prices, or anything needing up-to-date info.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_page",
    description: "Fetch and read the text content of any webpage URL. Use to read articles, docs, or product pages the user shares.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "Full URL of the page to read" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_wikipedia",
    description: "Get a Wikipedia summary for any topic, person, place, or concept.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "Topic to look up on Wikipedia" },
      },
      required: ["topic"],
    },
  },
  {
    name: "get_weather",
    description: "Get current weather and forecast for any city or location.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: "City name or location, e.g. 'New York' or 'London, UK'" },
      },
      required: ["location"],
    },
  },
  {
    name: "get_stock_price",
    description: "Get real-time stock price and change for a ticker symbol.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING, description: "Stock ticker symbol, e.g. AAPL, TSLA, MSFT" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "search_news",
    description: "Search for latest news articles on any topic.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "News topic or keywords to search" },
      },
      required: ["query"],
    },
  },
  {
    name: "currency_convert",
    description: "Convert an amount between currencies using live exchange rates.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        amount: { type: Type.NUMBER, description: "Amount to convert" },
        from_currency: { type: Type.STRING, description: "Source currency code, e.g. USD" },
        to_currency: { type: Type.STRING, description: "Target currency code, e.g. EUR" },
      },
      required: ["amount", "from_currency", "to_currency"],
    },
  },

  // ── Memory & Notes ─────────────────────────────────────────────────────────
  {
    name: "save_note",
    description: "Save a note or piece of information for the user to recall later.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: "The note content to save" },
        tag: { type: Type.STRING, description: "Optional tag/category, e.g. 'work', 'personal'" },
      },
      required: ["content"],
    },
  },
  {
    name: "get_notes",
    description: "Retrieve the user's saved notes, optionally filtered by tag.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        tag: { type: Type.STRING, description: "Optional tag to filter notes by" },
      },
    },
  },
  {
    name: "save_fact_about_me",
    description: "Remember a fact, preference, or personal detail about the user for future conversations.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fact: { type: Type.STRING, description: "The fact to remember" },
        category: { type: Type.STRING, description: "Category like 'preference', 'work', 'health', 'family'" },
      },
      required: ["fact"],
    },
  },
  {
    name: "get_facts_about_me",
    description: "Recall all facts and preferences saved about the user.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "create_list",
    description: "Create a named list (shopping, tasks, packing, etc.) with initial items.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "List name, e.g. 'Grocery list' or 'Weekend tasks'" },
        items: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Initial items for the list",
        },
      },
      required: ["name", "items"],
    },
  },
  {
    name: "get_list",
    description: "Retrieve a saved list by name.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the list to retrieve" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_list",
    description: "Add or remove an item from an existing list.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Name of the list to update" },
        operation: { type: Type.STRING, description: "'add' or 'remove'" },
        item: { type: Type.STRING, description: "Item to add or remove" },
      },
      required: ["name", "operation", "item"],
    },
  },

  // ── Communication ──────────────────────────────────────────────────────────
  {
    name: "send_email",
    description: "Send an email on behalf of the user. Use when user explicitly asks to send.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "Recipient email address" },
        subject: { type: Type.STRING, description: "Email subject line" },
        body: { type: Type.STRING, description: "Email body text" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "draft_email",
    description: "Draft an email and show it to the user before sending.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "Recipient email address" },
        subject: { type: Type.STRING, description: "Email subject line" },
        body: { type: Type.STRING, description: "Email body text" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "notify_phone",
    description: "Send a push notification to the user's phone via Pushover.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message: { type: Type.STRING, description: "Notification message" },
      },
      required: ["message"],
    },
  },

  // ── Files & Clipboard ──────────────────────────────────────────────────────
  {
    name: "write_clipboard",
    description: "Copy text to the user's clipboard.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: { type: Type.STRING, description: "Text to copy to clipboard" },
      },
      required: ["text"],
    },
  },
  {
    name: "download_file",
    description: "Generate and download a file with given content.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filename: { type: Type.STRING, description: "Filename with extension, e.g. 'plan.txt'" },
        content: { type: Type.STRING, description: "File content" },
        mimeType: { type: Type.STRING, description: "MIME type, e.g. 'text/plain'" },
      },
      required: ["filename", "content"],
    },
  },

  // ── Media & Creation ───────────────────────────────────────────────────────
  {
    name: "search_youtube",
    description: "Search YouTube for videos. Returns title, channel, videoId, url, and published date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "YouTube search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "play_youtube",
    description: "Play a YouTube video inside the app. Use when the user asks to watch or play a YouTube video, or when they confirm a result you already found.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query or exact video title to play." },
        video_id: { type: Type.STRING, description: "Specific YouTube video ID if already known." },
        url: { type: Type.STRING, description: "Specific YouTube watch URL if already known." },
        title: { type: Type.STRING, description: "Video title for display if already known." },
        channel: { type: Type.STRING, description: "Channel name for display if already known." },
      },
    },
  },
  {
    name: "generate_image",
    description: "Generate an image using DALL-E 3. Returns the image URL and displays it in the UI.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Detailed description of the image to generate" },
        size: { type: Type.STRING, description: "Image size: '1024x1024', '1792x1024', or '1024x1792'. Defaults to '1024x1024'." },
      },
      required: ["prompt"],
    },
  },

  // ── Smart Home ─────────────────────────────────────────────────────────────
  {
    name: "home_assistant_action",
    description: "Control Home Assistant devices and services. Examples: turn lights on/off, set thermostat, lock doors.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        service: { type: Type.STRING, description: "HA service in 'domain.service' format, e.g. 'light.turn_on', 'climate.set_temperature'" },
        entity_id: { type: Type.STRING, description: "Entity ID to control, e.g. 'light.living_room'" },
        data: { type: Type.STRING, description: "Optional JSON string of extra service data, e.g. '{\"brightness\": 128}'" },
      },
      required: ["service", "entity_id"],
    },
  },

  // ── Gmail ──────────────────────────────────────────────────────────────────
  {
    name: "read_gmail",
    description: "Read recent emails from the user's Gmail inbox.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        max_results: { type: Type.NUMBER, description: "Maximum number of emails to return (default 10)" },
        label: { type: Type.STRING, description: "Gmail label to filter by, e.g. 'INBOX', 'UNREAD', 'SENT'" },
      },
    },
  },
  {
    name: "search_gmail",
    description: "Search Gmail messages using Gmail search syntax.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Gmail search query, e.g. 'from:boss@company.com subject:report'" },
        max_results: { type: Type.NUMBER, description: "Maximum number of results to return (default 10)" },
      },
      required: ["query"],
    },
  },

  // ── Google Calendar ────────────────────────────────────────────────────────
  {
    name: "get_calendar_events",
    description: "Get upcoming events from the user's Google Calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        max_results: { type: Type.NUMBER, description: "Maximum number of events to return (default 10)" },
        days_ahead: { type: Type.NUMBER, description: "How many days ahead to look (default 7)" },
      },
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event in the user's Google Calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Event title/summary" },
        start_time: { type: Type.STRING, description: "Event start time in ISO 8601 format, e.g. '2024-01-15T10:00:00'" },
        end_time: { type: Type.STRING, description: "Event end time in ISO 8601 format, e.g. '2024-01-15T11:00:00'" },
        description: { type: Type.STRING, description: "Optional event description" },
        location: { type: Type.STRING, description: "Optional event location" },
      },
      required: ["title", "start_time", "end_time"],
    },
  },

  // ── Spotify ────────────────────────────────────────────────────────────────
  {
    name: "spotify_search",
    description: "Search Spotify for tracks, albums, artists, or playlists.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" },
        type: { type: Type.STRING, description: "Type to search: 'track', 'album', 'artist', 'playlist'. Defaults to 'track'" },
      },
      required: ["query"],
    },
  },
  {
    name: "spotify_play",
    description: "Search for a track/album/playlist on Spotify and start playing it.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "What to play, e.g. 'Bohemian Rhapsody' or 'Chill Vibes playlist'" },
        type: { type: Type.STRING, description: "Type to play: 'track', 'album', 'artist', 'playlist'. Defaults to 'track'" },
      },
      required: ["query"],
    },
  },
  {
    name: "spotify_control",
    description: "Control Spotify playback: pause, resume, next track, previous track, or set volume.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: "Command: 'pause', 'resume', 'next', 'previous', 'set_volume'" },
        volume: { type: Type.NUMBER, description: "Volume level 0-100 (only for set_volume command)" },
      },
      required: ["command"],
    },
  },

  // ── Home Operations (bills, subscriptions, household memory) ──────────────
  {
    name: "get_morning_brief",
    description: "Generate the user's Morning Home Brief: weather, today's calendar, bills due soon, flagged subscriptions, and unread inbox count. Use at the start of the day or when the user asks for a brief/recap.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: "City for weather. Optional — falls back to user's saved preference." },
      },
    },
  },
  {
    name: "add_bill",
    description: "Record a household bill (utility, rent, insurance, etc.).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        amount: { type: Type.NUMBER },
        currency: { type: Type.STRING, description: "ISO 4217 code, default USD" },
        due_date: { type: Type.STRING, description: "YYYY-MM-DD" },
        recurrence: { type: Type.STRING, description: "'monthly' | 'quarterly' | 'annual' | 'once'" },
        vendor: { type: Type.STRING },
        category: { type: Type.STRING },
        notes: { type: Type.STRING },
      },
      required: ["name"],
    },
  },
  {
    name: "get_bills",
    description: "List the user's bills, optionally filtered by status or a due-by date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: "'pending' | 'paid' | 'overdue' | 'skipped' | 'all'" },
        due_before: { type: Type.STRING, description: "YYYY-MM-DD — only return bills due on or before this date" },
      },
    },
  },
  {
    name: "mark_bill_paid",
    description: "Mark a bill as paid. Identify by id or name.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
      },
    },
  },
  {
    name: "add_subscription",
    description: "Record a recurring subscription (streaming, SaaS, membership).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        amount: { type: Type.NUMBER },
        currency: { type: Type.STRING },
        billing_cycle: { type: Type.STRING, description: "'monthly' | 'annual' | 'weekly'" },
        next_charge_date: { type: Type.STRING, description: "YYYY-MM-DD" },
        vendor: { type: Type.STRING },
        status: { type: Type.STRING, description: "'active' | 'trial' | 'cancel_pending' | 'canceled'" },
        notes: { type: Type.STRING },
      },
      required: ["name"],
    },
  },
  {
    name: "get_subscriptions",
    description: "List the user's subscriptions, optionally filtered by status or flagged-for-review.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING },
        flagged_only: { type: Type.BOOLEAN },
      },
    },
  },
  {
    name: "flag_subscription_for_cancel",
    description: "Flag a subscription for the user to review and cancel. Does NOT cancel it — cancellation requires user approval + an open_url to the vendor.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        name: { type: Type.STRING },
        reason: { type: Type.STRING },
      },
    },
  },
  {
    name: "scan_inbox_for_bills",
    description: "Scan recent Gmail for bills, receipts, and subscription renewals, and return candidates the user can confirm to add. Requires Google OAuth.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        days_back: { type: Type.NUMBER, description: "How many days of inbox to scan (default 30)" },
      },
    },
  },
  {
    name: "add_routine",
    description: "Save a recurring household routine (bedtime mode, trash day, weekly cleanup).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        schedule: { type: Type.STRING, description: "Natural-language schedule, e.g. 'every Sunday 9pm'" },
        steps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Ordered steps Eve should run or remind.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_routines",
    description: "List saved household routines.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "get_action_history",
    description: "Return Eve's recent actions with status (pending_approval, executed, failed). Use when the user asks what you did or for an activity log.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: "Max rows to return, default 20" },
        status: { type: Type.STRING, description: "Filter by status. Optional." },
      },
    },
  },
  {
    name: "confirm_pending_action",
    description: "Approve or deny a previously proposed risky action by its action-history id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action_id: { type: Type.STRING },
        decision: { type: Type.STRING, description: "'approve' | 'deny'" },
      },
      required: ["action_id", "decision"],
    },
  },
];
