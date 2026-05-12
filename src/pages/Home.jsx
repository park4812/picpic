import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, generateId } from '../supabase';
import { getUid } from '../uid';

export default function Home() {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const id = generateId();
      const { error } = await supabase.from('posts').insert({ id, title: title || 'Untitled', created_by: getUid() });
      if (error) throw error;
      navigate(`/p/${id}`);
    } catch {
      setLoading(false);
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
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '생성 중...' : '새 게시물 만들기'}
        </button>
      </form>
    </div>
  );
}
