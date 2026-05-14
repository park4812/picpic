import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, generateId } from '../supabase';
import { hashPassword } from '../crypto';

export default function Home() {
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || !password.trim()) return;
    setLoading(true);
    try {
      const id = generateId();
      const passwordHash = await hashPassword(password);
      const { error } = await supabase.from('posts').insert({ id, title: title || 'Untitled', password_hash: passwordHash });
      if (error) throw error;
      sessionStorage.setItem(`picpic_auth_${id}`, '1');
      navigate(`/p/${id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
      alert('게시물 생성에 실패했습니다. 다시 시도해주세요.');
    }
  };

  return (
    <div className="home">
      <div className="home-logo">PicPic</div>
      <div className="home-sub">인스타 이미지 셀렉 · 실시간 공유</div>
      <form className="home-form" onSubmit={handleSubmit}>
        <input
          className="home-input"
          type="text"
          placeholder="게시물 제목 (예: 5월 제주 여행)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <input
          className="home-input"
          type="password"
          placeholder="관리 비밀번호 (사진 추가/삭제용)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn-primary" type="submit" disabled={loading || !password.trim()}>
          {loading ? '생성 중...' : '새 게시물 만들기'}
        </button>
      </form>
      <Link to="/admin" className="home-admin-link">게시물 관리</Link>
      <footer className="home-footer">
        <a href="https://instagram.com/walk.and.look" target="_blank" rel="noopener noreferrer" className="home-insta">@walk.and.look</a>
        <span className="home-copyright">Made by walk.and.look · © 2026</span>
      </footer>
    </div>
  );
}
