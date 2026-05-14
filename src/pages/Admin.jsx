import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import { hashPassword } from '../crypto';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

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
  return formatDate(dateStr);
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [adminHash, setAdminHash] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('has_admin_password');
      setHasPassword(data);
      setLoading(false);
    })();
  }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    const hash = await hashPassword(passwordInput);
    const { data } = await supabase.rpc('set_admin_password', { p_hash: hash });
    if (data) {
      setAdminHash(hash);
      setAuthed(true);
      setPasswordInput('');
      loadPosts();
    } else {
      showToast('이미 설정된 비밀번호가 있습니다');
      setHasPassword(true);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    const hash = await hashPassword(passwordInput);
    const { data } = await supabase.rpc('verify_admin_password', { p_hash: hash });
    if (data) {
      setAdminHash(hash);
      setAuthed(true);
      setPasswordInput('');
      loadPosts();
    } else {
      showToast('비밀번호가 틀렸습니다');
    }
  };

  const loadPosts = async () => {
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (postsErr) { console.error('loadPosts error', postsErr); return; }

    if (!postsData) return;

    const withStats = await Promise.all(
      postsData.map(async (post) => {
        const [
          { count: imageCount },
          { count: selectionCount },
          { data: latestImg },
        ] = await Promise.all([
          supabase.from('images').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          supabase.from('selections').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          supabase.from('images').select('created_at').eq('post_id', post.id).order('created_at', { ascending: false }).limit(1),
        ]);
        return {
          ...post,
          imageCount: imageCount || 0,
          selectionCount: selectionCount || 0,
          lastImageAt: latestImg?.[0]?.created_at || null,
        };
      })
    );
    setPosts(withStats);
  };

  const handleDelete = async (post) => {
    setDeleteTarget(post);
    setDeleting(true);

    try {
      const { data: images } = await supabase
        .from('images').select('storage_path').eq('post_id', post.id);

      const { data: success } = await supabase.rpc('admin_delete_post', {
        p_post_id: post.id,
        p_admin_hash: adminHash,
      });

      if (!success) {
        showToast('삭제 실패');
        setDeleting(false);
        setDeleteTarget(null);
        return;
      }

      if (images?.length) {
        await supabase.storage.from('post-images').remove(images.map((img) => img.storage_path));
      }

      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      showToast('게시물 삭제 완료');
    } catch {
      showToast('삭제 실패');
    }

    setDeleting(false);
    setDeleteTarget(null);
  };

  if (loading) return <div className="loading"><div className="spinner" />로딩 중...</div>;

  if (!authed) {
    const isSetup = hasPassword === false;
    return (
      <div className="home">
        <div className="home-logo">PicPic</div>
        <div className="home-sub">{isSetup ? '관리자 비밀번호를 설정해주세요' : '관리자 비밀번호를 입력해주세요'}</div>
        <form className="home-form" onSubmit={isSetup ? handleSetPassword : handleLogin}>
          <input
            className="home-input"
            type="password"
            placeholder={isSetup ? '새 관리자 비밀번호' : '관리자 비밀번호'}
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={!passwordInput.trim()}>
            {isSetup ? '설정 완료' : '로그인'}
          </button>
          <Link to="/" className="home-admin-link">← 홈으로</Link>
        </form>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="post-header">
        <Link to="/" style={{ color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', padding: '8px', marginLeft: '-8px' }} aria-label="홈으로">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </Link>
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
                <div className="admin-item-creator">
                  {post.creator_email
                    ? post.creator_email
                    : post.user_id
                      ? '계정 연결됨'
                      : '비회원 (비밀번호)'}
                </div>
                <div className="admin-item-counts">
                  사진 {post.imageCount}장 · 셀렉 {post.selectionCount}장
                </div>
                <div className="admin-item-dates">
                  <span>생성 {formatDate(post.created_at)}</span>
                  <span>사진 {post.lastImageAt ? relativeDate(post.lastImageAt) : '없음'}</span>
                  <span>접속 {post.last_accessed_at ? relativeDate(post.last_accessed_at) : '없음'}</span>
                </div>
              </Link>
              <button
                className="admin-delete-btn"
                disabled={deleting && deleteTarget?.id === post.id}
                onClick={() => {
                  if (confirm(`"${post.title}" 게시물을 삭제할까요?\n모든 이미지가 영구 삭제됩니다.`)) {
                    handleDelete(post);
                  }
                }}
              >
                {deleting && deleteTarget?.id === post.id ? '삭제 중' : '삭제'}
              </button>
            </div>
          ))
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
