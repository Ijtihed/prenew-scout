-- Shared by the crawler (Python) and the app (Node). Database file: data/scout.db

CREATE TABLE IF NOT EXISTS creators (
   id TEXT PRIMARY KEY,              -- e.g. yt-<channelId>
   platform TEXT NOT NULL,
   channel_id TEXT NOT NULL,
   handle TEXT NOT NULL,
   name TEXT NOT NULL,
   market TEXT NOT NULL,
   followers INTEGER NOT NULL,
   avatar TEXT,
   bio TEXT,
   email TEXT,
   agency TEXT,
   games TEXT NOT NULL,              -- JSON array
   past_partner INTEGER NOT NULL DEFAULT 0,
   first_seen TEXT NOT NULL,
   last_crawled TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
   id TEXT PRIMARY KEY,              -- platform video id
   creator_id TEXT NOT NULL REFERENCES creators(id),
   position INTEGER NOT NULL,        -- 0 = newest
   title TEXT NOT NULL,
   views INTEGER NOT NULL,
   likes INTEGER,
   comments INTEGER,
   date TEXT,
   updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_creator ON posts(creator_id, position);

-- One row per creator per day; growth comes from comparing these.
CREATE TABLE IF NOT EXISTS snapshots (
   creator_id TEXT NOT NULL REFERENCES creators(id),
   day TEXT NOT NULL,
   followers INTEGER NOT NULL,
   median_views INTEGER,
   PRIMARY KEY (creator_id, day)
);

-- Tracked-link clicks (/r/<slug>) and sales reported by the shop.
CREATE TABLE IF NOT EXISTS clicks (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   slug TEXT NOT NULL,
   at TEXT NOT NULL,
   referrer TEXT,
   user_agent TEXT
);
CREATE INDEX IF NOT EXISTS clicks_slug ON clicks(slug);

CREATE TABLE IF NOT EXISTS sales (
   order_id TEXT PRIMARY KEY,
   slug TEXT NOT NULL,
   amount REAL,
   pcs INTEGER NOT NULL DEFAULT 1,
   at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_slug ON sales(slug);

-- App state shared by the team (saved, outreach, AutoReach answers, settings).
CREATE TABLE IF NOT EXISTS kv (
   key TEXT PRIMARY KEY,
   value TEXT NOT NULL,
   updated_at TEXT NOT NULL
);

-- Every channel the crawler has seen, and how far it got. Makes crawls resumable and explainable.
CREATE TABLE IF NOT EXISTS frontier (
   channel_id TEXT PRIMARY KEY,
   name TEXT,
   source TEXT NOT NULL,             -- search | search-new | mention | seed | hashtag
   market_hint TEXT,
   hits INTEGER NOT NULL DEFAULT 1,  -- how many discovery results pointed here
   lang_votes TEXT NOT NULL DEFAULT '{}', -- JSON {fi: 3, sv: 0, ...} from result titles
   priority REAL NOT NULL DEFAULT 0,
   status TEXT NOT NULL DEFAULT 'new', -- new | rejected | qualified | error
   reason TEXT,
   discovered_at TEXT NOT NULL,
   checked_at TEXT,
   query TEXT                        -- the search that first found it
);
CREATE INDEX IF NOT EXISTS frontier_status ON frontier(status, priority DESC);

-- Each discovery query and what it yielded, to learn which searches pay off.
CREATE TABLE IF NOT EXISTS queries (
   query TEXT PRIMARY KEY,
   market TEXT NOT NULL,
   kind TEXT NOT NULL,
   results INTEGER,
   new_channels INTEGER,
   done_at TEXT,                     -- NULL = still queued
   url TEXT,
   prior REAL NOT NULL DEFAULT 1,
   qualified INTEGER NOT NULL DEFAULT 0
);

-- Autocomplete stems already expanded into queries.
CREATE TABLE IF NOT EXISTS stems (
   stem TEXT PRIMARY KEY,
   market TEXT NOT NULL,
   suggestions INTEGER,
   done_at TEXT
);

-- Emails "sent" from Scout. Kept here only; nothing is delivered to a real mailbox.
CREATE TABLE IF NOT EXISTS emails (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   creator_id TEXT NOT NULL,
   to_addr TEXT NOT NULL,
   cc TEXT,
   subject TEXT NOT NULL,
   body TEXT NOT NULL,
   at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS emails_creator ON emails(creator_id, at);

-- Comments sampled from a creator's recent Shorts: audience language and PC-buying questions.
CREATE TABLE IF NOT EXISTS comments (
   id TEXT PRIMARY KEY,
   creator_id TEXT NOT NULL,
   video_id TEXT NOT NULL,
   text TEXT NOT NULL,
   likes INTEGER,
   fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_creator ON comments(creator_id);

-- TikTok accounts to check, found through YouTube bios, handle matches and caption mentions.
CREATE TABLE IF NOT EXISTS tiktok_queue (
   handle TEXT PRIMARY KEY,
   source TEXT NOT NULL,             -- bio | guess | mention
   market_hint TEXT,
   linked TEXT,                      -- the YouTube creator id this account belongs to, if any
   status TEXT NOT NULL DEFAULT 'new',
   reason TEXT,
   checked_at TEXT
);
