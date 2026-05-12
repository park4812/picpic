import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { hashPassword } from '../crypto';

export default function Admin() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const loadPosts = async () => {
    const { data: postsData } = await supabase
      .from('posts').select('id, title, created_at').order('created_at', { ascending: false });

    if (!postsData) { setLoading(false); return; }

    const withCounts = await Promise.all(
      postsData.map(async (post) => {
        const { count: imageCount } = await supabase
          .from('images').select('*', { count: 'exact', head: true }).eq('post_id', post.id);
        const { count: selectionCount } = await supabase
          .from('selections').select('*', { count: 'exact', head: true }).eq('post_id', post.id);
        return { ...post, imageCount: imageCount || 0, selectionCount: selectionCount || 0 };
      })
    );

    setPosts(withCounts);
    setLoading(false);
  };

  useEffect(() => { loadPosts(); }, []);

  const handleDelete = async (e) => {
    e.preventDefault();
    if (!deleteTarget || !passwordInput.trim()) return;
    setDeleting(true);

    try {
      const hash = await hashPassword(passwordInput);
      const { data: images } = await supabase
        .from('images').select('storage_path').eq('post_id', deleteTarget.id);

      const { data: success } = await supabase.rpc('delete_post_with_password', {
        p_post_id: deleteTarget.id,
        p_password_hash: hash,
      });

      if (!success) {
        showToast('비밀번호가 틀렸습니다');
        setDeleting(false);
        return;
      }

      if (images?.length) {
        const paths = images.map((img) => img.storage_path);
        await supabase.storage.from('post-images').remove(paths);
      }

      setPosts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setPasswordInput('');
      showToast('게시물 삭제 완료');
    } catch {
      showToast('삭제 실패');
    }

    setDeleting(false);
  };

  if (loading) return <div className="loading"><div className="spinner" />로딩 중...</div>;

  return (
    <div className="admin-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '20px' }}>←</Link>
        <div className="post-title">게시물 관리</div>
        <div style={{ width: '28px' }} />
      </header>

      <div className="admin-list">
        {posts.length === 0 ? (
          <div className="selection-empty" style={{ minHeight: '200px' }}>
            아직 게시물이 없습니다
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="admin-item">
              <Link to={`/p/${post.id}`} className="admin-item-info">
                <div className="admin-item-title">{post.title}</div>
                <div className="admin-item-meta">
                  {new Date(post.created_at).toLocaleDateString('ko-KR')} · 사진 {post.imageCount}장 · 셀렉 {post.selectionCount}장
                </div>
              </Link>
              <button className="admin-delete-btn" onClick={() => { setDeleteTarget(post); setPasswordInput(''); }}>
                삭제
              </button>
            </div>
          ))
        )}
      </div>

      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleDelete}>
            <div className="modal-title">게시물 삭제</div>
            <div className="modal-desc">
              "{deleteTarget.title}"을 삭제합니다.<br />
              모든 이미지와 셀렉 데이터가 영구 삭제됩니다.
            </div>
            <input
              className="home-input"
              type="password"
              placeholder="게시물 비밀번호"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="submit" className="btn-danger" disabled={!passwordInput.trim() || deleting}>
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
