const BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

export async function createPost(title) {
  const res = await fetch(`${BASE}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function getPost(id) {
  const res = await fetch(`${BASE}/api/posts/${id}`);
  if (!res.ok) return null;
  return res.json();
}

export async function uploadImages(postId, files) {
  const form = new FormData();
  for (const file of files) {
    form.append('images', file);
  }
  const res = await fetch(`${BASE}/api/posts/${postId}/images`, {
    method: 'POST',
    body: form,
  });
  return res.json();
}

export async function deleteImage(postId, imageId) {
  const res = await fetch(`${BASE}/api/posts/${postId}/images/${imageId}`, {
    method: 'DELETE',
  });
  return res.json();
}

export function imageUrl(filename) {
  return `${BASE}/uploads/${filename}`;
}
