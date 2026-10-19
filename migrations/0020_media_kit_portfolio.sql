ALTER TABLE media_kits ADD COLUMN portfolio_url TEXT NOT NULL DEFAULT '';
ALTER TABLE media_kits ADD COLUMN portfolio_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(portfolio_json));
