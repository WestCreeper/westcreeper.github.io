CREATE TABLE entry_reactions (
 entry_id INTEGER NOT NULL REFERENCES entries(id),
 identity_id INTEGER NOT NULL REFERENCES identities(id),
 reaction TEXT NOT NULL CHECK(reaction IN ('like','love','laugh','wow','clap','fire')),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(entry_id,identity_id)
);
CREATE INDEX reaction_identity ON entry_reactions(identity_id);
