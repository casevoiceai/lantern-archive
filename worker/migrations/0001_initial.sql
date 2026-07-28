PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
  school_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generations_used_this_period INTEGER NOT NULL DEFAULT 0,
  period_reset_at TEXT NOT NULL
);

CREATE TABLE entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  town_name TEXT NOT NULL,
  era_or_industry TEXT NOT NULL,
  known_detail_1 TEXT NOT NULL,
  known_detail_2 TEXT,
  local_legend TEXT,
  injustice_focus TEXT,
  generated_content TEXT NOT NULL,
  tier_at_generation TEXT NOT NULL CHECK (tier_at_generation IN ('free', 'paid')),
  semester_id TEXT,
  shared_to_community INTEGER NOT NULL DEFAULT 0 CHECK (shared_to_community IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE flagged_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER,
  flagged_term TEXT NOT NULL,
  raw_output_snippet TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE SET NULL
);

CREATE TABLE blocked_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_entities_account_created ON entities(account_id, created_at DESC);
CREATE INDEX idx_entities_semester ON entities(account_id, semester_id);
CREATE INDEX idx_flagged_reviewed ON flagged_outputs(reviewed, created_at DESC);
CREATE INDEX idx_blocked_active ON blocked_terms(active);

INSERT INTO blocked_terms (term) VALUES
('Forgotten Realms'),('Waterdeep'),('Baldur''s Gate'),('Neverwinter'),('Underdark'),
('beholder'),('mind flayer'),('illithid'),('owlbear'),('displacer beast'),
('gelatinous cube'),('umber hulk'),('bulette'),('githyanki'),('githzerai'),
('Strahd'),('Ravenloft'),('Vecna'),('Mordenkainen'),('Tasha'),('Elminster'),
('magic missile'),('fireball'),('Melf''s acid arrow'),('Bigby''s hand'),
('Tenser''s floating disk'),('Leomund''s tiny hut'),('Otto''s irresistible dance'),
('Dungeons & Dragons'),('D&D');
