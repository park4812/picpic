-- ===== PicPic Supabase Setup =====
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Posts table
CREATE TABLE posts (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT 'Untitled',
  created_at timestamptz DEFAULT now()
);

-- Images table
CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Selections table
CREATE TABLE selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id text REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  image_id uuid REFERENCES images(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, image_id)
);

-- Enable RLS (public access - anyone with the link can participate)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_posts" ON posts FOR SELECT USING (true);
CREATE POLICY "public_create_posts" ON posts FOR INSERT WITH CHECK (true);

CREATE POLICY "public_read_images" ON images FOR SELECT USING (true);
CREATE POLICY "public_create_images" ON images FOR INSERT WITH CHECK (true);
CREATE POLICY "public_delete_images" ON images FOR DELETE USING (true);

CREATE POLICY "public_read_selections" ON selections FOR SELECT USING (true);
CREATE POLICY "public_create_selections" ON selections FOR INSERT WITH CHECK (true);
CREATE POLICY "public_update_selections" ON selections FOR UPDATE USING (true);
CREATE POLICY "public_delete_selections" ON selections FOR DELETE USING (true);

-- Enable Realtime on images and selections
ALTER PUBLICATION supabase_realtime ADD TABLE images;
ALTER PUBLICATION supabase_realtime ADD TABLE selections;

-- Storage bucket for images
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true);

CREATE POLICY "public_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'post-images');
CREATE POLICY "public_read" ON storage.objects FOR SELECT USING (bucket_id = 'post-images');
CREATE POLICY "public_delete" ON storage.objects FOR DELETE USING (bucket_id = 'post-images');

-- RPC: atomic reorder
CREATE OR REPLACE FUNCTION reorder_selection(
  p_post_id text,
  p_image_id uuid,
  p_new_position integer
) RETURNS void AS $$
DECLARE
  v_old_position integer;
  v_selection_id uuid;
BEGIN
  SELECT id, position INTO v_selection_id, v_old_position
  FROM selections WHERE post_id = p_post_id AND image_id = p_image_id;

  IF v_old_position IS NULL OR v_old_position = p_new_position THEN RETURN; END IF;

  IF p_new_position > v_old_position THEN
    UPDATE selections SET position = position - 1
    WHERE post_id = p_post_id AND position > v_old_position AND position <= p_new_position;
  ELSE
    UPDATE selections SET position = position + 1
    WHERE post_id = p_post_id AND position >= p_new_position AND position < v_old_position;
  END IF;

  UPDATE selections SET position = p_new_position WHERE id = v_selection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: atomic deselect (delete + reorder remaining)
CREATE OR REPLACE FUNCTION deselect_image(
  p_post_id text,
  p_image_id uuid
) RETURNS void AS $$
DECLARE
  v_position integer;
BEGIN
  SELECT position INTO v_position
  FROM selections WHERE post_id = p_post_id AND image_id = p_image_id;

  IF v_position IS NULL THEN RETURN; END IF;

  DELETE FROM selections WHERE post_id = p_post_id AND image_id = p_image_id;

  UPDATE selections SET position = position - 1
  WHERE post_id = p_post_id AND position > v_position;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
