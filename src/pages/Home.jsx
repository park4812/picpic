import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, generateId } from '../supabase';
import { hashPassword } from '../crypto';
import { useAuth } from '../auth';

export default function Home() {
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!title.trim()) return;
    if (!user && !password.trim()) return;
    setLoading(true);
    try {
      const id = generateId();
      const row = { id, title: title.trim() };
      if (user) {
        row.user_id = user.id;
        row.creator_email = user.email;
      } else {
        row.password_hash = await hashPassword(password);
      }
      const { error } = await supabase.from('posts').insert(row);
      if (error) throw error;
      sessionStorage.setItem(`picpic_auth_${id}`, '1');
      navigate(`/p/${id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
      showToast('게시물 생성에 실패했습니다');
    }
  };

  const canSubmit = title.trim() && (user ? true : password.trim());

  // Auth still loading
  if (user === undefined) {
    return <div className="home"><div className="home-logo">PicPic</div></div>;
  }

  return (
    <div className="home">
      {/* Auth bar */}
      <div className="home-auth-bar">
        {user ? (
          <>
            <span className="home-auth-email">{user.email}</span>
            <button className="home-auth-btn" onClick={signOut}>로그아웃</button>
          </>
        ) : (
          <Link to="/login" className="home-auth-btn">로그인</Link>
        )}
      </div>

      <div className="home-logo">PicPic</div>
      <div className="home-sub">인스타 이미지 셀렉 · 실시간 공유</div>

      <form className="home-form" onSubmit={handleSubmit}>
        <input
          className="home-input"
          type="text"
          placeholder="게시물 제목 (예: 5월 제주 여행)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus={window.matchMedia('(hover: hover)').matches}
        />
        {!user && (
          <input
            className="home-input"
            type="password"
            placeholder="관리 비밀번호 (사진 추가/삭제용)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
        {user && (
          <div className="home-login-notice">로그인 상태 — 비밀번호 없이 내 계정으로 관리됩니다</div>
        )}
        <button className="btn-primary" type="submit" disabled={loading || !canSubmit}>
          {loading ? '생성 중...' : '새 게시물 만들기'}
        </button>
      </form>

      {/* 로그인 시 내 관리 메뉴 */}
      {user && (
        <div className="home-menu">
          <Link to="/my-posts" className="home-menu-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            내 게시물
          </Link>
          <Link to="/my-pamphlets" className="home-menu-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            내 팜플렛
          </Link>
          <Link to="/recruit" className="home-menu-item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            새 팜플렛
          </Link>
        </div>
      )}

      {/* 비로그인 시 팜플렛 링크 */}
      {!user && (
        <div className="home-links-row">
          <Link to="/login" className="home-recruit-link">로그인하고 관리하기</Link>
        </div>
      )}

      <footer className="home-footer">
        <a href="https://instagram.com/walk.and.look" target="_blank" rel="noopener noreferrer" className="home-insta">@walk.and.look</a>
        <span className="home-copyright">Made by walk.and.look · © 2026</span>
        <Link to="/admin" className="home-admin-login">관리자 로그인</Link>
      </footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
