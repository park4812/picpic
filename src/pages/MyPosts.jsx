import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

function relativeDate(dateStr) {
  if (!dateStr) return '없음';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function MyPosts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === null) { navigate('/login?redirect=/my-posts'); return; }
    if (user === undefined) return;
    loadPosts();
  }, [user]);

  const loadPosts = async () => {
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (postsErr) { console.error('loadPosts error', postsErr); setLoading(false); return; }
    if (!postsData) { setLoading(false); return; }

    const withStats = await Promise.all(
      postsData.map(async (post) => {
        const [{ count: imageCount }, { count: selectionCount }] = await Promise.all([
          supabase.from('images').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          supabase.from('selections').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
        ]);
        return { ...post, imageCount: imageCount || 0, selectionCount: selectionCount || 0 };
      })
    );
    setPosts(withStats);
    setLoading(false);
  };

  if (user === undefined || loading) {
    return <div className="loading"><div className="spinner" />불러오는 중...</div>;
  }

  return (
    <div className="admin-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </Link>
        <div className="post-title">내 게시물</div>
        <div style={{ width: 28 }} />
      </header>

      <div className="admin-list">
        {posts.length === 0 ? (
          <div className="pam-empty">
            <span style={{ fontSize: 40, marginBottom: 12 }}>📷</span>
            <p>내 계정에 연결된 게시물이 없어요</p>
            <Link to="/" className="btn-primary" style={{ marginTop: 16, textDecoration: 'none', display: 'inline-block' }}>새 게시물 만들기</Link>
          </div>
        ) : (
          posts.map((post) => (
            <Link key={post.id} to={`/p/${post.id}`} className="admin-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="admin-item-info">
                <div className="admin-item-title">{post.title}</div>
                <div className="admin-item-counts">
                  사진 {post.imageCount}장 · 셀렉 {post.selectionCount}장
                </div>
                <div className="admin-item-dates">
                  <span>생성 {relativeDate(post.created_at)}</span>
                  <span>접속 {relativeDate(post.last_accessed_at)}</span>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
