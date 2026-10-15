ALTER TABLE agent_messages ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json));
