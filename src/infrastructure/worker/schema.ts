/**
 * Design Ref: §3.3 — 방 DO 내장 SQLite 스키마.
 *
 * NOTE: 설계 문서 §11.1은 `schema.sql`로 적었지만, Workers 번들러에 SQL 로더가 없어
 * TypeScript 문자열 상수로 둔다. 내용은 설계 문서와 동일하다.
 *
 * 방 1개 = DO 1개라서 이 스키마 전체가 한 방의 데이터다.
 * `room` 테이블은 `CHECK (id = 1)`로 1행만 허용한다.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS room (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  code             TEXT    NOT NULL,
  name             TEXT    NOT NULL,
  host_member_id   TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'active',
  created_at       INTEGER NOT NULL,
  ended_at         INTEGER,
  last_activity_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member (
  id            TEXT    PRIMARY KEY,
  display_name  TEXT    NOT NULL,
  normalized    TEXT    NOT NULL UNIQUE,
  joined_at     INTEGER NOT NULL,
  has_device    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS member_device (
  device_id     TEXT    PRIMARY KEY,
  member_id     TEXT    NOT NULL REFERENCES member(id),
  ua_label      TEXT,
  linked_at     INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_device_member ON member_device (member_id);

CREATE TABLE IF NOT EXISTS species (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  normalized  TEXT    NOT NULL UNIQUE,
  created_by  TEXT    NOT NULL REFERENCES member(id),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS member_species (
  member_id   TEXT    NOT NULL REFERENCES member(id),
  species_id  TEXT    NOT NULL REFERENCES species(id),
  sort_order  INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, species_id)
);

CREATE TABLE IF NOT EXISTS catch_event (
  id              TEXT    PRIMARY KEY,
  member_id       TEXT    NOT NULL REFERENCES member(id),
  species_id      TEXT    NOT NULL REFERENCES species(id),
  caught_at       INTEGER NOT NULL,
  received_at     INTEGER NOT NULL,
  voided_at       INTEGER,
  void_action_id  TEXT    UNIQUE,
  entered_by      TEXT    NOT NULL REFERENCES member(id),
  voided_by       TEXT    REFERENCES member(id)
);
CREATE INDEX IF NOT EXISTS ix_catch_active
  ON catch_event (member_id, species_id, voided_at, caught_at);
CREATE INDEX IF NOT EXISTS ix_catch_time
  ON catch_event (voided_at, caught_at);
`;
