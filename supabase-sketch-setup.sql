-- ===== PicPic AI 스케치 시안 Setup =====
-- Supabase SQL Editor에서 실행 (Dashboard → SQL Editor → New query)
-- 기존 supabase-setup.sql 실행 후 추가로 실행하세요.

-- 스케치 보드 (링크로 공유되는 시안 모음)
CREATE TABLE sketch_boards (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '촬영 시안',
  created_at timestamptz DEFAULT now()
);

-- 저장된 시안
CREATE TABLE sketches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id text REFERENCES sketch_boards(id) ON DELETE CASCADE NOT NULL,
  storage_path text NOT NULL,
  prompt text,
  preset text,
  strength real,
  seed bigint,
  created_at timestamptz DEFAULT now()
);

-- RLS (링크를 아는 사람은 누구나 참여 — 기존 posts와 동일 정책)
ALTER TABLE sketch_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sketches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_sketch_boards" ON sketch_boards FOR SELECT USING (true);
CREATE POLICY "public_create_sketch_boards" ON sketch_boards FOR INSERT WITH CHECK (true);

CREATE POLICY "public_read_sketches" ON sketches FOR SELECT USING (true);
CREATE POLICY "public_create_sketches" ON sketches FOR INSERT WITH CHECK (true);
CREATE POLICY "public_delete_sketches" ON sketches FOR DELETE USING (true);

-- 기기 간 실시간 동기화
ALTER PUBLICATION supabase_realtime ADD TABLE sketches;

-- 이미지는 기존 post-images 버킷의 sketches/ 경로를 재사용 (추가 설정 불필요)
